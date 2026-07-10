let ctx = null;
let enabled = false;

export function setEnabled(value) {
  enabled = value;
}

export function isEnabled() {
  return enabled;
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Call from a user gesture (e.g. tapping play) to unlock audio on iOS/Safari.
export function unlockAudio() {
  getCtx();
}

function tone(freq, startOffset, duration, { type = "sine", volume = 0.35 } = {}) {
  if (!enabled) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Short low blip used during the 3-2-1 countdown.
export function countdownTick() {
  tone(880, 0, 0.12, { type: "square", volume: 0.3 });
}

// Higher double-beep marking the start of a work interval ("go").
export function intervalStart() {
  tone(1320, 0, 0.18, { type: "square", volume: 0.4 });
}

// Soft single tone marking rest/reps-complete transitions.
export function intervalEnd() {
  tone(660, 0, 0.15, { type: "sine", volume: 0.3 });
}

// Cheerful ascending run played once the whole workout is complete.
export function workoutComplete() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => tone(freq, i * 0.14, 0.28, { type: "sine", volume: 0.35 }));
}
