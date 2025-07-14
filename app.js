window.AudioContext = window.AudioContext || window.webkitAudioContext;
let ctx;
const startButton = document.querySelector('button');
const oscillators = {};

// Map keyboard keys to MIDI notes (example: C4 to B4)
const keyboardToMidiMap = {
    'a': 60, // C4
    'w': 61, // C#4
    's': 62, // D4
    'e': 63, // D#4
    'd': 64, // E4
    'f': 65, // F4
    't': 66, // F#4
    'g': 67, // G4
    'y': 68, // G#4
    'h': 69, // A4
    'u': 70, // A#4
    'j': 71, // B4
    'k': 72, // C5 (next octave)
    // Add more keys for more octaves or different layouts
    // Example for lower octave (C3 to B3)
    'z': 48, // C3
    'x': 50, // D3
    'c': 52, // E3
    'v': 53, // F3
    'b': 55, // G3
    'n': 57, // A3
    'm': 59, // B3
};

// Keep track of currently pressed keys to avoid re-triggering notes on key hold
const pressedKeys = new Set();


startButton.addEventListener('click', () => {
    if (!ctx) {
        ctx = new AudioContext();
        console.log("AudioContext created.");
    }
});

function midiToFreq(number) {
    const a = 440;
    return (a / 32) * (2 ** ((number - 9) / 12));
}

// --- Keyboard Input Handlers ---
document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); // Get the key pressed, convert to lowercase for consistent mapping

    // Prevent default browser behavior for some keys if needed (e.g., spacebar scrolling)
    // if (key === ' ' || keyboardToMidiMap[key]) {
    //     event.preventDefault();
    // }

    // Check if the key is in our mapping and hasn't been pressed yet (to avoid repeats)
    if (keyboardToMidiMap[key] !== undefined && !pressedKeys.has(key)) {
        if (!ctx || ctx.state === 'suspended') {
            console.warn("AudioContext is not running. Click the 'Start Audio' button first.");
            return;
        }

        const note = keyboardToMidiMap[key];
        const velocity = 100; // You can set a default velocity for keyboard input
        noteOn(note, velocity);
        pressedKeys.add(key); // Mark the key as pressed
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();

    // Check if the key is in our mapping and was previously marked as pressed
    if (keyboardToMidiMap[key] !== undefined && pressedKeys.has(key)) {
        const note = keyboardToMidiMap[key];
        noteOff(note);
        pressedKeys.delete(key); // Mark the key as released
    }
});
// --- End Keyboard Input Handlers ---


// Your existing MIDI functions can remain, but they won't be used for keyboard input
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(success, failure);
}

function success(MIDIAccess) {
    console.log("MIDI Access granted:", MIDIAccess);
    MIDIAccess.onstatechange = updateDevices;

    const inputs = MIDIAccess.inputs;
    console.log("MIDI Inputs:", inputs);
    inputs.forEach((input) => {
        console.log("Attaching listener to MIDI input:", input);
        input.onmidimessage = handleInput;
    });
}

function handleInput(event) {
    // This function will only be called by MIDI devices, not your computer keyboard
    const command = event.data[0];
    const note = event.data[1];
    const velocity = event.data[2];

    if (!ctx || ctx.state === 'suspended') {
        console.warn("AudioContext is not running. Click the 'Start Audio' button first.");
        return;
    }

    switch (command) {
        case 144: // Note On
            if (velocity > 0) {
                noteOn(note, velocity);
            } else {
                noteOff(note);
            }
            break;
        case 128: // Note Off
            noteOff(note);
            break;
    }
}

function noteOn(note, velocity) {
    if (oscillators[note.toString()]) {
        noteOff(note); // Stop previous instance if still playing
    }

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.33;

    const velocityGainAmount = (1 / 127) * velocity;
    const velocityGain = ctx.createGain();
    velocityGain.gain.value = velocityGainAmount;

    osc.type = 'sine'; // You could make this configurable (sine, square, sawtooth, triangle)
    osc.frequency.value = midiToFreq(note);

    osc.connect(oscGain);
    oscGain.connect(velocityGain);
    velocityGain.connect(ctx.destination);

    oscillators[note.toString()] = {
        oscillator: osc,
        gainNode: oscGain
    };

    console.log(`Note On: MIDI ${note} (${midiToFreq(note).toFixed(2)} Hz), Velocity ${velocity}`);
    osc.start();
}

function noteOff(note) {
    const noteData = oscillators[note.toString()];

    if (!noteData) {
        console.warn(`Note ${note} is not currently playing (noteOff called without corresponding noteOn).`);
        return;
    }

    const osc = noteData.oscillator;
    const oscGain = noteData.gainNode;

    oscGain.gain.cancelScheduledValues(ctx.currentTime); // Clear any pending ramps
    oscGain.gain.setValueAtTime(oscGain.gain.value, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    setTimeout(() => {
        if (osc) { // Ensure osc still exists before stopping/disconnecting
            osc.stop();
            osc.disconnect();
        }
        if (oscGain) {
            oscGain.disconnect();
        }
        delete oscillators[note.toString()];
        console.log(`Note Off: MIDI ${note}`);
    }, 50);
}

function updateDevices(event) {
    console.log("MIDI State Change Event:", event);
    console.log(`Name: ${event.port.name}, Brand: ${event.port.manufacturer}, State: ${event.port.state}, Type: ${event.port.type}`);
}

function failure() {
    console.error('Could not connect MIDI. Please ensure you have a MIDI device connected and grant permission.');
}