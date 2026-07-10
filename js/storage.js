const WORKOUTS_KEY = "wt_workouts_v1";
const DRAWER_KEY = "wt_interval_drawer_v1";

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
  return { id: uid(), kind: "set", rounds, intervals: [] };
}

export { uid };
