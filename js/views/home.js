import { getWorkouts, deleteWorkout } from "../storage.js";
import { workoutMeta } from "../util.js";
import { unlockAudio } from "../audio.js";

export function renderHome(root, nav) {
  const tpl = document.getElementById("tpl-home");
  root.replaceChildren(tpl.content.cloneNode(true));

  document.getElementById("add-workout-btn").addEventListener("click", () => {
    nav.toEditor(null);
  });

  renderList();

  function renderList() {
    const listEl = document.getElementById("workout-list");
    const workouts = getWorkouts().sort((a, b) => b.createdAt - a.createdAt);

    if (workouts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No workouts yet. Tap + to build your first one.";
      listEl.replaceChildren(empty);
      return;
    }

    const cardTpl = document.getElementById("tpl-workout-card");
    const nodes = workouts.map((w) => {
      const node = cardTpl.content.cloneNode(true);
      node.querySelector(".card-title").textContent = w.name || "Untitled workout";
      node.querySelector(".card-meta").textContent = workoutMeta(w);
      node.querySelector(".edit-btn").addEventListener("click", () => nav.toEditor(w.id));
      node.querySelector(".play-btn").addEventListener("click", () => {
        // Create/resume the AudioContext synchronously within this click's
        // user gesture, since the player starts playing immediately once it
        // mounts (rather than waiting for a separate tap there).
        unlockAudio();
        nav.toPlayer(w.id);
      });
      node.querySelector(".delete-btn").addEventListener("click", () => {
        if (confirm(`Delete "${w.name || "Untitled workout"}"?`)) {
          deleteWorkout(w.id);
          renderList();
        }
      });
      return node;
    });
    listEl.replaceChildren(...nodes);
  }
}
