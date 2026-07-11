import { formatClock, formatDate, formatTime, intervalMeta } from "../util.js";
import { launchConfetti } from "../confetti.js";
import { getTheme, PLAYFUL_SWATCHES } from "../theme.js";

// Collapses a Set's repeated rounds (e.g. 3 rounds of the same 2 intervals,
// flattened to 6 entries) back into a single compact line, so a long workout
// summary doesn't repeat the same few intervals over and over.
function groupIntervals(intervals) {
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

function formatGroupLine(group) {
  if (!group.isSet) return `${group.interval.name}: ${intervalMeta(group.interval)}`;
  const pattern = group.pattern.map((p) => `${p.name} ${intervalMeta(p)}`).join(", ");
  return `${group.setName} × ${group.rounds} rounds: ${pattern}`;
}

function buildSummaryText(summary) {
  const groups = groupIntervals(summary.intervals);
  const lines = [
    `Workout: ${summary.workoutName || "Untitled workout"}`,
    `Date: ${formatDate(summary.completedAt)} ${formatTime(summary.completedAt)}`,
    `Duration: ${formatClock(summary.totalSeconds)}`,
    "",
    "Intervals:",
    ...groups.map((g) => `- ${formatGroupLine(g)}`),
  ];
  return lines.join("\n");
}

export function renderFinish(root, nav, summary) {
  const tpl = document.getElementById("tpl-finish");
  root.replaceChildren(tpl.content.cloneNode(true));

  const canvas = root.querySelector("#confetti-canvas");
  const isPlayful = getTheme().mode === "playful";
  const confettiOptions = isPlayful ? { colors: PLAYFUL_SWATCHES.map((s) => s.accent) } : {};
  requestAnimationFrame(() => launchConfetti(canvas, confettiOptions));

  const summaryBox = root.querySelector("#summary-box");
  const summaryText = buildSummaryText(summary);

  const strong = document.createElement("strong");
  strong.textContent = summary.workoutName || "Untitled workout";
  summaryBox.appendChild(strong);
  summaryBox.appendChild(document.createTextNode(`\n${formatDate(summary.completedAt)} ${formatTime(summary.completedAt)}`));
  summaryBox.appendChild(document.createTextNode(`\nDuration: ${formatClock(summary.totalSeconds)}\n\n`));
  groupIntervals(summary.intervals).forEach((g) => {
    summaryBox.appendChild(document.createTextNode(`• ${formatGroupLine(g)}\n`));
  });

  const copyBtn = root.querySelector("#copy-btn");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      copyBtn.textContent = "Copied ✓";
      setTimeout(() => (copyBtn.textContent = "Copy summary"), 1600);
    } catch {
      copyBtn.textContent = "Couldn't copy";
      setTimeout(() => (copyBtn.textContent = "Copy summary"), 1600);
    }
  });

  root.querySelector("#done-btn").addEventListener("click", () => nav.toHome());
}
