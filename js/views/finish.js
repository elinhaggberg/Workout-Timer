import { formatClock, formatDate, formatTime, intervalMeta } from "../util.js";
import { launchConfetti } from "../confetti.js";
import { getTheme, PLAYFUL_SWATCHES } from "../theme.js";

function buildSummaryText(summary) {
  const lines = [
    `Workout: ${summary.workoutName || "Untitled workout"}`,
    `Date: ${formatDate(summary.completedAt)} ${formatTime(summary.completedAt)}`,
    `Duration: ${formatClock(summary.totalSeconds)}`,
    "",
    "Intervals:",
    ...summary.intervals.map((i) => `- ${i.name}: ${intervalMeta(i)}`),
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
  summary.intervals.forEach((i) => {
    summaryBox.appendChild(document.createTextNode(`• ${i.name}: ${intervalMeta(i)}\n`));
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
