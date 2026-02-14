// js/desmond-loader.js
export async function loadDesmondPatched({
  cdnUrl = "https://cdn.jsdelivr.net/gh/Unzor/desmond/cdn/desmond.min.js",
  patchIOSSaveDisable = true,
} = {}) {
  if (window.__DESMOND_LOADED__) return;

  const res = await fetch(cdnUrl, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to fetch desmond.min.js: HTTP ${res.status}`);
  let code = await res.text();

  // Patch: desmond disables saving on iOS unless "standalone" web app.
  // Replace the condition with "false" so the block never runs.
  if (patchIOSSaveDisable) {
    code = code.replaceAll("isIOS&&!isWebApp", "false");
  }

  const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = blobUrl;
    s.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
    s.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("Failed to execute patched desmond script")); };
    document.head.appendChild(s);
  });

  window.__DESMOND_LOADED__ = true;
}