import { getDiaryEntries, getDiaryEntry, addDiaryEntry, updateDiaryEntry, deleteDiaryEntry } from "../storage.js";
import { formatDate, formatTime, formatClock, groupIntervals, formatGroupLine } from "../util.js";
import { openSheet } from "../sheet.js";

const DAY_MS = 86400000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function previewText(entry) {
  if (entry.type === "workout") return entry.workoutName || "Workout";
  const trimmed = (entry.text || "").trim();
  if (!trimmed) return "(empty entry)";
  const firstLine = trimmed.split("\n")[0];
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine;
}

// Manual entries edit their freeform text; auto-logged workout entries have
// nothing user-authored to edit except their notes, so "Edit" there reuses
// the same notes editor the finish screen offers.
function openEditEntry(entry, onChange) {
  if (entry.type === "manual") {
    const sheet = openSheet("tpl-add-diary-entry");
    sheet.el.querySelector("h2").textContent = "Edit entry";
    const textarea = sheet.el.querySelector("#diary-entry-text");
    textarea.value = entry.text || "";
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".save-diary-entry-btn").addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) {
        sheet.close();
        return;
      }
      updateDiaryEntry(entry.id, { text });
      sheet.close();
      onChange?.();
    });
    setTimeout(() => textarea.focus(), 50);
    return;
  }

  const sheet = openSheet("tpl-add-notes");
  sheet.el.querySelector("h2").textContent = entry.notes ? "Edit notes" : "Add notes";
  const textarea = sheet.el.querySelector("#notes-textarea");
  textarea.value = entry.notes || "";
  sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
  sheet.el.querySelector(".save-notes-btn").addEventListener("click", () => {
    updateDiaryEntry(entry.id, { notes: textarea.value.trim() });
    sheet.close();
    onChange?.();
  });
  setTimeout(() => textarea.focus(), 50);
}

function confirmDeleteEntry(entry, onChange) {
  const sheet = openSheet("tpl-confirm-delete");
  sheet.el.querySelector(".confirm-title").textContent = "Delete entry?";
  sheet.el.querySelector(".confirm-message").textContent = "This can't be undone.";
  sheet.el.querySelector(".cancel-btn").addEventListener("click", () => sheet.close());
  sheet.el.querySelector(".confirm-btn").addEventListener("click", () => {
    deleteDiaryEntry(entry.id);
    sheet.close();
    onChange?.();
  });
}

// onChange fires after an edit or delete completes, so callers can refresh
// whichever list (main diary list, day preview, or both) is showing this row.
function renderEntryRow(entry, onChange) {
  const tpl = document.getElementById("tpl-diary-row");
  const node = tpl.content.cloneNode(true);
  const card = node.querySelector(".diary-row");
  node.querySelector(".card-title").textContent = previewText(entry);
  node.querySelector(".card-meta").textContent = `${formatDate(entry.createdAt)} · ${formatTime(entry.createdAt)}`;
  node.querySelector(".edit-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openEditEntry(entry, onChange);
  });
  node.querySelector(".delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDeleteEntry(entry, onChange);
  });
  card.addEventListener("click", () => {
    renderDiaryEntrySheet(entry, { onUpdate: onChange });
  });
  return node;
}

