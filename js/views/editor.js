import {
  getWorkout,
  saveWorkout,
  createEmptyWorkout,
  getDrawer,
  upsertDrawerByName,
  updateDrawerInterval,
  makeIntervalInstance,
  makeSetContainer,
  uid,
} from "../storage.js";
import { intervalMeta, isSet, setMeta } from "../util.js";

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

const HOLD_MS = 300;
const MOVE_CANCEL_PX = 8;
const DRAG_IGNORE_SELECTOR = ".card-actions, .rounds-stepper, .add-to-set-btn, .set-intervals";

// Only one drag (or hold-to-drag) gesture can be in flight at a time. Tracking
// it here lets a new pointerdown forcibly tear down a stuck previous session
// (e.g. one a native browser gesture interrupted before it could clean up
// itself), instead of leaking listeners that corrupt every attempt after it.
let activeDragTeardown = null;

function forceTeardownActiveDrag() {
  if (activeDragTeardown) {
    const teardown = activeDragTeardown;
    activeDragTeardown = null;
    teardown();
  }
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
  root.querySelector("#add-interval-btn").addEventListener("click", () => openAddChoice(workout.intervals));
  root.querySelector(".save-workout-btn").addEventListener("click", () => {
    workout.name = nameInput.value.trim() || "Untitled workout";
    saveWorkout(workout);
    nav.toHome();
  });

  renderIntervalList();

  function resortArray(arr, newOrderIds) {
    arr.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
  }

  function renderIntervalList(scrollToId) {
    forceTeardownActiveDrag();
    const listEl = root.querySelector("#interval-list");
    if (workout.intervals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Tap + to add your first interval or set.";
      listEl.replaceChildren(empty);
      return;
    }
    const cards = workout.intervals.map((node) => (isSet(node) ? createSetCardEl(node) : createTopLevelIntervalEl(node)));
    listEl.replaceChildren(...cards);
    cards.forEach((card) => enableDragReorder(card, listEl, (order) => resortArray(workout.intervals, order)));

    if (scrollToId) {
      const target = listEl.querySelector(`[data-id="${scrollToId}"]`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }

  function createTopLevelIntervalEl(interval) {
    return createIntervalCardEl(interval, {
      onEdit: () => openIntervalForm({ mode: "edit", interval }),
      onDuplicate: () => {
        const idx = workout.intervals.indexOf(interval);
        workout.intervals.splice(idx + 1, 0, { ...interval, id: uid() });
        renderIntervalList();
      },
      onRemove: () => {
        workout.intervals = workout.intervals.filter((n) => n.id !== interval.id);
        renderIntervalList();
      },
    });
  }

  function createIntervalCardEl(interval, { onEdit, onDuplicate, onRemove }) {
    const frag = document.getElementById("tpl-interval-card").content.cloneNode(true);
    const card = frag.querySelector(".interval-card");
    card.dataset.id = interval.id;
    frag.querySelector(".card-title").textContent = interval.name;
    frag.querySelector(".card-meta").textContent = intervalMeta(interval);
    frag.querySelector(".duplicate-btn").addEventListener("click", onDuplicate);
    frag.querySelector(".edit-btn").addEventListener("click", onEdit);
    frag.querySelector(".remove-btn").addEventListener("click", onRemove);
    return card;
  }

  function createSetCardEl(setNode) {
    const frag = document.getElementById("tpl-set-card").content.cloneNode(true);
    const card = frag.querySelector(".set-card");
    card.dataset.id = setNode.id;
    frag.querySelector(".card-meta").textContent = setMeta(setNode);
    frag.querySelector(".rounds-value").textContent = setNode.rounds;

    frag.querySelector(".rounds-dec").addEventListener("click", () => {
      setNode.rounds = Math.max(1, setNode.rounds - 1);
      renderIntervalList();
    });
    frag.querySelector(".rounds-inc").addEventListener("click", () => {
      setNode.rounds = Math.min(50, setNode.rounds + 1);
      renderIntervalList();
    });
    frag.querySelector(".duplicate-btn").addEventListener("click", () => {
      const idx = workout.intervals.indexOf(setNode);
      const copy = { ...setNode, id: uid(), intervals: setNode.intervals.map((i) => ({ ...i, id: uid() })) };
      workout.intervals.splice(idx + 1, 0, copy);
      renderIntervalList();
    });
    frag.querySelector(".remove-btn").addEventListener("click", () => {
      workout.intervals = workout.intervals.filter((n) => n.id !== setNode.id);
      renderIntervalList();
    });

    const nestedListEl = frag.querySelector(".set-intervals");
    if (setNode.intervals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No intervals in this set yet.";
      nestedListEl.appendChild(empty);
    } else {
      const nestedCards = setNode.intervals.map((interval) =>
        createIntervalCardEl(interval, {
          onEdit: () => openIntervalForm({ mode: "edit", interval }),
          onDuplicate: () => {
            const idx = setNode.intervals.indexOf(interval);
            setNode.intervals.splice(idx + 1, 0, { ...interval, id: uid() });
            renderIntervalList();
          },
          onRemove: () => {
            setNode.intervals = setNode.intervals.filter((i) => i.id !== interval.id);
            renderIntervalList();
          },
        })
      );
      nestedListEl.replaceChildren(...nestedCards);
      nestedCards.forEach((nestedCard) =>
        enableDragReorder(nestedCard, nestedListEl, (order) => resortArray(setNode.intervals, order))
      );
    }

    frag.querySelector(".add-to-set-btn").addEventListener("click", () => openPicker(setNode.intervals));

    return card;
  }

  function enableDragReorder(card, listEl, onReorder) {
    // Belt-and-suspenders against the browser's own native gestures (text
    // selection drag, HTML5 drag-and-drop, long-press context menu) hijacking
    // the pointer stream mid-gesture — when that happens our pointerup/
    // pointercancel handlers never fire, which used to leak listeners and
    // corrupt every drag attempt after the first.
    card.draggable = false;
    card.addEventListener("dragstart", (e) => e.preventDefault());
    card.addEventListener("selectstart", (e) => e.preventDefault());
    card.addEventListener("contextmenu", (e) => e.preventDefault());

    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest(DRAG_IGNORE_SELECTOR)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      forceTeardownActiveDrag();
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      let holdTimer = setTimeout(() => {
        cleanup();
        beginDrag(e, card, listEl, onReorder);
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
        if (activeDragTeardown === cleanup) activeDragTeardown = null;
      }
      activeDragTeardown = cleanup;
      document.addEventListener("pointermove", onEarlyMove);
      document.addEventListener("pointerup", cleanup);
      document.addEventListener("pointercancel", cleanup);
    });
  }

  function beginDrag(e, card, listEl, onReorder) {
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

      // Use the pointer position itself (not the dragged card's midpoint) so
      // cards much taller or shorter than their siblings (e.g. Set containers)
      // still land wherever the finger/cursor actually is.
      const pointerY = ev.clientY;
      const siblings = [...listEl.children].filter((c) => c !== placeholder);
      let target = null;
      for (const sib of siblings) {
        const sRect = sib.getBoundingClientRect();
        if (pointerY < sRect.top + sRect.height / 2) {
          target = sib;
          break;
        }
      }
      if (target) listEl.insertBefore(placeholder, target);
      else listEl.appendChild(placeholder);
    }

    function finish(shouldReorder) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.touchAction = "";
      if (activeDragTeardown === finish) activeDragTeardown = null;

      card.classList.remove("dragging");
      card.style.position = "";
      card.style.left = "";
      card.style.top = "";
      card.style.width = "";
      if (placeholder.isConnected) placeholder.replaceWith(card);

      if (shouldReorder) {
        const newOrder = [...listEl.children].map((el) => el.dataset.id);
        onReorder(newOrder);
      }
    }

    function onUp() {
      finish(true);
    }

    activeDragTeardown = () => finish(false);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  function openAddChoice(targetArray) {
    const sheet = openSheet("tpl-add-choice");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector("#choice-interval").addEventListener("click", () => {
      sheet.close();
      openPicker(targetArray);
    });
    sheet.el.querySelector("#choice-set").addEventListener("click", () => {
      sheet.close();
      const newSet = makeSetContainer();
      targetArray.push(newSet);
      renderIntervalList(newSet.id);
    });
  }

  function openPicker(targetArray) {
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
            targetArray.push(instance);
            sheet.close();
            renderIntervalList(instance.id);
          });
          return node;
        });
      listEl.replaceChildren(...nodes);
    }

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".new-interval-btn").addEventListener("click", () => {
      sheet.close();
      openIntervalForm({ mode: "create", targetArray });
    });
  }

  function openIntervalForm({ mode, interval = null, targetArray = null }) {
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
        targetArray.push(instance);
        renderIntervalList(instance.id);
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
