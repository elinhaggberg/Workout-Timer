const WORKOUTS_KEY = "wt_workouts_v1";
const DRAWER_KEY = "wt_interval_drawer_v1";
const SOUND_KEY = "wt_sound_enabled_v1";
const THEME_KEY = "wt_theme_v1";
const HOME_TITLE_KEY = "wt_home_title_v1";
const DIARY_KEY = "wt_diary_v1";
const GOALS_KEY = "wt_goals_v1";
const BACKUP_NOTICE_KEY = "wt_backup_notice_v1";

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Workouts ----

export function getWorkouts() {
  return readJSON(WORKOUTS_KEY, []);
}

export function getWorkout(id) {
  return getWorkouts().find((w) => w.id === id) || null;
}

export function saveWorkout(workout) {
  const workouts = getWorkouts();
  const idx = workouts.findIndex((w) => w.id === workout.id);
  if (idx >= 0) workouts[idx] = workout;
  else workouts.push(workout);
  writeJSON(WORKOUTS_KEY, workouts);
  return workout;
}

export function deleteWorkout(id) {
  writeJSON(WORKOUTS_KEY, getWorkouts().filter((w) => w.id !== id));
}

export function createEmptyWorkout() {
  return { id: uid(), name: "", createdAt: Date.now(), intervals: [] };
}

// ---- Interval drawer (reusable, named intervals) ----

export function getDrawer() {
  return readJSON(DRAWER_KEY, []);
}

export function getDrawerInterval(id) {
  return getDrawer().find((d) => d.id === id) || null;
}

export function findDrawerByName(name) {
  const norm = name.trim().toLowerCase();
  return getDrawer().find((d) => d.name.trim().toLowerCase() === norm) || null;
}

// Ensures a drawer entry exists for this name; creates one if not found.
// Returns the drawer entry (existing or new).
export function upsertDrawerByName({ name, type, amount }) {
  const drawer = getDrawer();
  const norm = name.trim().toLowerCase();
  const existing = drawer.find((d) => d.name.trim().toLowerCase() === norm);
  if (existing) return existing;
  const entry = { id: uid(), name: name.trim(), type, amount, updatedAt: Date.now() };
  drawer.push(entry);
  writeJSON(DRAWER_KEY, drawer);
  return entry;
}

export function updateDrawerInterval(id, { name, type, amount }) {
  const drawer = getDrawer();
  const idx = drawer.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  drawer[idx] = { ...drawer[idx], name: name.trim(), type, amount, updatedAt: Date.now() };
  writeJSON(DRAWER_KEY, drawer);
  return drawer[idx];
}

export function deleteDrawerInterval(id) {
  writeJSON(DRAWER_KEY, getDrawer().filter((d) => d.id !== id));
}

export function makeIntervalInstance({ name, type, amount, drawerId = null }) {
  return { id: uid(), name: name.trim(), type, amount, drawerId };
}

export function makeSetContainer({ rounds = 2 } = {}) {
  return { id: uid(), kind: "set", rounds, name: "", intervals: [] };
}

// ---- Export / import ----

function collectDrawerIds(nodes, ids) {
  for (const node of nodes) {
    if (node.kind === "set") collectDrawerIds(node.intervals, ids);
    else if (node.drawerId) ids.add(node.drawerId);
  }
}

// A single-workout export bundles just the drawer entries that workout's
// intervals reference, so "update saved interval" links survive a round trip
// without pulling in the whole drawer.
export function exportWorkoutData(workout) {
  const referencedIds = new Set();
  collectDrawerIds(workout.intervals, referencedIds);
  const drawer = getDrawer().filter((d) => referencedIds.has(d.id));
  return {
    type: "workout",
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: [workout],
    drawer,
  };
}

export function exportBackupData() {
  return {
    type: "backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: getWorkouts(),
    drawer: getDrawer(),
    goals: getGoals(),
    diary: getDiaryEntries(),
    preferences: {
      theme: getThemePref(),
      homeTitle: getHomeTitle(),
      soundEnabled: getSoundEnabled(),
    },
  };
}