export function renderDiary(root, nav) {
  const tpl = document.getElementById("tpl-diary");
  root.replaceChildren(tpl.content.cloneNode(true));

  root.querySelector(".back-btn").addEventListener("click", () => nav.toHome());
  root.querySelector("#add-diary-btn").addEventListener("click", openAddEntry);
  root.querySelector("#diary-calendar-btn").addEventListener("click", openCalendar);

  renderList();

  function renderList() {
    const listEl = root.querySelector("#diary-list");
    const entries = getDiaryEntries().sort((a, b) => b.createdAt - a.createdAt);

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No entries yet. Tap + to write your first one.";
      listEl.replaceChildren(empty);
      return;
    }

    listEl.replaceChildren(...entries.map((entry) => renderEntryRow(entry, renderList)));
  }

  function openAddEntry() {
    const sheet = openSheet("tpl-add-diary-entry");
    const textarea = sheet.el.querySelector("#diary-entry-text");
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".save-diary-entry-btn").addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) {
        sheet.close();
        return;
      }
      addDiaryEntry({ type: "manual", text });
      sheet.close();
      renderList();
    });
    setTimeout(() => textarea.focus(), 50);
  }

  function openCalendar() {
    const sheet = openSheet("tpl-diary-calendar");
    const monthLabel = sheet.el.querySelector(".cal-month-label");
    const grid = sheet.el.querySelector("#cal-grid");
    const viewDate = new Date();
    viewDate.setDate(1);
    viewDate.setHours(0, 0, 0, 0);

    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
    sheet.el.querySelector(".cal-prev-btn").addEventListener("click", () => {
      viewDate.setMonth(viewDate.getMonth() - 1);
      renderGrid();
    });
    sheet.el.querySelector(".cal-next-btn").addEventListener("click", () => {
      viewDate.setMonth(viewDate.getMonth() + 1);
      renderGrid();
    });

    function renderGrid() {
      monthLabel.textContent = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

      const entries = getDiaryEntries();
      const dayHasEntry = new Set(entries.map((e) => startOfDay(e.createdAt)));
      const today = startOfDay(Date.now());

      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      const startOffset = (firstOfMonth.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const cells = [];
      for (let i = 0; i < startOffset; i++) {
        cells.push(document.createElement("span"));
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dayTs = new Date(year, month, day).getTime();
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cal-day";
        if (dayTs === today) cell.classList.add("today");
        const num = document.createElement("span");
        num.textContent = String(day);
        cell.appendChild(num);
        if (dayHasEntry.has(dayTs)) {
          const dot = document.createElement("span");
          dot.className = "cal-dot";
          cell.appendChild(dot);
          cell.addEventListener("click", () => openDayPreview(dayTs));
        } else {
          cell.classList.add("cal-day-empty");
        }
        cells.push(cell);
      }
      grid.replaceChildren(...cells);
    }

    renderGrid();
  }

  function openDayPreview(dayStart) {
    const sheet = openSheet("tpl-day-preview");
    sheet.el.querySelector(".day-preview-date").textContent = formatDate(dayStart);
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    const listEl = sheet.el.querySelector("#day-preview-list");

    function refresh() {
      const entries = getDiaryEntries()
        .filter((e) => startOfDay(e.createdAt) === dayStart)
        .sort((a, b) => b.createdAt - a.createdAt);
      listEl.replaceChildren(
        ...entries.map((entry) =>
          renderEntryRow(entry, () => {
            refresh();
            renderList();
          })
        )
      );
    }
    refresh();
  }
}

// Exported so the finish screen's "See entry" link can open the same entry
// view without duplicating the summary-rendering logic here. `onUpdate` fires
// after an in-place edit (with the sheet staying open) or right before the
// sheet closes itself following a delete, so callers can refresh their lists.
export function renderDiaryEntrySheet(entry, { onUpdate } = {}) {
  const sheet = openSheet("tpl-diary-entry");

  function renderContent() {
    sheet.el.querySelector(".diary-entry-date").textContent = `${formatDate(entry.createdAt)} · ${formatTime(entry.createdAt)}`;

    const body = sheet.el.querySelector(".diary-entry-body");
    body.replaceChildren();
    if (entry.type === "workout") {
      const strong = document.createElement("strong");
      strong.textContent = entry.workoutName || "Untitled workout";
      body.appendChild(strong);
      body.appendChild(document.createTextNode(`\nDuration: ${formatClock(entry.totalSeconds)}\n\n`));
      groupIntervals(entry.intervals || []).forEach((g) => {
        body.appendChild(document.createTextNode(`• ${formatGroupLine(g)}\n`));
      });
    } else {
      body.textContent = entry.text || "";
    }

    const notesSection = sheet.el.querySelector(".diary-entry-notes");
    if (entry.notes) {
      notesSection.classList.remove("hidden");
      sheet.el.querySelector(".diary-entry-notes-text").textContent = entry.notes;
    } else {
      notesSection.classList.add("hidden");
    }
  }
  renderContent();

  sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
  sheet.el.querySelector(".edit-entry-btn").addEventListener("click", () => {
    openEditEntry(entry, () => {
      const fresh = getDiaryEntry(entry.id);
      if (fresh) {
        entry.text = fresh.text;
        entry.notes = fresh.notes;
        renderContent();
      }
      onUpdate?.();
    });
  });
  sheet.el.querySelector(".delete-entry-btn").addEventListener("click", () => {
    confirmDeleteEntry(entry, () => {
      sheet.close();
      onUpdate?.();
    });
  });

  return sheet;
}
