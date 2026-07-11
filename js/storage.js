const WORKOUTS_KEY = "wt_workouts_v1";
const DRAWER_KEY = "wt_interval_drawer_v1";
const SOUND_KEY = "wt_sound_enabled_v1";
const THEME_KEY = "wt_theme_v1";
const HOME_TITLE_KEY = "wt_home_title_v1";

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

  return { workoutCount: newWorkouts.length, drawerCount: importedDrawer.length };
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

export { uid };
