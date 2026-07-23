import { formatClock, formatDate, formatTime, groupIntervals, formatGroupLine } from "../util.js";
import { launchConfetti } from "../confetti.js";
import { getTheme, PLAYFUL_SWATCHES } from "../theme.js";
import { addDiaryEntry, updateDiaryEntry, getGoals, getDiaryEntries } from "../storage.js";
import { computeGoalStatus, describeGoal, formatStreakText } from "../goals.js";
import { openSheet } from "../sheet.js";
import { renderDiaryEntrySheet } from "./diary.js";
import { ICON_GOAL } from "../icons.js";

function buildGoalLines(goals) {
  return goals.map((goal) => {
    const { progress, streak } = computeGoalStatus(goal);
    const streakPart = streak > 0 ? ` · ${formatStreakText(streak)}` : "";
    return `Goal (${describeGoal(goal)}): ${progress.count}/${progress.target} this week${streakPart}`;
  });
}

function animateCount(el, from, to, duration) {
  if (from === to) return;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Renders one goal's status with a progress bar, then — if this workout
// actually moved the needle — animates the bar, the count, and a small
// "burst" from the icon from the pre-workout state up to the current one.
function buildGoalStatusRow(goal, before, after) {
  const row = document.createElement("div");
  row.className = "goal-status-row";

  const top = document.createElement("div");
  top.className = "goal-status-row-top";

  const icon = document.createElement("span");
  icon.className = "goal-status-icon";
  icon.innerHTML = ICON_GOAL;

  const label = document.createElement("span");
  label.className = "goal-status-label";
  const countEl = document.createElement("span");
  countEl.className = "goal-status-count";
  countEl.textContent = String(before.progress.count);
  label.append(`${describeGoal(goal)}: `, countEl, `/${after.progress.target} this week`);

  const streakEl = document.createElement("span");
  streakEl.className = "goal-status-streak hidden";
  if (before.streak > 0) {
    streakEl.textContent = `🔥 ${before.streak}`;
    streakEl.classList.remove("hidden");
  }

  top.append(icon, label, streakEl);

  const bar = document.createElement("div");
  bar.className = "goal-status-progress-bar";
  const fill = document.createElement("div");
  fill.className = "goal-status-progress-fill";
  const beforePct = after.progress.target > 0 ? Math.min(100, (before.progress.count / after.progress.target) * 100) : 0;
  const afterPct = after.progress.target > 0 ? Math.min(100, (after.progress.count / after.progress.target) * 100) : 0;
  fill.style.width = `${beforePct}%`;
  bar.appendChild(fill);

  row.append(top, bar);

  const progressed = after.progress.count > before.progress.count;
  const streakUp = after.streak > before.streak;
  if (progressed || streakUp) {
    setTimeout(() => {
      fill.style.width = `${afterPct}%`;
      animateCount(countEl, before.progress.count, after.progress.count, 600);
      if (streakUp) {
        streakEl.textContent = `🔥 ${after.streak}`;
        streakEl.classList.remove("hidden");
        streakEl.classList.add("pop-in");
      }
      icon.classList.add("burst");
      setTimeout(() => icon.classList.remove("burst"), 700);
    }, 500);
  }

  return row;
}

function buildSummaryText(summary, goals) {
  const groups = groupIntervals(summary.intervals);
  const lines = [
    `Workout: ${summary.workoutName || "Untitled workout"}`,
    `Date: ${formatDate(summary.completedAt)} ${formatTime(summary.completedAt)}`,
    `Duration: ${formatClock(summary.totalSeconds)}`,
    "",
    "Intervals:",
    ...groups.map((g) => `- ${formatGroupLine(g)}`),
  ];
  if (goals.length > 0) {
    lines.push("", ...buildGoalLines(goals));
  }
  return lines.join("\n");
}

export function renderFinish(root, nav, summary) {
  const tpl = document.getElementById("tpl-finish");
  root.replaceChildren(tpl.content.cloneNode(true));

  const canvas = root.querySelector("#confetti-canvas");
  const isPlayful = getTheme().mode === "playful";
  const confettiOptions = isPlayful ? { colors: PLAYFUL_SWATCHES.map((s) => s.accent) } : {};
  requestAnimationFrame(() => launchConfetti(canvas, confettiOptions));

  const goals = getGoals();

  // Snapshot goal progress as it stood *before* this workout, then log it —
  // goal math below needs the entry already in place to count today's
  // workout, but the "before" snapshot is what makes the counter animation
  // (and the bug where the summary undercounted the goal by one) possible.
  const diaryEntriesBefore = getDiaryEntries();

  // Every completed workout is logged to the diary automatically — this only
  // runs once, since renderFinish only fires on an actual finish event (a
  // page reload on #/finish has no pending summary and bounces to Home).
  const diaryEntry = addDiaryEntry({
    type: "workout",
    workoutName: summary.workoutName,
    totalSeconds: summary.totalSeconds,
    intervals: summary.intervals,
    createdAt: summary.completedAt,
  });

  const summaryBox = root.querySelector("#summary-box");
  const summaryText = buildSummaryText(summary, goals);

  const strong = document.createElement("strong");
  strong.textContent = summary.workoutName || "Untitled workout";
  summaryBox.appendChild(strong);
  summaryBox.appendChild(document.createTextNode(`\n${formatDate(summary.completedAt)} ${formatTime(summary.completedAt)}`));
  summaryBox.appendChild(document.createTextNode(`\nDuration: ${formatClock(summary.totalSeconds)}\n\n`));
  groupIntervals(summary.intervals).forEach((g) => {
    summaryBox.appendChild(document.createTextNode(`• ${formatGroupLine(g)}\n`));
  });

  const goalStatusBox = root.querySelector("#goal-status-box");
  if (goals.length > 0) {
    goalStatusBox.classList.remove("hidden");
    goalStatusBox.replaceChildren(
      ...goals.map((goal) =>
        buildGoalStatusRow(goal, computeGoalStatus(goal, diaryEntriesBefore), computeGoalStatus(goal))
      )
    );
  }

  const addNotesBtn = root.querySelector("#add-notes-btn");
  const seeEntryLink = root.querySelector("#see-entry-link");

  function renderNotesState() {
    if (diaryEntry.notes) {
      addNotesBtn.textContent = "Saved to Diary";
      seeEntryLink.classList.remove("hidden");
    } else {
      addNotesBtn.textContent = "Add notes";
      seeEntryLink.classList.add("hidden");
    }
  }
  renderNotesState();

  addNotesBtn.addEventListener("click", () => {
    const sheet = openSheet("tpl-add-notes");
    const textarea = sheet.el.querySelector("#notes-textarea");
    textarea.value = diaryEntry.notes || "";
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".save-notes-btn").addEventListener("click", () => {
      const notes = textarea.value.trim();
      updateDiaryEntry(diaryEntry.id, { notes });
      diaryEntry.notes = notes;
      sheet.close();
      renderNotesState();
    });
    setTimeout(() => textarea.focus(), 50);
  });

  seeEntryLink.addEventListener("click", (e) => {
    e.preventDefault();
    renderDiaryEntrySheet(diaryEntry);
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
