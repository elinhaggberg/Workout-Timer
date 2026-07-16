import { getDiaryEntries, addDiaryEntry } from "../storage.js";
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

    listEl.replaceChildren(...entries.map(renderEntryRow));
  }

  function renderEntryRow(entry) {
    const card = document.createElement("article");
    card.className = "card diary-row";
    const main = document.createElement("div");
    main.className = "card-main";
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = previewText(entry);
    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = `${formatDate(entry.createdAt)} · ${formatTime(entry.createdAt)}`;
    main.append(title, meta);
    card.appendChild(main);
    card.addEventListener("click", () => {
      renderDiaryEntrySheet(entry);
    });
    return card;
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
    const entries = getDiaryEntries()
      .filter((e) => startOfDay(e.createdAt) === dayStart)
      .sort((a, b) => b.createdAt - a.createdAt);

    const sheet = openSheet("tpl-day-preview");
    sheet.el.querySelector(".day-preview-date").textContent = formatDate(dayStart);
    sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());

    const listEl = sheet.el.querySelector("#day-preview-list");
    listEl.replaceChildren(...entries.map(renderEntryRow));
  }
}

// Exported so the finish screen's "See entry" link can open the same entry
// view without duplicating the summary-rendering logic here.
export function renderDiaryEntrySheet(entry) {
  const sheet = openSheet("tpl-diary-entry");
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

  sheet.el.querySelector(".close-btn").addEventListener("click", () => sheet.close());
  return sheet;
}
