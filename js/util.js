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

export function isSet(node) {
  return !!node && node.kind === "set";
}

// Pins the Rest preset above every other saved interval, alphabetical among
// themselves either side of it -- used anywhere the drawer's "My Intervals"
// list is shown (the interval picker and the Exercise Library).
export function sortDrawerRestFirst(drawer) {
  return [...drawer].sort((a, b) => (b.isRest ? 1 : 0) - (a.isRest ? 1 : 0) || a.name.localeCompare(b.name));
}

// Expands set containers into their repeated intervals, in play order.
export function flattenNodes(nodes) {
  const flat = [];
  for (const node of nodes) {
    if (isSet(node)) {
      for (let r = 0; r < node.rounds; r++) {
        for (const interval of node.intervals) {
          flat.push({ ...interval, setId: node.id, setName: node.name || "Set", setRound: r + 1, setTotalRounds: node.rounds });
        }
      }
    } else {
      flat.push(node);
    }
  }
  return flat;
}

export function setMeta(setNode) {
  const n = setNode.intervals.length;
  if (n === 0) return "No intervals yet";
  const timerSecs =
    setNode.intervals.filter((i) => i.type === "timer").reduce((sum, i) => sum + i.amount, 0) * setNode.rounds;
  const repsCount = setNode.intervals.filter((i) => i.type === "reps").length;
  const parts = [`${n} interval${n !== 1 ? "s" : ""} per round`];
  if (timerSecs > 0) parts.push(`${formatClock(timerSecs)} total`);
  if (repsCount > 0) parts.push(`${repsCount} rep set${repsCount !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

export function workoutMeta(workout) {
  const flat = flattenNodes(workout.intervals);
  const n = flat.length;
  if (n === 0) return "No intervals yet";
  const timerSecs = flat.filter((i) => i.type === "timer").reduce((sum, i) => sum + i.amount, 0);
  const repsCount = flat.filter((i) => i.type === "reps").length;
  const parts = [`${n} interval${n !== 1 ? "s" : ""}`];
  if (timerSecs > 0) parts.push(`${formatClock(timerSecs)} timed`);
  if (repsCount > 0) parts.push(`${repsCount} rep set${repsCount !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

// Collapses a Set's repeated rounds (e.g. 3 rounds of the same 2 intervals,
// flattened to 6 entries) back into a single compact line, so a long workout
// summary doesn't repeat the same few intervals over and over. Shared between
// the finish screen and diary entries, since both render the same summary.
export function groupIntervals(intervals) {
  const groups = [];
  let i = 0;
  while (i < intervals.length) {
    const current = intervals[i];
    if (current.setId) {
      let j = i;
      while (j < intervals.length && intervals[j].setId === current.setId) j++;
      const runLength = j - i;
      const rounds = current.setTotalRounds || 1;
      const perRound = Math.max(1, Math.round(runLength / rounds));
      groups.push({ isSet: true, setName: current.setName, rounds, pattern: intervals.slice(i, i + perRound) });
      i = j;
    } else {
      groups.push({ isSet: false, interval: current });
      i++;
    }
  }
  return groups;
}

export function formatGroupLine(group) {
  if (!group.isSet) return `${group.interval.name}: ${intervalMeta(group.interval)}`;
  const pattern = group.pattern.map((p) => `${p.name} ${intervalMeta(p)}`).join(", ");
  return `${group.setName} × ${group.rounds} rounds: ${pattern}`;
}

export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
