// js/main.js
import { loadDesmondPatched } from "./desmond-loader.js";
import { initUI, updateSavePanel } from "./ui.js";

const el = (id) => document.getElementById(id);

// ====== CONFIG ======
// Option A: hardcode
const DEFAULT_ROM_URL = "https://files.catbox.moe/35lx11.nds"; // e.g. "https://example.com/mygame.nds"
// Option B: URL param ?rom=https://...
// ====================

function fmtMB(bytes){ return (bytes/(1024*1024)).toFixed(bytes < 10*1024*1024 ? 1 : 0) + " MB"; }
function fmtSpeed(bps){
  if (!isFinite(bps) || bps <= 0) return "—";
  const mbps = bps/(1024*1024);
  return mbps.toFixed(mbps < 10 ? 1 : 0) + " MB/s";
}
function fmtETA(sec){
  if (!isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return (m ? `${m}m ` : "") + `${s}s`;
}

async function fetchWithProgress(url, onProgress){
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ROM download failed: HTTP ${r.status}`);
  const total = Number(r.headers.get("content-length")) || 0;

  if (r.body && r.body.getReader) {
    const reader = r.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
    const out = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.byteLength; }
    return out;
  }

  const buf = new Uint8Array(await r.arrayBuffer());
  onProgress(buf.byteLength, total || buf.byteLength);
  return buf;
}

function computeGameID(romU8, fallbackName = "game.nds") {
  let gameID = "";
  for (let i = 0; i < 16; i++) {
    const b = romU8[i] ?? 0;
    gameID += (b === 0) ? " " : String.fromCharCode(b);
  }
  // Mirror desmond behavior: if header indicates "#", use filename
  if (gameID[12] === "#") gameID = fallbackName;
  return gameID;
}

// Side-by-side: left half = top screen, right half = bottom screen
function forceSideBySide(player){
  const apply = () => {
    const sr = player.shadowRoot;
    if (!sr) return false;

    let top = sr.querySelector("canvas#top");
    let bottom = sr.querySelector("canvas#bottom");
    if (!top || !bottom) {
      const cvs = sr.querySelectorAll("canvas");
      if (cvs.length >= 2) { top = cvs[0]; bottom = cvs[1]; }
    }
    if (!top || !bottom) return false;

    const setup = (c) => {
      c.style.position = "fixed";
      c.style.top = "50%";
      c.style.transformOrigin = "50% 50%";
      c.style.imageRendering = "pixelated";
      c.style.zIndex = "1";
    };
    setup(top); setup(bottom);

    const resize = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const halfW = W / 2;

      // maximize each screen inside its half while keeping 256x192 aspect
      const s = Math.min(halfW / 256, H / 192);

      top.style.left = (halfW * 0.5) + "px";
      bottom.style.left = (halfW * 1.5) + "px";

      top.style.transform = `translate(-50%, -50%) scale(${s})`;
      bottom.style.transform = `translate(-50%, -50%) scale(${s})`;
    };

    window.addEventListener("resize", resize, { passive: true });
    resize();
    return true;
  };

  if (apply()) return;
  const mo = new MutationObserver(() => { if (apply()) mo.disconnect(); });
  mo.observe(player, { childList:true, subtree:true });
  const t = setInterval(() => {
    if (player.shadowRoot) { mo.observe(player.shadowRoot, { childList:true, subtree:true }); clearInterval(t); }
  }, 50);
  setTimeout(() => clearInterval(t), 5000);
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const ok = await navigator.storage.persist();
      el("pillStorage").textContent = `Storage: ${ok ? "persistent" : "best-effort"}`;
      return;
    }
  } catch {}
  el("pillStorage").textContent = "Storage: best-effort";
}

window.addEventListener("load", async () => {
  initUI();

  const params = new URLSearchParams(location.search);
  const ROM_URL = params.get("rom") || DEFAULT_ROM_URL;

  if (!ROM_URL) {
    el("sub").textContent = "Missing ROM URL. Set DEFAULT_ROM_URL in js/main.js or use ?rom=…";
    el("pct").textContent = "—";
    el("note").textContent = "Example: https://yourname.github.io/repo/?rom=https://example.com/game.nds";
    return;
  }

  await requestPersistentStorage();

  // Load (patched) desmond script first (adds <desmond-player> behaviors)
  await loadDesmondPatched();

  // Configure localforage before loading the ROM (affects save storage location)
  if (window.localforage?.config) {
    window.localforage.config({
      name: "desmond_saves",
      storeName: "saves",
      description: "Battery saves for desmond",
    });
  }

  // Download ROM with progress (then feed as blob URL so desmond doesn't re-download from network)
  const bar = el("bar");
  const pct = el("pct");
  const dl = el("dl");
  const eta = el("eta");
  const sub = el("sub");

  let lastT = performance.now(), lastB = 0, ema = 0;

  const romU8 = await fetchWithProgress(ROM_URL, (received, total) => {
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    if (dt >= 0.25) {
      const db = received - lastB;
      const inst = db / dt;
      ema = ema ? (ema * 0.75 + inst * 0.25) : inst;
      lastT = now; lastB = received;
    }

    const p = total ? Math.min(1, received / total) : 0;
    bar.style.width = total ? (p*100).toFixed(1) + "%" : "18%";
    pct.textContent = total ? Math.floor(p*100) + "%" : "…";
    dl.textContent = total ? `${fmtMB(received)} / ${fmtMB(total)}` : fmtMB(received);
    const e = (total && ema > 0) ? (total - received) / ema : NaN;
    eta.textContent = `${fmtSpeed(ema)} • ETA ${fmtETA(e)}`;
  });

  const fallbackName = ROM_URL.split("/").pop() || "game.nds";
  const gameID = computeGameID(romU8, fallbackName);
  const saveKey = `sav-${gameID}`;

  window.__DESMOND_GAME_ID__ = gameID;
  window.__DESMOND_SAVE_KEY__ = saveKey;

  await updateSavePanel();

  sub.textContent = "Initializing emulator…";

  const blobUrl = URL.createObjectURL(new Blob([romU8], { type:"application/octet-stream" }));
  const player = el("player");

  player.loadURL(blobUrl, async () => {
    el("loader").style.display = "none";
    forceSideBySide(player);
    await updateSavePanel();
  });

  // fallback if callback never fires
  setTimeout(() => forceSideBySide(player), 1200);
  setTimeout(() => { el("loader").style.display = "none"; }, 3000);
});
