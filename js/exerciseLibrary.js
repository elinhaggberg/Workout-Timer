// A read-only set of exercises mirrored from Work It Daily's calisthenics
// library, scaled to its Medium difficulty level. Tapping one saves it into
// My Intervals (the same reusable "drawer" used for custom intervals), so it
// can be dropped into any workout from there.

export const CLASSICS_CATEGORIES = [
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "legs", label: "Legs" },
  { id: "core", label: "Core" },
  { id: "fullbody", label: "Full body" },
];

export const CLASSICS = [
  // Push
  { id: "push-up", name: "Push-ups", category: "push", type: "reps", amount: 10 },
  { id: "incline-push-up", name: "Incline push-ups", category: "push", type: "reps", amount: 12 },
  { id: "pike-push-up", name: "Pike push-ups", category: "push", type: "reps", amount: 8 },
  { id: "diamond-push-up", name: "Diamond push-ups", category: "push", type: "reps", amount: 8 },
  { id: "chair-dip", name: "Chair dips", category: "push", type: "reps", amount: 10 },
  { id: "archer-push-up", name: "Archer push-ups", category: "push", type: "reps", amount: 6 },

  // Pull
  { id: "reverse-snow-angel", name: "Reverse snow angels", category: "pull", type: "reps", amount: 12 },
  { id: "table-row", name: "Table rows", category: "pull", type: "reps", amount: 10 },
  { id: "doorframe-row", name: "Doorframe rows", category: "pull", type: "reps", amount: 10 },
  { id: "chin-up", name: "Chin-ups", category: "pull", type: "reps", amount: 5 },
  { id: "pull-up", name: "Pull-ups", category: "pull", type: "reps", amount: 5 },
  { id: "towel-row", name: "Towel rows", category: "pull", type: "reps", amount: 8 },

  // Legs
  { id: "squat", name: "Bodyweight squats", category: "legs", type: "reps", amount: 15 },
  { id: "glute-bridge", name: "Glute bridges", category: "legs", type: "reps", amount: 15 },
  { id: "lunge", name: "Alternating lunges", category: "legs", type: "reps", amount: 12 },
  { id: "split-squat", name: "Bulgarian split squats", category: "legs", type: "reps", amount: 10 },
  { id: "jump-squat", name: "Jump squats", category: "legs", type: "reps", amount: 20 },
  { id: "pistol-progression", name: "Pistol squat progression", category: "legs", type: "reps", amount: 6 },

  // Core
  { id: "plank", name: "Plank hold", category: "core", type: "timer", amount: 30 },
  { id: "bicycle-crunch", name: "Bicycle crunches", category: "core", type: "reps", amount: 20 },
  { id: "leg-raise", name: "Leg raises", category: "core", type: "reps", amount: 12 },
  { id: "side-plank", name: "Side plank", category: "core", type: "timer", amount: 20 },
  { id: "hollow-hold", name: "Hollow body hold", category: "core", type: "timer", amount: 20 },

  // Full body
  { id: "jumping-jack", name: "Jumping jacks", category: "fullbody", type: "reps", amount: 30 },
  { id: "mountain-climber", name: "Mountain climbers", category: "fullbody", type: "reps", amount: 20 },
  { id: "burpee", name: "Burpees", category: "fullbody", type: "reps", amount: 8 },
  { id: "bear-crawl", name: "Bear crawl", category: "fullbody", type: "reps", amount: 20 },
];

export function classicsByCategory(categoryId) {
  return CLASSICS.filter((e) => e.category === categoryId);
}
