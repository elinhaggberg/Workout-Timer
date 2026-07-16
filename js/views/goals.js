import { getGoals, addGoal, updateGoal, deleteGoal } from "../storage.js";
import { computeGoalStatus, describeGoal, formatStreakText, WEEKDAY_LABELS } from "../goals.js";
import { openSheet } from "../sheet.js";

export function renderGoals(root, nav) {
  const tpl = document.getElementById("tpl-goals");
  root.replaceChildren(tpl.content.cloneNode(true));

  root.querySelector(".back-btn").addEventListener("click", () => nav.toHome());
  root.querySelector("#add-goal-btn").addEventListener("click", () => openGoalSettings(null));

  renderList();

  function renderList() {
    const listEl = root.querySelector("#goals-list");
    const goals = getGoals();

    if (goals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Set a new goal by clicking +";
      listEl.replaceChildren(empty);
      return;
    }

    const cardTpl = document.getElementById("tpl-goal-card");
    listEl.replaceChildren(
      ...goals.map((goal) => {
        const node = cardTpl.content.cloneNode(true);
        const { progress, streak } = computeGoalStatus(goal);

        node.querySelector(".goal-title").textContent = goal.type === "weekly" ? "Weekly goal" : "Daily goal";
        node.querySelector(".goal-meta").textContent = describeGoal(goal);

        const pct = progress.target > 0 ? Math.min(100, (progress.count / progress.target) * 100) : 0;
        node.querySelector(".goal-progress-fill").style.width = `${pct}%`;

        node.querySelector(".goal-streak").textContent =
          `${progress.count}/${progress.target} this week · ${formatStreakText(streak)}`;

        node.querySelector(".edit-btn").addEventListener("click", () => openGoalSettings(goal));
        node.querySelector(".delete-btn").addEventListener("click", () => {
          deleteGoal(goal.id);
          renderList();
        });
        return node;
      })
    );
  }

  function openGoalSettings(goal) {
    const sheet = openSheet("tpl-goal-settings");
    const isEdit = !!goal;
    sheet.el.querySelector(".goal-settings-title").textContent = isEdit ? "Edit goal" : "New goal";
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    const typeButtons = sheet.el.querySelectorAll("[data-goal-type]");
    const dailySection = sheet.el.querySelector("#goal-daily-section");
    const weeklySection = sheet.el.querySelector("#goal-weekly-section");
    const weekdayListEl = sheet.el.querySelector("#weekday-list");
    const frequencyListEl = sheet.el.querySelector("#frequency-list");
    const showHomeCheckbox = sheet.el.querySelector("#goal-show-home");

    const state = {
      type: goal?.type || "daily",
      activeDays: goal?.activeDays ? [...goal.activeDays] : [false, false, false, false, false, false, false],
      timesPerWeek: goal?.timesPerWeek || 3,
      showOnHome: goal?.showOnHome || false,
    };

    showHomeCheckbox.checked = state.showOnHome;
    showHomeCheckbox.addEventListener("change", () => {
      state.showOnHome = showHomeCheckbox.checked;
    });

    weekdayListEl.replaceChildren(
      ...WEEKDAY_LABELS.map((label, i) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "weekday-row";
        row.classList.toggle("active", state.activeDays[i]);
        const name = document.createElement("span");
        name.textContent = label;
        const check = document.createElement("span");
        check.className = "weekday-check";
        row.append(name, check);
        row.addEventListener("click", () => {
          state.activeDays[i] = !state.activeDays[i];
          row.classList.toggle("active", state.activeDays[i]);
        });
        return row;
      })
    );

    frequencyListEl.replaceChildren(
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "frequency-row";
        row.classList.toggle("active", state.timesPerWeek === n);
        row.textContent = `${n} day${n !== 1 ? "s" : ""} per week`;
        row.addEventListener("click", () => {
          state.timesPerWeek = n;
          frequencyListEl.querySelectorAll(".frequency-row").forEach((r) => r.classList.remove("active"));
          row.classList.add("active");
        });
        return row;
      })
    );

    function renderTypeState() {
      typeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.goalType === state.type));
      dailySection.classList.toggle("hidden", state.type !== "daily");
      weeklySection.classList.toggle("hidden", state.type !== "weekly");
    }
    typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.type = btn.dataset.goalType;
        renderTypeState();
      });
    });
    renderTypeState();

    sheet.el.querySelector(".save-goal-btn").addEventListener("click", () => {
      const payload = {
        type: state.type,
        activeDays: state.activeDays,
        timesPerWeek: state.timesPerWeek,
        showOnHome: state.showOnHome,
      };
      if (isEdit) updateGoal(goal.id, payload);
      else addGoal(payload);
      sheet.close();
      renderList();
    });
  }
}
