import {
  getWorkouts,
  getWorkout,
  deleteWorkout,
  makeSetContainer,
  makeIntervalInstance,
  uid,
  exportWorkoutData,
  exportBackupData,
  importData,
} from "../storage.js";
import { workoutMeta, intervalMeta, setMeta, isSet } from "../util.js";
import { unlockAudio } from "../audio.js";
import { openSheet } from "../sheet.js";
import { shareOrDownload, filenameFor } from "../share.js";

export function renderHome(root, nav) {
  const tpl = document.getElementById("tpl-home");
  root.replaceChildren(tpl.content.cloneNode(true));

  document.getElementById("add-workout-btn").addEventListener("click", () => {
    nav.toEditor(null);
  });
  document.getElementById("tabata-btn").addEventListener("click", openTabataSetup);
  document.getElementById("settings-btn").addEventListener("click", openSettingsMenu);

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
      const card = node.querySelector(".workout-card");
      node.querySelector(".card-title").textContent = w.name || "Untitled workout";
      node.querySelector(".card-meta").textContent = workoutMeta(w);
      node.querySelector(".edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        nav.toEditor(w.id);
      });
      node.querySelector(".play-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        startWorkout(w.id);
      });
      node.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteWorkout(w);
      });
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card-actions")) return;
        openPreview(w.id);
      });
      return node;
    });
    listEl.replaceChildren(...nodes);
  }

  function startWorkout(workoutId) {
    // Create/resume the AudioContext synchronously within this click's user
    // gesture, since the player starts playing immediately once it mounts
    // (rather than waiting for a separate tap there).
    unlockAudio();
    nav.toPlayer(workoutId);
  }

  function openTabataSetup() {
    const sheet = openSheet("tpl-tabata-setup");
    const form = sheet.el.querySelector("#tabata-form");

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const work = Math.max(1, Number(form.work.value) || 20);
      const rest = Math.max(0, Number(form.rest.value) || 0);
      const rounds = Math.max(1, Number(form.rounds.value) || 1);

      const set = makeSetContainer({ rounds });
      set.intervals.push(makeIntervalInstance({ name: "Work", type: "timer", amount: work }));
      if (rest > 0) set.intervals.push(makeIntervalInstance({ name: "Rest", type: "timer", amount: rest }));

      const workout = {
        id: uid(),
        name: `Tabata ${work}s/${rest}s × ${rounds}`,
        createdAt: Date.now(),
        intervals: [set],
      };

      unlockAudio();
      sheet.close();
      nav.toPlayerAdhoc(workout);
    });
  }

  function openSettingsMenu() {
    const sheet = openSheet("tpl-settings-menu");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector("#export-all-btn").addEventListener("click", async () => {
      const data = exportBackupData();
      const stamp = new Date().toISOString().slice(0, 10);
      await shareOrDownload(`workout-timer-backup-${stamp}.json`, JSON.stringify(data, null, 2), "Workout Timer backup");
      sheet.close();
    });
    sheet.el.querySelector("#import-btn").addEventListener("click", () => {
      sheet.close();
      openImport();
    });
  }

  async function shareWorkout(workout) {
    const data = exportWorkoutData(workout);
    await shareOrDownload(filenameFor(workout.name), JSON.stringify(data, null, 2), workout.name || "Workout");
  }

  function openImport() {
    const sheet = openSheet("tpl-import");
    const fileInput = sheet.el.querySelector(".import-file-input");
    const messageEl = sheet.el.querySelector(".import-message");

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".import-file-btn").addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      messageEl.classList.remove("error");

      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        messageEl.textContent = "That doesn't look like valid JSON.";
        messageEl.classList.add("error");
        return;
      }
      try {
        const result = importData(parsed);
        messageEl.textContent = `Imported ${result.workoutCount} workout${result.workoutCount !== 1 ? "s" : ""}.`;
        renderList();
        setTimeout(() => sheet.close(), 900);
      } catch (err) {
        messageEl.textContent = err.message || "That doesn't look like a valid export file.";
        messageEl.classList.add("error");
      }
    });
  }

  function confirmDeleteWorkout(w) {
    const sheet = openSheet("tpl-confirm-delete");
    sheet.el.querySelector(".confirm-message").textContent =
      `Delete "${w.name || "Untitled workout"}"? This can't be undone.`;
    sheet.el.querySelector(".cancel-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".confirm-btn").addEventListener("click", () => {
      deleteWorkout(w.id);
      sheet.close();
      renderList();
    });
  }

  function openPreview(workoutId) {
    const workout = getWorkout(workoutId);
    if (!workout) return;

    const sheet = openSheet("tpl-workout-preview");
    sheet.el.querySelector(".preview-title").textContent = workout.name || "Untitled workout";
    sheet.el.querySelector(".preview-meta").textContent = workoutMeta(workout);

    const listEl = sheet.el.querySelector("#preview-list");
    if (workout.intervals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No intervals yet.";
      listEl.replaceChildren(empty);
    } else {
      listEl.replaceChildren(...workout.intervals.map(renderPreviewNode));
    }

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".edit-preview-btn").addEventListener("click", () => {
      sheet.close();
      nav.toEditor(workout.id);
    });
    sheet.el.querySelector(".export-preview-btn").addEventListener("click", () => shareWorkout(workout));
    sheet.el.querySelector(".delete-preview-btn").addEventListener("click", () => {
      sheet.close();
      confirmDeleteWorkout(workout);
    });
    const playWorkout = () => {
      sheet.close();
      startWorkout(workout.id);
    };
    sheet.el.querySelector(".play-preview-header-btn").addEventListener("click", playWorkout);
    sheet.el.querySelector(".play-preview-btn").addEventListener("click", playWorkout);
  }

  function renderPreviewNode(node) {
    if (isSet(node)) {
      const card = document.createElement("div");
      card.className = "card set-card preview-card";

      const title = document.createElement("h3");
      title.className = "card-title";
      title.textContent = node.name || "Set";
      const meta = document.createElement("p");
      meta.className = "card-meta";
      meta.textContent = `× ${node.rounds} rounds · ${setMeta(node)}`;
      card.append(title, meta);

      const nested = document.createElement("div");
      nested.className = "set-intervals";
      nested.append(...node.intervals.map(renderPreviewInterval));
      card.appendChild(nested);
      return card;
    }
    return renderPreviewInterval(node);
  }

  function renderPreviewInterval(interval) {
    const card = document.createElement("div");
    card.className = "card interval-card preview-card";
    const main = document.createElement("div");
    main.className = "card-main";
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = interval.name;
    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = intervalMeta(interval);
    main.append(title, meta);
    card.appendChild(main);
    return card;
  }
}
