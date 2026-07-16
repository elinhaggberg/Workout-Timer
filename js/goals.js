import { getDiaryEntries } from "./storage.js";

export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DAY_MS = 86400000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Monday = 0 .. Sunday = 6, to match the weekday checklist order.
function dayIndexMonFirst(ts) {
  return (new Date(ts).getDay() + 6) % 7;
}

function startOfWeek(ts) {
  const day = startOfDay(ts);
  return day - dayIndexMonFirst(day) * DAY_MS;
}

function workoutDaySet(entries) {
  const set = new Set();
  for (const e of entries) {
    if (e.type === "workout") set.add(startOfDay(e.createdAt));
  }
  return set;
}

function countWeek(weekStart, today, workoutDays) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const day = weekStart + i * DAY_MS;
    if (day > today) break;
    if (workoutDays.has(day)) count++;
  }
  return count;
}

// Computes this week's progress and the current streak for a goal.
// Weekly goals: streak counts consecutive weeks (including this one, if
// already hit) where enough distinct workout days were logged.
// Daily goals: streak counts consecutive scheduled weekdays (going backward
// from today) that had a logged workout, skipping over an unfinished today.
export function computeGoalStatus(goal, diaryEntries = getDiaryEntries()) {
  const now = Date.now();
  const today = startOfDay(now);
  const workoutDays = workoutDaySet(diaryEntries);
  const goalStart = goal.createdAt ? startOfDay(goal.createdAt) : today;

  if (goal.type === "weekly") {
    const target = goal.timesPerWeek || 1;
    const thisWeekStart = startOfWeek(now);
    const count = countWeek(thisWeekStart, today, workoutDays);

    let streak = 0;
    let cursor = thisWeekStart;
    let isCurrent = true;
    const earliestWeek = startOfWeek(goalStart);
    while (cursor >= earliestWeek) {
      const c = countWeek(cursor, today, workoutDays);
      if (isCurrent) {
        isCurrent = false;
        if (c >= target) streak++;
      } else if (c >= target) {
        streak++;
      } else {
        break;
      }
      cursor -= 7 * DAY_MS;
    }
    return { progress: { count, target }, streak };
  }

  // Daily type: goal.activeDays is a 7-length boolean array, Monday first.
  const activeDays = goal.activeDays || [];
  const thisWeekStart = startOfWeek(now);
  let occurred = 0;
  let satisfied = 0;
  for (let i = 0; i < 7; i++) {
    const day = thisWeekStart + i * DAY_MS;
    if (day > today) break;
    if (!activeDays[i]) continue;
    occurred++;
    if (workoutDays.has(day)) satisfied++;
  }

  let streak = 0;
  let cursor = today;
  let isToday = true;
  while (cursor >= goalStart) {
    const idx = dayIndexMonFirst(cursor);
    if (activeDays[idx]) {
      const hit = workoutDays.has(cursor);
      if (isToday && !hit) {
        // Don't break the streak just because today isn't done yet.
      } else if (hit) {
        streak++;
      } else {
        break;
      }
    }
    isToday = false;
    cursor -= DAY_MS;
  }
  return { progress: { count: satisfied, target: occurred }, streak };
}

export function describeGoal(goal) {
  if (goal.type === "weekly") {
    return `${goal.timesPerWeek} day${goal.timesPerWeek !== 1 ? "s" : ""} per week`;
  }
  const days = (goal.activeDays || []).map((on, i) => (on ? WEEKDAY_LABELS[i].slice(0, 3) : null)).filter(Boolean);
  return days.length ? `Every ${days.join(", ")}` : "No days selected";
}
