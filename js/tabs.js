// Wires a row of ".tab-option" buttons (a .segmented control) to show/hide
// their matching panels. Shared by the add-interval picker and the Exercise
// Library sheet, which both use the same two-tab pattern.
export function initTabs(root, panels) {
  const buttons = [...root.querySelectorAll(".tab-option")];
  function activate(tab) {
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle("hidden", key !== tab));
  }
  buttons.forEach((b) => b.addEventListener("click", () => activate(b.dataset.tab)));
  activate(buttons[0]?.dataset.tab);
}
