import { getWorkout, saveWorkout, getSoundEnabled, setSoundEnabled } from "../storage.js";
import { formatClock, flattenNodes } from "../util.js";
import * as audio from "../audio.js";
import { setWakeLockWanted } from "../wakelock.js";
import { ICON_PLAY, ICON_PAUSE, ICON_VOLUME_HIGH, ICON_VOLUME_XMARK } from "../icons.js";
import { getTheme, PLAYFUL_SWATCHES } from "../theme.js";

const LEAD_IN_SECONDS = 3;
const WARNING_SECONDS = 3;
const RING_CIRCUMFERENCE = 2 * Math.PI * 54;

export function renderPlayer(root, nav, workoutId, adhocWorkout) {
  const workout = adhocWorkout || getWorkout(workoutId);
  const sequence = workout ? flattenNodes(workout.intervals) : [];
  if (!workout || sequence.length === 0) {
    nav.toHome();
    return;
  }

  // The Tabata quick-timer always alternates work/rest, so the 3s "get
  // ready" lead-in between intervals is redundant there — skip straight to
  // the active phase for every interval.
  const isAdhoc = !!adhocWorkout;

  const tpl = document.getElementById("tpl-player");
  root.replaceChildren(tpl.content.cloneNode(true));

  const progressFillEl = root.querySelector("#player-progress-fill");
  const totalTimerEl = root.querySelector("#total-timer");
  const intervalCountEl = root.querySelector("#interval-count");
  const intervalNameEl = root.querySelector("#interval-name");
  const setContextEl = root.querySelector("#set-context");
  const bigNumberEl = root.querySelector("#big-number");
  const bigLabelEl = root.querySelector("#big-label");
  const upNextEl = root.querySelector("#up-next");
  const countdownRingEl = root.querySelector("#countdown-ring");
  const countdownRingFillEl = root.querySelector("#countdown-ring-fill");
  const playPauseBtn = root.querySelector("#play-pause-btn");
  const prevBtn = root.querySelector("#prev-btn");
  const nextBtn = root.querySelector("#next-btn");
  const exitBtn = root.querySelector(".back-btn");
  const soundToggleBtn = root.querySelector("#sound-toggle-btn");

  const state = {
    index: 0,
    phase: "countdown", // 'countdown' | 'active'
    countdownRemaining: LEAD_IN_SECONDS,
    remaining: 0,
    totalElapsed: 0,
    running: false,
    started: false,
    finished: false,
  };

  let tickHandle = null;

  audio.setEnabled(getSoundEnabled());
  renderSoundToggle();

  if (isAdhoc) {
    // Prime audio before the very first interval-start beep, since there's
    // no lead-in countdown here for togglePlay()'s usual unlock to precede it.
    audio.unlockAudio();
    state.started = true;
  }
  enterInterval(0);
  togglePlay(); // start playing immediately — no extra tap needed

  playPauseBtn.addEventListener("click", togglePlay);
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  exitBtn.addEventListener("click", exit);
  soundToggleBtn.addEventListener("click", toggleSound);

  function togglePlay() {
    if (!state.started) {
      audio.unlockAudio();
      state.started = true;
    }
    state.running = !state.running;
    setWakeLockWanted(state.running);
    if (state.running) startTicking();
    else stopTicking();
    render();
  }

  function toggleSound() {
    const next = !audio.isEnabled();
    audio.setEnabled(next);
    setSoundEnabled(next);
    if (next) audio.unlockAudio();
    renderSoundToggle();
  }

  function renderSoundToggle() {
    const on = audio.isEnabled();
    soundToggleBtn.innerHTML = on ? ICON_VOLUME_HIGH : ICON_VOLUME_XMARK;
    soundToggleBtn.classList.toggle("active", on);
    soundToggleBtn.setAttribute("aria-label", on ? "Mute sound" : "Unmute sound");
  }

  function startTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(tick, 1000);
  }

  function stopTicking() {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function tick() {
    state.totalElapsed += 1;

    if (state.phase === "countdown") {
      state.countdownRemaining -= 1;
      if (state.countdownRemaining <= 0) {
        enterActivePhase();
      }
    } else if (state.phase === "active") {
      const interval = currentInterval();
      if (interval.type === "timer") {
        state.remaining -= 1;
        if (state.remaining > 0) {
          if (state.remaining <= WARNING_SECONDS) audio.countdownTick();
        } else {
          advance();
          render();
          return;
        }
      }
      // reps type: nothing auto-advances; waits for the forward button.
    }
    render();
  }

  function enterActivePhase() {
    audio.intervalStart();
    state.phase = "active";
    const interval = currentInterval();
    state.remaining = interval.type === "timer" ? interval.amount : interval.amount;
  }

  function enterInterval(index) {
    state.index = index;
    if (isAdhoc) {
      enterActivePhase();
    } else {
      state.phase = "countdown";
      state.countdownRemaining = LEAD_IN_SECONDS;
    }
  }

  function currentInterval() {
    return sequence[state.index];
  }

  function goNext() {
    const interval = currentInterval();
    if (state.phase === "active" && interval.type === "reps") audio.intervalEnd();
    advance();
    render();
  }

  function goPrev() {
    if (state.phase === "active" || state.index === 0) {
      enterInterval(state.index);
    } else {
      enterInterval(Math.max(0, state.index - 1));
    }
    render();
  }

  function advance() {
    if (state.index >= sequence.length - 1) {
      finish();
    } else {
      enterInterval(state.index + 1);
    }
  }

  function finish() {
    state.finished = true;
    stopTicking();
    setWakeLockWanted(false);
    audio.workoutComplete();
    if (!isAdhoc) {
      workout.lastCompletedSeconds = state.totalElapsed;
      saveWorkout(workout);
    }
    nav.toFinish({
      workoutName: workout.name,
      completedAt: Date.now(),
      totalSeconds: state.totalElapsed,
      intervals: sequence.map((i) => ({
        name: i.name,
        type: i.type,
        amount: i.amount,
        setId: i.setId,
        setName: i.setName,
        setTotalRounds: i.setTotalRounds,
      })),
    });
  }

  function exit() {
    stopTicking();
    setWakeLockWanted(false);
    nav.toHome();
  }

  function render() {
    totalTimerEl.textContent = formatClock(state.totalElapsed);
    intervalCountEl.textContent = `${state.index + 1} / ${sequence.length}`;
    playPauseBtn.innerHTML = state.running ? ICON_PAUSE : ICON_PLAY;
    progressFillEl.style.width = `${(state.index / sequence.length) * 100}%`;

    const interval = currentInterval();
    intervalNameEl.textContent = interval.name;
    if (interval.setName) {
      setContextEl.textContent = `${interval.setName} · Round ${interval.setRound}/${interval.setTotalRounds}`;
      setContextEl.classList.remove("hidden");
    } else {
      setContextEl.classList.add("hidden");
    }

    if (!state.started && state.phase === "countdown") {
      countdownRingEl.classList.add("hidden");
      bigNumberEl.classList.remove("hidden");
      bigNumberEl.textContent = interval.type === "timer" ? formatClock(interval.amount) : String(interval.amount);
      bigNumberEl.className = "big-number";
      bigLabelEl.textContent = interval.type === "timer" ? "seconds — tap play to start" : "reps — tap play to start";
    } else if (state.phase === "countdown") {
      bigNumberEl.classList.add("hidden");
      countdownRingEl.classList.remove("hidden");
      const fraction = (LEAD_IN_SECONDS - state.countdownRemaining) / LEAD_IN_SECONDS;
      countdownRingFillEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
      if (getTheme().mode === "playful") {
        const swatch = PLAYFUL_SWATCHES[state.index % PLAYFUL_SWATCHES.length];
        countdownRingFillEl.style.stroke = swatch.accent;
      } else {
        countdownRingFillEl.style.stroke = "";
      }
      bigLabelEl.textContent = "Get ready";
    } else if (interval.type === "timer") {
      countdownRingEl.classList.add("hidden");
      bigNumberEl.classList.remove("hidden");
      bigNumberEl.textContent = formatClock(state.remaining);
      bigNumberEl.className = "big-number" + (state.remaining <= WARNING_SECONDS ? " countdown" : "");
      bigLabelEl.textContent = "seconds left";
    } else {
      countdownRingEl.classList.add("hidden");
      bigNumberEl.classList.remove("hidden");
      bigNumberEl.textContent = String(interval.amount);
      bigNumberEl.className = "big-number reps-mode";
      bigLabelEl.textContent = "reps — tap next when done";
    }

    const nextInterval = sequence[state.index + 1];
    if (state.phase === "active" && nextInterval) {
      upNextEl.textContent = `Up next: ${nextInterval.name}`;
      upNextEl.classList.remove("hidden");
    } else {
      upNextEl.classList.add("hidden");
    }
  }
}
