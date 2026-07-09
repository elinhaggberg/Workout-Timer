export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function intervalMeta(interval) {
  return interval.type === "timer" ? `${formatClock(interval.amount)}` : `${interval.amount} reps`;
}

export function workoutMeta(workout) {
  const n = workout.intervals.length;
  if (n === 0) return "No intervals yet";
  const timerSecs = workout.intervals
    .filter((i) => i.type === "timer")
    .reduce((sum, i) => sum + i.amount, 0);
  const repsCount = workout.intervals.filter((i) => i.type === "reps").length;
  const parts = [`${n} interval${n !== 1 ? "s" : ""}`];
  if (timerSecs > 0) parts.push(`${formatClock(timerSecs)} timed`);
  if (repsCount > 0) parts.push(`${repsCount} rep set${repsCount !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
