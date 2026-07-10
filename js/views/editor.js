import {
  getWorkout,
  saveWorkout,
  createEmptyWorkout,
  getDrawer,
  upsertDrawerByName,
  updateDrawerInterval,
  makeIntervalInstance,
  uid,
} from "../storage.js";
import { intervalMeta } from "../util.js";

function openSheet(templateId) {
  const tpl = document.getElementById(templateId);
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.appendChild(tpl.content.cloneNode(true));
  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
  }
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  return { el: backdrop, close };
}

export function renderEditor(root, nav, workoutId) {
  const workout = workoutId ? structuredClone(getWorkout(workoutId)) : createEmptyWorkout();
  if (!workout) {
    nav.toHome();
    return;
  }

  const tpl = document.getElementById("tpl-editor");
  root.replaceChildren(tpl.content.cloneNode(true));

  const nameInput = root.querySelector(".workout-name-input");
  nameInput.value = workout.name;

  root.querySelector(".back-btn").addEventListener("click", () => nav.toHome());
  root.querySelector("#add-interval-btn").addEventListener("click", openPicker);
  root.querySelector(".save-workout-btn").addEventListener("click", () => {
    workout.name = nameInput.value.trim() || "Untitled workout";
    saveWorkout(workout);
    nav.toHome();
  });

  renderIntervalList();

  function renderIntervalList() {
    const listEl = root.querySelector("#interval-list");
    if (workout.intervals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Tap + to add your first interval.";
      listEl.replaceChildren(empty);
      return;
    }
    const cardTpl = document.getElementById("tpl-interval-card");
    const nodes = workout.intervals.map((interval) => {
      const node = cardTpl.content.cloneNode(true);
      const card = node.querySelector(".interval-card");
      card.dataset.id = interval.id;
      node.querySelector(".card-title").textContent = interval.name;
      node.querySelector(".card-meta").textContent = intervalMeta(interval);
      node.querySelector(".duplicate-btn").addEventListener("click", () => {
        const copyIdx = workout.intervals.indexOf(interval);
        const copy = { ...interval, id: uid() };
        workout.intervals.splice(copyIdx + 1, 0, copy);
        renderIntervalList();
      });
      node.querySelector(".edit-btn").addEventListener("click", () => openIntervalForm({ mode: "edit", interval }));
      node.querySelector(".remove-btn").addEventListener("click", () => {
        workout.intervals = workout.intervals.filter((i) => i.id !== interval.id);
        renderIntervalList();
      });
      enableDragReorder(card);
      return node;
    });
    listEl.replaceChildren(...nodes);
  }

  const HOLD_MS = 300;
  const MOVE_CANCEL_PX = 8;

  function enableDragReorder(card) {
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".card-actions")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      let holdTimer = setTimeout(() => {
        cleanup();
        beginDrag(e, card);
      }, HOLD_MS);

      function onEarlyMove(ev) {
        if (Math.abs(ev.clientX - startX) > MOVE_CANCEL_PX || Math.abs(ev.clientY - startY) > MOVE_CANCEL_PX) {
          cleanup();
        }
      }
      function cleanup() {
        clearTimeout(holdTimer);
        document.removeEventListener("pointermove", onEarlyMove);
        document.removeEventListener("pointerup", cleanup);
        document.removeEventListener("pointercancel", cleanup);
      }
      document.addEventListener("pointermove", onEarlyMove);
      document.addEventListener("pointerup", cleanup);
      document.addEventListener("pointercancel", cleanup);
    });
  }

  function beginDrag(e, card) {
    const listEl = root.querySelector("#interval-list");
    const rect = card.getBoundingClientRect();

    if (navigator.vibrate) navigator.vibrate(12);

    const placeholder = document.createElement("div");
    placeholder.className = "drag-placeholder";
    placeholder.style.height = rect.height + "px";
    card.before(placeholder);

    document.body.style.touchAction = "none";
    card.classList.add("dragging");
    card.style.position = "fixed";
    card.style.left = rect.left + "px";
    card.style.top = rect.top + "px";
    card.style.width = rect.width + "px";
    document.body.appendChild(card);

    const startY = e.clientY;

    function onMove(ev) {
      const dy = ev.clientY - startY;
      card.style.top = rect.top + dy + "px";

      const cardMidY = rect.top + dy + rect.height / 2;
      const siblings = [...listEl.children].filter((c) => c !== placeholder);
      let target = null;
      for (const sib of siblings) {
        const sRect = sib.getBoundingClientRect();
        if (cardMidY < sRect.top + sRect.height / 2) {
          target = sib;
          break;
        }
      }
      if (target) listEl.insertBefore(placeholder, target);
      else listEl.appendChild(placeholder);
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.touchAction = "";

      card.classList.remove("dragging");
      card.style.position = "";
      card.style.left = "";
      card.style.top = "";
      card.style.width = "";
      placeholder.replaceWith(card);

      const newOrder = [...listEl.querySelectorAll(".interval-card")].map((el) => el.dataset.id);
      workout.intervals.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  function openPicker() {
    const sheet = openSheet("tpl-interval-picker");
    const drawer = getDrawer();
    const listEl = sheet.el.querySelector("#drawer-list");

    if (drawer.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No saved intervals yet.";
      listEl.replaceChildren(empty);
    } else {
      const itemTpl = document.getElementById("tpl-drawer-item");
      const nodes = drawer
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const node = itemTpl.content.cloneNode(true);
          node.querySelector(".card-title").textContent = entry.name;
          node.querySelector(".card-meta").textContent = intervalMeta(entry);
          node.querySelector("button").addEventListener("click", () => {
            const instance = makeIntervalInstance({
              name: entry.name,
              type: entry.type,
              amount: entry.amount,
              drawerId: entry.id,
            });
            workout.intervals.push(instance);
            sheet.close();
            renderIntervalList();
          });
          return node;
        });
      listEl.replaceChildren(...nodes);
    }

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".new-interval-btn").addEventListener("click", () => {
      sheet.close();
      openIntervalForm({ mode: "create" });
    });
  }

  function openIntervalForm({ mode, interval = null }) {
    const sheet = openSheet("tpl-interval-form");
    const form = sheet.el.querySelector("#interval-form");
    const titleEl = sheet.el.querySelector(".form-title");
    const amountLabel = sheet.el.querySelector("#amount-label");
    const segButtons = [...sheet.el.querySelectorAll(".segmented-option")];
    const updateSavedBtn = sheet.el.querySelector("#update-saved-btn");

    titleEl.textContent = mode === "edit" ? "Edit interval" : "New interval";
    if (mode !== "edit") updateSavedBtn.remove();

    let currentType = interval ? interval.type : "timer";
    form.name.value = interval ? interval.name : "";
    form.amount.value = interval ? interval.amount : "";
    applyType(currentType);

    segButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        currentType = btn.dataset.type;
        applyType(currentType);
      });
    });

    function applyType(type) {
      segButtons.forEach((b) => b.classList.toggle("active", b.dataset.type === type));
      amountLabel.textContent = type === "timer" ? "Duration (seconds)" : "Number of reps";
    }

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    if (mode === "edit") {
      updateSavedBtn.addEventListener("click", () => {
        const values = readForm();
        if (!values) return;
        Object.assign(interval, values);
        if (interval.drawerId) {
          updateDrawerInterval(interval.drawerId, values);
        }
        sheet.close();
        renderIntervalList();
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const values = readForm();
      if (!values) return;

      if (mode === "edit") {
        Object.assign(interval, values);
        renderIntervalList();
      } else {
        const drawerEntry = upsertDrawerByName(values);
        const instance = makeIntervalInstance({ ...values, drawerId: drawerEntry.id });
        workout.intervals.push(instance);
        renderIntervalList();
      }
      sheet.close();
    });

    function readForm() {
      const name = form.name.value.trim();
      const amount = Number(form.amount.value);
      if (!name || !amount || amount <= 0) return null;
      return { name, type: currentType, amount };
    }

    form.name.focus();
  }
}
