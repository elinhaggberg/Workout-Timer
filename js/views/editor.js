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
  exportWorkoutData,
  getOrCreateRestDrawerEntry,
} from "../storage.js";
import { intervalMeta, isSet, setMeta, sortDrawerRestFirst } from "../util.js";
import { openSheet } from "../sheet.js";
import { shareOrDownload, filenameFor } from "../share.js";
import { CLASSICS } from "../exerciseLibrary.js";
import { initTabs } from "../tabs.js";

// Only one drag gesture can be in flight at a time. Tracking
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
  root.querySelector(".export-btn").addEventListener("click", async () => {
    const data = exportWorkoutData(workout);
    await shareOrDownload(filenameFor(workout.name), JSON.stringify(data, null, 2));
  });
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
    const cards = workout.intervals.map((node) =>
      isSet(node)
        ? createSetCardEl(node, listEl, (order) => resortArray(workout.intervals, order))
        : createIntervalCardEl(
            node,
            {
              onEdit: () => openIntervalForm({ mode: "edit", interval: node }),
              onDuplicate: () => {
                const idx = workout.intervals.indexOf(node);
                workout.intervals.splice(idx + 1, 0, { ...node, id: uid() });
                renderIntervalList();
              },
              onRemove: () => {
                workout.intervals = workout.intervals.filter((n) => n.id !== node.id);
                renderIntervalList();
              },
            },
            listEl,
            (order) => resortArray(workout.intervals, order)
          )
    );
    listEl.replaceChildren(...cards);
    // Textareas can only measure their own scrollHeight once actually attached
    // to the document, so the initial auto-grow pass happens here rather than
    // at creation time.
    listEl.querySelectorAll(".set-name-input").forEach((el) => autoResizeTextarea(el));

    if (scrollToId) {
      const target = listEl.querySelector(`[data-id="${scrollToId}"]`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }

  function autoResizeTextarea(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function createIntervalCardEl(interval, { onEdit, onDuplicate, onRemove }, listEl, onReorder) {
    const frag = document.getElementById("tpl-interval-card").content.cloneNode(true);
    const card = frag.querySelector(".interval-card");
    const handle = frag.querySelector(".drag-handle");
    card.dataset.id = interval.id;
    frag.querySelector(".card-title").textContent = interval.name;
    frag.querySelector(".card-meta").textContent = intervalMeta(interval);
    frag.querySelector(".duplicate-btn").addEventListener("click", onDuplicate);
    frag.querySelector(".edit-btn").addEventListener("click", onEdit);
    frag.querySelector(".remove-btn").addEventListener("click", onRemove);
    enableDragReorder(card, handle, listEl, onReorder);
    return card;
  }

  function createSetCardEl(setNode, listEl, onReorder) {
    const frag = document.getElementById("tpl-set-card").content.cloneNode(true);
    const card = frag.querySelector(".set-card");
    const handle = frag.querySelector(".drag-handle");
    card.dataset.id = setNode.id;
    frag.querySelector(".card-meta").textContent = setMeta(setNode);
    frag.querySelector(".rounds-value").textContent = setNode.rounds;

    const nameInput = frag.querySelector(".set-name-input");
    nameInput.value = setNode.name || "";
    nameInput.addEventListener("input", () => {
      setNode.name = nameInput.value;
      autoResizeTextarea(nameInput);
    });
    // Keep it a single wrapping label rather than a multi-paragraph note.
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameInput.blur();
      }
    });

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
        createIntervalCardEl(
          interval,
          {
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
          },
          nestedListEl,
          (order) => resortArray(setNode.intervals, order)
        )
      );
      nestedListEl.replaceChildren(...nestedCards);
    }

    frag.querySelector(".add-to-set-btn").addEventListener("click", () => openPicker(setNode.intervals));
    enableDragReorder(card, handle, listEl, onReorder);

    return card;
  }

  // The handle has touch-action: none set permanently in CSS, so a touch
  // starting on it is never eligible to become a native scroll — unlike
  // toggling touch-action on the fly mid-gesture, which browsers ignore for
  // a touch that's already in progress. That's what made drag unreliable on
  // real touch devices even though it looked fine with simulated mouse input.
  function enableDragReorder(card, handle, listEl, onReorder) {
    handle.addEventListener("dragstart", (e) => e.preventDefault());
    handle.addEventListener("contextmenu", (e) => e.preventDefault());
    handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      forceTeardownActiveDrag();
      e.preventDefault();
      beginDrag(e, card, listEl, onReorder);
    });
  }

  function beginDrag(e, card, listEl, onReorder) {
    const rect = card.getBoundingClientRect();

    if (navigator.vibrate) navigator.vibrate(12);

    const placeholder = document.createElement("div");
    placeholder.className = "drag-placeholder";
    placeholder.style.height = rect.height + "px";
    card.before(placeholder);

    card.classList.add("dragging");
    card.style.position = "fixed";
    card.style.left = rect.left + "px";
    card.style.top = rect.top + "px";
    card.style.width = rect.width + "px";
    document.body.appendChild(card);

    const startY = e.clientY;
    const pointerId = e.pointerId;

    function onMove(ev) {
      if (ev.pointerId !== pointerId) return;
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

    function onUp(ev) {
      if (ev.pointerId !== pointerId) return;
      finish(true);
    }

    activeDragTeardown = () => finish(false);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  function addRestInterval(targetArray) {
    const drawerEntry = getOrCreateRestDrawerEntry();
    const instance = makeIntervalInstance({
      name: drawerEntry.name,
      type: drawerEntry.type,
      amount: drawerEntry.amount,
      drawerId: drawerEntry.id,
      isRest: true,
    });
    targetArray.push(instance);
    return instance;
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
    sheet.el.querySelector("#choice-rest").addEventListener("click", () => {
      sheet.close();
      const instance = addRestInterval(targetArray);
      renderIntervalList(instance.id);
    });
  }

  function openPicker(targetArray) {
    const sheet = openSheet("tpl-interval-picker");
    const drawer = sortDrawerRestFirst(getDrawer());
    const listEl = sheet.el.querySelector("#drawer-list");
    const searchInput = sheet.el.querySelector("#drawer-search");
    const classicsListEl = sheet.el.querySelector("#classics-drawer-list");
    const classicsSearchInput = sheet.el.querySelector("#classics-search");

    if (drawer.length > 10) searchInput.classList.remove("hidden");
    if (CLASSICS.length > 10) classicsSearchInput.classList.remove("hidden");

    function renderDrawerItems(filterText) {
      const query = filterText.trim().toLowerCase();
      const matches = query ? drawer.filter((entry) => entry.name.toLowerCase().includes(query)) : drawer;

      if (drawer.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No saved intervals yet.";
        listEl.replaceChildren(empty);
        return;
      }
      if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No matching intervals.";
        listEl.replaceChildren(empty);
        return;
      }

      const itemTpl = document.getElementById("tpl-drawer-item");
      const nodes = matches.map((entry) => {
        const node = itemTpl.content.cloneNode(true);
        node.querySelector(".card-title").textContent = entry.name;
        node.querySelector(".card-meta").textContent = intervalMeta(entry);
        node.querySelector("button").addEventListener("click", () => {
          const instance = makeIntervalInstance({
            name: entry.name,
            type: entry.type,
            amount: entry.amount,
            drawerId: entry.id,
            isRest: entry.isRest,
          });
          targetArray.push(instance);
          sheet.close();
          renderIntervalList(instance.id);
        });
        return node;
      });
      listEl.replaceChildren(...nodes);
    }

    function renderClassicsItems(filterText) {
      const query = filterText.trim().toLowerCase();
      const matches = query ? CLASSICS.filter((entry) => entry.name.toLowerCase().includes(query)) : CLASSICS;

      if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No matching exercises.";
        classicsListEl.replaceChildren(empty);
        return;
      }

      const itemTpl = document.getElementById("tpl-drawer-item");
      const nodes = matches.map((entry) => {
        const node = itemTpl.content.cloneNode(true);
        node.querySelector(".card-title").textContent = entry.name;
        node.querySelector(".card-meta").textContent = intervalMeta(entry);
        node.querySelector("button").addEventListener("click", () => {
          const drawerEntry = upsertDrawerByName({ name: entry.name, type: entry.type, amount: entry.amount });
          const instance = makeIntervalInstance({
            name: entry.name,
            type: entry.type,
            amount: entry.amount,
            drawerId: drawerEntry.id,
          });
          targetArray.push(instance);
          sheet.close();
          renderIntervalList(instance.id);
        });
        return node;
      });
      classicsListEl.replaceChildren(...nodes);
    }

    renderDrawerItems("");
    renderClassicsItems("");
    searchInput.addEventListener("input", () => renderDrawerItems(searchInput.value));
    classicsSearchInput.addEventListener("input", () => renderClassicsItems(classicsSearchInput.value));

    initTabs(sheet.el, {
      mine: sheet.el.querySelector("#picker-mine-panel"),
      classics: sheet.el.querySelector("#picker-classics-panel"),
    });

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".new-interval-btn").addEventListener("click", () => {
      sheet.close();
      openIntervalForm({ mode: "create", targetArray });
    });
    sheet.el.querySelector(".add-rest-btn").addEventListener("click", () => {
      const instance = addRestInterval(targetArray);
      sheet.close();
      renderIntervalList(instance.id);
    });
  }

  function openIntervalForm({ mode, interval = null, targetArray = null }) {
    const sheet = openSheet("tpl-interval-form");
    const form = sheet.el.querySelector("#interval-form");
    const titleEl = sheet.el.querySelector(".form-title");
    const durationField = sheet.el.querySelector("#duration-field");
    const repsField = sheet.el.querySelector("#reps-field");
    const segButtons = [...sheet.el.querySelectorAll(".segmented-option")];
    const updateSavedBtn = sheet.el.querySelector("#update-saved-btn");

    titleEl.textContent = mode === "edit" ? "Edit interval" : "New interval";
    if (mode !== "edit") updateSavedBtn.remove();

    let currentType = interval ? interval.type : "timer";
    form.name.value = interval ? interval.name : "";
    if (interval && interval.type === "timer") {
      form["amount-min"].value = Math.floor(interval.amount / 60);
      form["amount-sec"].value = interval.amount % 60;
    } else if (interval) {
      form.amount.value = interval.amount;
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
      const amount =
        currentType === "timer"
          ? (Number(form["amount-min"].value) || 0) * 60 + (Number(form["amount-sec"].value) || 0)
          : Number(form.amount.value);
      if (!name || !amount || amount <= 0) return null;
      return { name, type: currentType, amount };
    }

    form.name.focus();
  }
}
