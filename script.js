// Inisialisasi Web Audio API
let audioCtx = null;
let isPlaying = false;
let currentStep = 0;
let bpm = 76;
let timerID = null;
let autoScrollInterval = null;
let isAutoScrolling = false;

// Data Kunci Gitar lagu Kangen (Fret dari senar 6 ke 1 & Frekuensi nada)
const chordData = {
    'D':   { frets: 'x x 0 2 3 2', notes: [146.83, 220.00, 293.66, 369.99] },
    'Bm':  { frets: 'x 2 4 4 3 2', notes: [123.47, 185.00, 246.94, 293.66, 369.99] },
    'G':   { frets: '3 2 0 0 3 3', notes: [98.00, 123.47, 146.83, 196.00, 293.66, 392.00] },
    'A':   { frets: 'x 0 2 2 2 0', notes: [110.00, 164.81, 220.00, 277.18, 329.63] },
    'Em':  { frets: '0 2 2 0 0 0', notes: [82.41, 123.47, 164.81, 196.00, 246.94, 329.63] },
    'F#m': { frets: '2 4 4 2 2 2', notes: [92.50, 138.59, 185.00, 220.00, 277.18, 369.99] }
};

// Elemen DOM
const playBtn = document.getElementById('playDrumBtn');
const stopBtn = document.getElementById('stopDrumBtn');
const bpmSlider = document.getElementById('bpmSlider');
const bpmValue = document.getElementById('bpmValue');
const beatDots = document.querySelectorAll('.beat-dot');
const autoScrollBtn = document.getElementById('autoScrollBtn');
const chordCardsContainer = document.getElementById('chordCardsContainer');

// Pastikan AudioContext aktif saat interaksi pengguna
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// ================= SYNTHESIZER DRUM =================

function playKick(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.45);

    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.45);

    osc.start(time);
    osc.stop(time + 0.45);
}

function playSnare(time) {
    // Noise untuk suara snare
    const bufferSize = audioCtx.sampleRate * 0.25;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    // Body tone snare
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    noise.start(time);
    osc.start(time);
    osc.stop(time + 0.2);
}

function playHiHat(time, isOpen = false) {
    const duration = isOpen ? 0.25 : 0.06;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start(time);
}

// Pola Beat Drum 8-Step (1 bar = 8 ketukan seperdelapan)
// Pola Pop Ballad "Kangen": Kick di 1, 2&, 3 | Snare di 2, 4 | Hi-hat di semua step
function triggerDrumStep(step) {
    const now = audioCtx.currentTime;

    // Hi-Hat bermain konstan setiap 1/8 note
    playHiHat(now, step === 7);

    // Kick Drum (Step 0 = ketukan 1, Step 3 = ketukan 2&, Step 4 = ketukan 3)
    if (step === 0 || step === 3 || step === 4) {
        playKick(now);
    }

    // Snare Drum (Step 2 = ketukan 2, Step 6 = ketukan 4)
    if (step === 2 || step === 6) {
        playSnare(now);
    }

    // Update Visual Dot
    beatDots.forEach((dot, idx) => {
        dot.classList.remove('active', 'snare-hit');
        if (idx === step) {
            dot.classList.add('active');
            if (step === 2 || step === 6) {
                dot.classList.add('snare-hit');
            }
        }
    });
}

function startDrumLoop() {
    initAudio();
    if (isPlaying) return;
    isPlaying = true;
    currentStep = 0;

    playBtn.disabled = true;
    stopBtn.disabled = false;

    const stepInterval = () => {
        if (!isPlaying) return;
        triggerDrumStep(currentStep);
        currentStep = (currentStep + 1) % 8;
        
        // 1 ketukan 1/8 = (60 / BPM) / 2 detik
        const intervalMs = ((60 / bpm) / 2) * 1000;
        timerID = setTimeout(stepInterval, intervalMs);
    };

    stepInterval();
}

function stopDrumLoop() {
    isPlaying = false;
    clearTimeout(timerID);
    playBtn.disabled = false;
    stopBtn.disabled = true;
    beatDots.forEach(dot => dot.classList.remove('active', 'snare-hit'));
}

// ================= SYNTHESIZER GITAR =================

function playGuitarChord(chordName) {
    initAudio();
    const chord = chordData[chordName];
    if (!chord) return;

    const now = audioCtx.currentTime;
    
    // Efek genjrengan (strum) dengan jeda 35ms antar senar
    chord.notes.forEach((freq, index) => {
        const startTime = now + (index * 0.035);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        // Gelombang triangle/sawtooth untuk karakter akustik/elektrik bersih
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, startTime);
        filter.frequency.exponentialRampToValueAtTime(400, startTime + 1.5);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.22, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + 1.85);
    });
}

// ================= UI & EVENT LISTENERS =================

// Render Kartu Diagram Chord di bagian atas
function renderChordCards() {
    Object.keys(chordData).forEach(chordName => {
        const card = document.createElement('div');
        card.className = 'chord-card';
        card.innerHTML = `
            <span class="chord-name">${chordName}</span>
            <span class="chord-frets">${chordData[chordName].frets}</span>
        `;
        card.addEventListener('click', () => playGuitarChord(chordName));
        chordCardsContainer.appendChild(card);
    });
}

// Tambahkan event klik pada semua tulisan chord di dalam lirik
document.querySelectorAll('.chord').forEach(el => {
    el.addEventListener('click', () => {
        const chordName = el.textContent.trim();
        playGuitarChord(chordName);
    });
});

// Kontrol Tombol Drum & BPM
playBtn.addEventListener('click', startDrumLoop);
stopBtn.addEventListener('click', stopDrumLoop);

bpmSlider.addEventListener('input', (e) => {
    bpm = parseInt(e.target.value, 10);
    bpmValue.textContent = bpm;
});

// Fitur Auto-Scroll Lirik
autoScrollBtn.addEventListener('click', () => {
    isAutoScrolling = !isAutoScrolling;
    if (isAutoScrolling) {
        autoScrollBtn.textContent = '⬇ Auto Scroll: ON';
        autoScrollBtn.classList.add('active');
        autoScrollInterval = setInterval(() => {
            window.scrollBy({ top: 1, behavior: 'smooth' });
        }, 65);
    } else {
        autoScrollBtn.textContent = '⬇ Auto Scroll: OFF';
        autoScrollBtn.classList.remove('active');
        clearInterval(autoScrollInterval);
    }
});

// Jalankan inisialisasi tampilan
renderChordCards();
