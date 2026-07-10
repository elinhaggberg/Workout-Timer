export function openSheet(templateId) {
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
