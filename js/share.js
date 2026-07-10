export function filenameFor(name, ext = "json") {
  const slug = (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "workout"}.${ext}`;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tries the native share sheet first (best for "send this to someone" on a
// phone); falls back to a plain file download anywhere that isn't supported.
export async function shareOrDownload(filename, content, shareTitle) {
  const file = new File([content], filename, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // fall through to download on any other failure
    }
  }

  downloadFile(filename, content);
  return "downloaded";
}
