import { renderHome } from "./views/home.js";
import { renderEditor } from "./views/editor.js";
import { renderPlayer } from "./views/player.js";
import { renderFinish } from "./views/finish.js";
import { applyTheme } from "./theme.js";

applyTheme();

const root = document.getElementById("app");
let pendingFinishSummary = null;
let pendingAdhocWorkout = null;

const nav = {
  toHome: () => {
    location.hash = "#/home";
  },
  toEditor: (id) => {
    location.hash = id ? `#/edit/${id}` : "#/edit/new";
  },
  toPlayer: (id) => {
    location.hash = `#/play/${id}`;
  },
  // For ephemeral, unsaved workouts (e.g. the quick Tabata timer) that have
  // no id to look up in storage.
  toPlayerAdhoc: (workout) => {
    pendingAdhocWorkout = workout;
    location.hash = "#/play/adhoc";
  },
  toFinish: (summary) => {
    pendingFinishSummary = summary;
    location.hash = "#/finish";
  },
};

function route() {
  const hash = location.hash || "#/home";
  const match = hash.match(/^#\/([a-z]+)(?:\/(.+))?$/);
  const view = match ? match[1] : "home";
  const param = match ? match[2] : null;

  switch (view) {
    case "edit":
      renderEditor(root, nav, param === "new" ? null : param);
      break;
    case "play":
      if (param === "adhoc") {
        if (!pendingAdhocWorkout) {
          nav.toHome();
          return;
        }
        renderPlayer(root, nav, null, pendingAdhocWorkout);
      } else {
        renderPlayer(root, nav, param);
      }
      break;
    case "finish":
      if (!pendingFinishSummary) {
        nav.toHome();
        return;
      }
      renderFinish(root, nav, pendingFinishSummary);
      break;
    default:
      renderHome(root, nav);
  }
}

window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
