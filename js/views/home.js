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
  getHomeTitle,
  setHomeTitle,
  getDrawer,
  upsertDrawerByName,
  updateDrawerInterval,
  deleteDrawerInterval,
  getGoals,
  markBackedUp,
  dismissBackupBanner,
  shouldShowBackupBanner,
  getSoundEnabled,
} from "../storage.js";
import { workoutMeta, intervalMeta, setMeta, isSet, formatClock, sortDrawerRestFirst } from "../util.js";
import { unlockAudio } from "../audio.js";
import { openSheet } from "../sheet.js";
import { shareOrDownload, filenameFor } from "../share.js";
import { getTheme, setTheme } from "../theme.js";
import { CLASSICS_CATEGORIES, classicsByCategory } from "../exerciseLibrary.js";
import { initTabs } from "../tabs.js";
import { computeGoalStatus, describeGoal } from "../goals.js";

export function renderHome(root, nav) {
  const tpl = document.getElementById("tpl-home");
  root.replaceChildren(tpl.content.cloneNode(true));

  document.getElementById("home-title").textContent = getHomeTitle();

  document.getElementById("add-workout-btn").addEventListener("click", () => {
    nav.toEditor(null);
  });
  document.getElementById("tabata-btn").addEventListener("click", openTabataSetup);
  document.getElementById("settings-btn").addEventListener("click", openSettingsMenu);
  document.getElementById("home-goal-strip").addEventListener("click", () => nav.toGoals());

  renderGoalStrip();
  renderList();

  const banner = document.getElementById("backup-banner");
  if (shouldShowBackupBanner()) {
    banner.classList.remove("hidden");
    banner.querySelector("#backup-now-btn").addEventListener("click", async () => {
      await doExport();
      banner.classList.add("hidden");
    });
    banner.querySelector("#backup-dismiss-btn").addEventListener("click", () => {
      dismissBackupBanner();
      banner.classList.add("hidden");
    });
  }

  async function doExport() {
    const data = exportBackupData();
    const stamp = new Date().toISOString().slice(0, 10);
    await shareOrDownload(`workout-timer-backup-${stamp}.json`, JSON.stringify(data, null, 2));
    markBackedUp();
  }

  function renderGoalStrip() {
    const strip = document.getElementById("home-goal-strip");
    const goal = getGoals().find((g) => g.showOnHome);
    if (!goal) {
      strip.classList.add("hidden");
      return;
    }
    const { progress, streak } = computeGoalStatus(goal);
    const pct = progress.target > 0 ? Math.min(100, (progress.count / progress.target) * 100) : 0;
    strip.classList.remove("hidden");
    strip.querySelector(".home-goal-label").textContent = describeGoal(goal);
    strip.querySelector(".home-goal-progress-fill").style.width = `${pct}%`;
    strip.querySelector(".home-goal-streak").textContent = streak > 0 ? `🔥 ${streak}` : `${progress.count}/${progress.target}`;
  }

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
      if (w.lastCompletedSeconds != null) {
        const completedMeta = node.querySelector(".card-completed-meta");
        completedMeta.querySelector("span").textContent = `Completed in ${formatClock(w.lastCompletedSeconds)}`;
        completedMeta.classList.remove("hidden");
      }
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
    // (rather than waiting for a separate tap there). Skipped entirely when
    // sound is off — priming still calls the real iOS audio APIs even at
    // zero volume, which is audible as a faint click/pop on some devices.
    if (getSoundEnabled()) unlockAudio();
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
      if (rest > 0) set.intervals.push(makeIntervalInstance({ name: "Rest", type: "timer", amount: rest, isRest: true }));

      const workout = {
        id: uid(),
        name: `Tabata ${work}s/${rest}s × ${rounds}`,
        createdAt: Date.now(),
        intervals: [set],
      };

      if (getSoundEnabled()) unlockAudio();
      sheet.close();
      nav.toPlayerAdhoc(workout);
    });
  }

  function openSettingsMenu() {
    const sheet = openSheet("tpl-settings-menu");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector("#diary-btn").addEventListener("click", () => {
      sheet.close();
      nav.toDiary();
    });
    sheet.el.querySelector("#goals-btn").addEventListener("click", () => {
      sheet.close();
      nav.toGoals();
    });
    sheet.el.querySelector("#instructions-btn").addEventListener("click", () => {
      sheet.close();
      openInstructions();
    });
    sheet.el.querySelector("#customize-btn").addEventListener("click", () => {
      sheet.close();
      openCustomize();
    });
    sheet.el.querySelector("#export-all-btn").addEventListener("click", async () => {
      await doExport();
      sheet.close();
    });
    sheet.el.querySelector("#import-btn").addEventListener("click", () => {
      sheet.close();
      openImport();
    });
    sheet.el.querySelector("#exercise-library-btn").addEventListener("click", () => {
      sheet.close();
      openExerciseLibrary();
    });
    sheet.el.querySelector("#work-it-daily-link-btn").addEventListener("click", () => {
      sheet.close();
      openWorkItDailyPromo();
    });
  }

  function openWorkItDailyPromo() {
    const sheet = openSheet("tpl-promo-work-it-daily");
    sheet.el.querySelector(".cancel-btn").addEventListener("click", () => sheet.close());
  }

  function openExerciseLibrary() {
    const sheet = openSheet("tpl-exercise-library");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    const mineListEl = sheet.el.querySelector("#mine-list");
    const classicsListEl = sheet.el.querySelector("#classics-list");

    function renderMine() {
      const drawer = sortDrawerRestFirst(getDrawer());
      if (drawer.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No saved intervals yet.";
        mineListEl.replaceChildren(empty);
        return;
      }
      const itemTpl = document.getElementById("tpl-library-mine-item");
      const nodes = drawer.map((entry) => {
        const node = itemTpl.content.cloneNode(true);
        node.querySelector(".card-title").textContent = entry.name;
        node.querySelector(".card-meta").textContent = intervalMeta(entry);
        node.querySelector(".edit-btn").addEventListener("click", () => openDrawerEntryForm(entry));
        node.querySelector(".delete-btn").addEventListener("click", () => confirmDeleteDrawerEntry(entry));
        return node;
      });
      mineListEl.replaceChildren(...nodes);
    }

    function renderClassics() {
      const drawerNames = new Set(getDrawer().map((d) => d.name.trim().toLowerCase()));
      const sectionTpl = document.getElementById("tpl-classics-section");
      const itemTpl = document.getElementById("tpl-classics-item");
      const sections = CLASSICS_CATEGORIES.map((cat) => {
        const section = sectionTpl.content.cloneNode(true);
        section.querySelector(".library-section-title").textContent = cat.label;
        const itemsEl = section.querySelector(".library-section-items");
        const items = classicsByCategory(cat.id).map((entry) => {
          const node = itemTpl.content.cloneNode(true);
          node.querySelector(".card-title").textContent = entry.name;
          node.querySelector(".card-meta").textContent = intervalMeta(entry);
          const btn = node.querySelector(".add-btn");
          const added = drawerNames.has(entry.name.trim().toLowerCase());
          btn.classList.toggle("added", added);
          btn.querySelector(".add-icon").classList.toggle("hidden", added);
          btn.querySelector(".added-icon").classList.toggle("hidden", !added);
          btn.setAttribute("aria-label", added ? "Added to My Intervals" : "Add to My Intervals");
          btn.addEventListener("click", () => {
            upsertDrawerByName({ name: entry.name, type: entry.type, amount: entry.amount });
            renderClassics();
            renderMine();
          });
          return node;
        });
        itemsEl.replaceChildren(...items);
        return section;
      });
      classicsListEl.replaceChildren(...sections);
    }

    function openDrawerEntryForm(entry) {
      const formSheet = openSheet("tpl-interval-form");
      const form = formSheet.el.querySelector("#interval-form");
      const titleEl = formSheet.el.querySelector(".form-title");
      const durationField = formSheet.el.querySelector("#duration-field");
      const repsField = formSheet.el.querySelector("#reps-field");
      const segButtons = [...formSheet.el.querySelectorAll(".segmented-option")];
      formSheet.el.querySelector("#update-saved-btn").remove();

      titleEl.textContent = "Edit interval";
      let currentType = entry.type;
      form.name.value = entry.name;
      if (entry.type === "timer") {
        form["amount-min"].value = Math.floor(entry.amount / 60);
        form["amount-sec"].value = entry.amount % 60;
      } else {
        form.amount.value = entry.amount;
      }
      applyType(currentType);

      segButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          currentType = btn.dataset.type;
          applyType(currentType);
        });
      });

      function applyType(type) {
        segButtons.forEach((b) => b.classList.toggle("active", b.dataset.type === type));
        durationField.classList.toggle("hidden", type !== "timer");
        repsField.classList.toggle("hidden", type !== "reps");
      }

      formSheet.el.querySelector(".close-btn").addEventListener("click", () => formSheet.close());
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        const amount =
          currentType === "timer"
            ? (Number(form["amount-min"].value) || 0) * 60 + (Number(form["amount-sec"].value) || 0)
            : Number(form.amount.value);
        if (!name || !amount || amount <= 0) return;
        updateDrawerInterval(entry.id, { name, type: currentType, amount });
        formSheet.close();
        renderMine();
      });

      form.name.focus();
    }

    function confirmDeleteDrawerEntry(entry) {
      const confirmSheet = openSheet("tpl-confirm-delete");
      confirmSheet.el.querySelector(".confirm-title").textContent = "Delete interval?";
      confirmSheet.el.querySelector(".confirm-message").textContent = `Delete "${entry.name}"? This can't be undone.`;
      confirmSheet.el.querySelector(".cancel-btn").addEventListener("click", () => confirmSheet.close());
      confirmSheet.el.querySelector(".confirm-btn").addEventListener("click", () => {
        deleteDrawerInterval(entry.id);
        confirmSheet.close();
        renderMine();
      });
    }

    initTabs(sheet.el, {
      mine: sheet.el.querySelector("#mine-panel"),
      classics: sheet.el.querySelector("#classics-panel"),
    });

    renderMine();
    renderClassics();
  }

  function openInstructions() {
    const sheet = openSheet("tpl-instructions");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
  }

  function openCustomize() {
    const sheet = openSheet("tpl-customize");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    const titleInput = sheet.el.querySelector("#home-title-input");
    titleInput.value = getHomeTitle();
    titleInput.addEventListener("input", () => {
      setHomeTitle(titleInput.value);
      document.getElementById("home-title").textContent = getHomeTitle();
    });

    const accentPicker = sheet.el.querySelector("#playful-accent-picker");
    const themeButtons = sheet.el.querySelectorAll(".theme-option");
    const swatchButtons = sheet.el.querySelectorAll(".swatch-btn");

    function renderActiveState() {
      const pref = getTheme();
      themeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.themeMode === pref.mode));
      swatchButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.accent === pref.playfulAccent));
      accentPicker.classList.toggle("hidden", pref.mode !== "playful");
    }

    themeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setTheme({ ...getTheme(), mode: btn.dataset.themeMode });
        renderActiveState();
      });
    });
    swatchButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setTheme({ ...getTheme(), playfulAccent: btn.dataset.accent });
        renderActiveState();
      });
    });

    renderActiveState();
  }

  async function shareWorkout(workout) {
    const data = exportWorkoutData(workout);
    await shareOrDownload(filenameFor(workout.name), JSON.stringify(data, null, 2));
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
        const parts = [`${result.workoutCount} workout${result.workoutCount !== 1 ? "s" : ""}`];
        if (result.goalCount > 0) parts.push(`${result.goalCount} goal${result.goalCount !== 1 ? "s" : ""}`);
        if (result.diaryCount > 0) parts.push(`${result.diaryCount} diary entr${result.diaryCount !== 1 ? "ies" : "y"}`);
        messageEl.textContent = `Imported ${parts.join(", ")}${result.preferencesApplied ? " and restored your theme/settings" : ""}.`;
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
