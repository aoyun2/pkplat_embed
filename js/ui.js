// js/ui.js
const el = (id) => document.getElementById(id);

export function initUI() {
  const modalBack = el("modalBack");
  const panelControls = el("panelControls");
  const panelSaves = el("panelSaves");
  const modalTitle = el("modalTitle");

  function open(which) {
    modalBack.hidden = false;
    if (which === "controls") {
      modalTitle.textContent = "Controls";
      panelControls.hidden = false;
      panelSaves.hidden = true;
    } else {
      modalTitle.textContent = "Saves";
      panelControls.hidden = true;
      panelSaves.hidden = false;
    }
  }

  function close() {
    modalBack.hidden = true;
  }

  el("btnControls").onclick = () => open("controls");
  el("btnSaves").onclick = () => open("saves");
  el("btnClose").onclick = close;
  modalBack.addEventListener("click", (e) => { if (e.target === modalBack) close(); });

  // Save tools
  el("btnExport").onclick = async () => {
    const lf = window.localforage;
    const key = window.__DESMOND_SAVE_KEY__;
    if (!lf || !key) return alert("Not ready yet (localforage or save key missing).");

    const data = await lf.getItem(key);
    if (!data) return alert("No save data found yet. Save in-game, wait a moment, then try again.");

    const blob = new Blob([data], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${key}.dsv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  el("importFile").addEventListener("change", async (ev) => {
    const lf = window.localforage;
    const key = window.__DESMOND_SAVE_KEY__;
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!lf || !key) return alert("Not ready yet (localforage or save key missing).");
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      return alert("That file looks too large for a DS battery save.");
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    await lf.setItem(key, buf);
    alert("Save imported. Reloading…");
    location.reload();
  });

  el("btnClear").onclick = async () => {
    const lf = window.localforage;
    const key = window.__DESMOND_SAVE_KEY__;
    if (!lf || !key) return alert("Not ready yet (localforage or save key missing).");
    if (!confirm("Delete the stored save for this game?")) return;
    await lf.removeItem(key);
    alert("Save cleared. Reloading…");
    location.reload();
  };
}

export async function updateSavePanel() {
  const lf = window.localforage;
  const key = window.__DESMOND_SAVE_KEY__;
  const game = window.__DESMOND_GAME_ID__;

  el("saveKey").textContent = `Save key: ${key ?? "—"}`;
  el("pillGame").textContent = `Game: ${game ? game.trim() : "—"}`;

  if (!lf || !key) {
    el("saveStatus").textContent = "Save status: (not ready yet)";
    return;
  }

  try {
    const data = await lf.getItem(key);
    el("saveStatus").textContent =
      `Save status: ${data ? `present (${(data.length/1024).toFixed(0)} KB)` : "none yet"}`;
  } catch (e) {
    el("saveStatus").textContent = "Save status: error accessing storage";
    console.warn(e);
  }
}