// Both export shapes carry the same { workouts, drawer } structure, so a
// single import path handles a single-workout file or a full backup alike.
// Always merges (adds new entries) rather than replacing anything, so a bad
// or repeated import can't destroy existing data — drawer entries merge by
// name (same rule as the rest of the app), workouts are always added as new.
export function importData(data) {
  if (!data || (data.type !== "workout" && data.type !== "backup") || !Array.isArray(data.workouts)) {
    throw new Error("That doesn't look like a workout or backup file.");
  }

  const importedDrawer = Array.isArray(data.drawer) ? data.drawer : [];
  const oldIdToLocalId = new Map();
  for (const entry of importedDrawer) {
    const local = upsertDrawerByName({ name: entry.name, type: entry.type, amount: entry.amount });
    oldIdToLocalId.set(entry.id, local.id);
  }

  function remapInterval(interval) {
    const drawerId = interval.drawerId ? oldIdToLocalId.get(interval.drawerId) || null : null;
    return { ...interval, id: uid(), drawerId };
  }
  function remapNode(node) {
    if (node.kind === "set") {
      return { ...node, id: uid(), intervals: node.intervals.map(remapInterval) };
    }
    return remapInterval(node);
  }

  const newWorkouts = data.workouts.map((w) => ({
    ...w,
    id: uid(),
    createdAt: Date.now(),
    intervals: w.intervals.map(remapNode),
  }));

  writeJSON(WORKOUTS_KEY, [...getWorkouts(), ...newWorkouts]);

  // Goals and diary entries are self-contained (no cross-references to
  // remap, unlike intervals/drawer), so importing them is just appending
  // with fresh ids -- same "always add, never overwrite" rule as workouts.
  const importedGoals = Array.isArray(data.goals) ? data.goals : [];
  if (importedGoals.length > 0) {
    const newGoals = importedGoals.map((g) => ({ ...g, id: uid() }));
    writeJSON(GOALS_KEY, [...getGoals(), ...newGoals]);
  }

  const importedDiary = Array.isArray(data.diary) ? data.diary : [];
  if (importedDiary.length > 0) {
    const newDiary = importedDiary.map((e) => ({ ...e, id: uid() }));
    writeJSON(DIARY_KEY, [...getDiaryEntries(), ...newDiary]);
  }

  // Preferences are current-state settings, not a list, so restoring a full
  // backup applies them directly rather than merging -- that's what "restore
  // my backup" means for a device's theme/title/sound. Only full backups
  // carry this (a single shared workout shouldn't repaint the recipient's
  // app), and only fields actually present in the file are touched, so an
  // older export missing `preferences` leaves everything as-is.
  let preferencesApplied = false;
  if (data.type === "backup" && data.preferences) {
    const { theme, homeTitle, soundEnabled } = data.preferences;
    if (theme) setThemePref(theme);
    if (homeTitle) setHomeTitle(homeTitle);
    if (typeof soundEnabled === "boolean") setSoundEnabled(soundEnabled);
    preferencesApplied = true;
  }

  return {
    workoutCount: newWorkouts.length,
    drawerCount: importedDrawer.length,
    goalCount: importedGoals.length,
    diaryCount: importedDiary.length,
    preferencesApplied,
  };
}

// ---- Preferences ----

export function getSoundEnabled() {
  return localStorage.getItem(SOUND_KEY) === "true";
}

export function setSoundEnabled(value) {
  localStorage.setItem(SOUND_KEY, value ? "true" : "false");
}

export function getThemePref() {
  return readJSON(THEME_KEY, {});
}

export function setThemePref(pref) {
  writeJSON(THEME_KEY, pref);
}

export function getHomeTitle() {
  return localStorage.getItem(HOME_TITLE_KEY) || "Workouts";
}

export function setHomeTitle(value) {
  const trimmed = (value || "").trim();
  if (trimmed) localStorage.setItem(HOME_TITLE_KEY, trimmed);
  else localStorage.removeItem(HOME_TITLE_KEY);
}

// ---- Diary ----

export function getDiaryEntries() {
  return readJSON(DIARY_KEY, []);
}

export function getDiaryEntry(id) {
  return getDiaryEntries().find((e) => e.id === id) || null;
}

export function addDiaryEntry(entry) {
  const entries = getDiaryEntries();
  const full = { id: uid(), createdAt: Date.now(), notes: "", ...entry };
  entries.push(full);
  writeJSON(DIARY_KEY, entries);
  return full;
}

export function updateDiaryEntry(id, patch) {
  const entries = getDiaryEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  entries[idx] = { ...entries[idx], ...patch };
  writeJSON(DIARY_KEY, entries);
  return entries[idx];
}

export function deleteDiaryEntry(id) {
  writeJSON(DIARY_KEY, getDiaryEntries().filter((e) => e.id !== id));
}

// ---- Goals ----

export function getGoals() {
  return readJSON(GOALS_KEY, []);
}

export function getGoal(id) {
  return getGoals().find((g) => g.id === id) || null;
}

export function addGoal(goal) {
  const goals = getGoals();
  const full = { id: uid(), createdAt: Date.now(), showOnHome: false, ...goal };
  goals.push(full);
  writeJSON(GOALS_KEY, goals);
  return full;
}

export function updateGoal(id, patch) {
  const goals = getGoals();
  const idx = goals.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  goals[idx] = { ...goals[idx], ...patch };
  writeJSON(GOALS_KEY, goals);
  return goals[idx];
}

export function deleteGoal(id) {
  writeJSON(GOALS_KEY, getGoals().filter((g) => g.id !== id));
}

// One-time notice shown after the backup fix that added goals/diary/theme/
// title/sound to exportBackupData -- lets an existing user know their old
// backup files are missing that data, so it's worth making a fresh one.
export function getBackupNoticeSeen() {
  return localStorage.getItem(BACKUP_NOTICE_KEY) === "true";
}

export function setBackupNoticeSeen() {
  localStorage.setItem(BACKUP_NOTICE_KEY, "true");
}

export { uid };
