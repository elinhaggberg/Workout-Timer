// Tones are synthesized as short WAV clips and played through real <audio>
// elements rather than raw Web Audio oscillators. iOS's Web Audio API is
// notoriously unreliable in standalone (Home Screen installed) web apps —
// silent even with the ringer and volume on — because it uses a flaky
// "ambient" audio session category there. HTMLAudioElement playback goes
// through iOS's ordinary media pipeline instead, which is reliable in that
// same standalone context.

let enabled = false;
const urlCache = new Map();

export function setEnabled(value) {
  enabled = value;
}

export function isEnabled() {
  return enabled;
}

function renderToneWav(freq, duration, { type = "sine", volume = 0.35 } = {}) {
  const sampleRate = 44100;
  const numSamples = Math.max(1, Math.floor(duration * sampleRate));
  const samples = new Float32Array(numSamples);
  const attackSamples = sampleRate * 0.005;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freq * t;
    const wave = type === "square" ? Math.sign(Math.sin(phase)) : Math.sin(phase);
    const attack = Math.min(1, i / attackSamples);
    const decay = Math.exp((-3 * i) / numSamples);
    samples[i] = wave * volume * attack * decay;
  }

  return encodeWavPCM16(samples, sampleRate);
}

function encodeWavPCM16(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function toneUrl(key, factory) {
  if (!urlCache.has(key)) {
    urlCache.set(key, URL.createObjectURL(factory()));
  }
  return urlCache.get(key);
}

// One <audio> element is created per distinct tone and kept forever in this
// map, rather than a fresh element per play. A freshly created element with
// no other reference to it can be garbage collected mid-playback once the
// calling function returns — browsers (mobile Safari especially) don't treat
// an unreferenced element as "in use" just because it's still playing —
// which is why only the very first beep of a session reliably played.
// Reusing one permanently-referenced element per tone sidesteps that
// entirely: it's never eligible for GC for the life of the page.
const audioElements = new Map();

function getAudioElement(key, factory) {
  if (!audioElements.has(key)) {
    audioElements.set(key, new Audio(toneUrl(key, factory)));
  }
  return audioElements.get(key);
}

function play(key, factory) {
  const el = getAudioElement(key, factory);
  el.currentTime = 0;
  el.play().catch(() => {});
}

function tone(key, freq, duration, options) {
  if (!enabled) return;
  play(key, () => renderToneWav(freq, duration, options));
}

function primeTone(key, freq, duration, options) {
  const el = getAudioElement(key, () => renderToneWav(freq, duration, options));
  const restoreVolume = el.volume;
  el.volume = 0;
  el.currentTime = 0;
  el.play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.volume = restoreVolume;
    })
    .catch(() => {
      el.volume = restoreVolume;
    });
}

// Call from a user gesture (e.g. tapping play) to unlock audio on iOS/Safari.
// Also primes every tone that gets re-triggered multiple times in quick
// succession (e.g. the three end-of-interval warning beeps, one per second):
// on iOS a freshly created <audio> element that's never been played yet can
// silently drop a play() call if it's re-triggered again before its first
// play has fully loaded/decoded ("interrupted by a new load request").
// Playing each one once, muted, well before it's ever needed for real forces
// it to fully load so later rapid-fire plays start instantly and reliably.
export function unlockAudio() {
  play("unlock", () => renderToneWav(440, 0.05, { volume: 0 }));
  primeTone("countdownTick", 880, 0.12, { type: "square", volume: 0.3 });
  primeTone("countdownFinalHigh", 1320, 0.18, { type: "square", volume: 0.4 });
  primeTone("countdownFinalLow", 550, 0.18, { type: "square", volume: 0.4 });
  primeTone("intervalEnd", 660, 0.15, { type: "sine", volume: 0.3 });
}

// First two beeps of the 3-beep countdown that plays during an interval's
// final 3 seconds, regardless of what comes next.
export function countdownTick() {
  tone("countdownTick", 880, 0.12, { type: "square", volume: 0.3 });
}

// Final, higher-pitched beep of that countdown — the next interval is a
// normal work interval ("go"). This doubles as the only "interval started"
// cue, so nothing else plays once the next interval actually begins.
export function countdownFinalHigh() {
  tone("countdownFinalHigh", 1320, 0.18, { type: "square", volume: 0.4 });
}

// Final, lower-pitched beep of that countdown — the next interval is a
// Rest block ("ease up").
export function countdownFinalLow() {
  tone("countdownFinalLow", 550, 0.18, { type: "square", volume: 0.4 });
}

// Soft single tone marking rest/reps-complete transitions.
export function intervalEnd() {
  tone("intervalEnd", 660, 0.15, { type: "sine", volume: 0.3 });
}

// Cheerful ascending run played once the whole workout is complete.
export function workoutComplete() {
  if (!enabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    setTimeout(() => tone(`chord-${freq}`, freq, 0.28, { type: "sine", volume: 0.35 }), i * 140);
  });
}
