const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "https://fistkk71.github.io"]; if (!ALLOWED.includes(location.origin)) location.replace("https://tokosai.net");

import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}時間${m}分${s}秒` : `${m}分${s}秒`;
};

// —— 新トークン（例）＋旧トークン互換 ——
// 既存の印刷物があれば、ここに追加で対応可
const TOKEN_TABLE = Object.freeze({
  // 新
  "TH-GOAL-GRAND": "qr1", // グランエミオ所沢
  "TH-GOAL-CITY": "qr3", // シティタワー所沢クラッシィ
  // 旧（必要なら片方だけ残す）
  "G7fS9LzA": "qr1",
  "T9nDv4We": "qr3"
});

async function init() {
  // ===== メタ（qr.html内template 未変更でも動くが、可能なら data-total="1" に） =====
  const metaEl = document.getElementById("qr-meta");
  const META = metaEl?.dataset || {};
  const TOTAL = 1; // ← 強制 1 個で終了
  const VIDEO_SRC = META.video || "./image/treasure.mp4";
  // 2地点のみを対象に（id は既存の map 側想定に合わせて qr1/qr3 を採用）
  const POINTS = [
    { "id": "qr1", "name": "グランエミオ所沢" },
    { "id": "qr3", "name": "シティタワー所沢クラッシィ" }
  ];

  // ===== HUD =====
  const totalCountEl = document.getElementById("totalCount");
  const foundCountEl = document.getElementById("foundCount");
  const remainCountEl = document.getElementById("remainCount");
  const elapsedTimeEl = document.getElementById("elapsedTime");
  const progressBarEl = document.getElementById("progress-bar");
  const titleEl = document.getElementById("qrTitle");
  const placeEl = document.getElementById("qrPlace");
  const goalNote = document.getElementById("goalNote");
  totalCountEl && (totalCountEl.textContent = String(TOTAL));

  document.getElementById("skipBtn")?.remove();
  await ensureAuthed();

  // ===== uid 決定 =====
  const qs = new URLSearchParams(location.search);
  const qsUid = qs.get("uid");
  const TEST_MODE = qs.get("test") === "1" || qsUid === "test" || location.hostname === "localhost";

  if (qsUid) localStorage.setItem("uid", qsUid);
  let uid = localStorage.getItem("uid");
  if (!uid && TEST_MODE) { uid = "test"; localStorage.setItem("uid", "test"); }
  if (!uid) { alert("参加情報が見つかりません。受付からやり直してください。"); location.href = "register.html"; return; }

  // ===== 地点判定 =====
  const rawKey = (qs.get("key") || qs.get("k") || qs.get("id") || "").toLowerCase();
  const token = qs.get("token") || qs.get("t") || "";
  const key = rawKey || TOKEN_TABLE[token] || "";
  const point = POINTS.find(p => p.id === key);

  if (!key || !point) {
    titleEl.textContent = "QRが無効です";
    placeEl.textContent = "もう一度スキャンしてください。";
    setPrimaryCTA("無効なQRです", null, { disabled: true });
  } else {
    titleEl.textContent = "お宝のQRを発見！";
    placeEl.textContent = `地点：${point.name}`;
    setPrimaryCTA("ゲームをプレイする", runFlow);
  }

  updateHUD();

  async function updateHUD() {
    try {
      const pointsSnap = await getDocs(collection(db, "teams", uid, "points"));
      const count = pointsSnap.size;
      foundCountEl && (foundCountEl.textContent = String(count));
      remainCountEl && (remainCountEl.textContent = String(Math.max(TOTAL - count, 0)));
      progressBarEl && (progressBarEl.style.width = `${Math.min(100, (count / TOTAL) * 100)}%`);

      const teamSnap = await getDoc(doc(db, "teams", uid));
      if (teamSnap.exists() && teamSnap.data().startTime) {
        const startMs = teamSnap.data().startTime.toMillis();
        elapsedTimeEl && (elapsedTimeEl.textContent = fmt(Date.now() - startMs));
      }
    } catch (e) { console.error("HUD更新失敗:", e); }
  }

  function setPrimaryCTA(label, onClick, opts = {}) {
    const current = document.getElementById("primaryCta");
    if (!current) return null;
    const btn = current.cloneNode(true);
    btn.id = "primaryCta";
    btn.textContent = label;
    btn.className = opts.className || current.className;
    btn.disabled = !!opts.disabled;
    current.replaceWith(btn);
    if (typeof onClick === "function") btn.addEventListener("click", onClick);
    return btn;
  }

  function playTetrisInOverlay(targetLines = 10) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, { position: "fixed", inset: "0", background: "#000", display: "grid", placeItems: "center", zIndex: "4000" });
      const frame = document.createElement("iframe");
      frame.src = `./game1/tetris.html?target=${encodeURIComponent(targetLines)}`;
      frame.setAttribute("allow", "fullscreen *; autoplay *; gamepad *");
      Object.assign(frame.style, { width: "100vw", height: "100vh", border: "0", background: "#000" });
      overlay.appendChild(frame);
      document.body.appendChild(overlay);

      const onMsg = (ev) => {
        const d = ev.data;
        if (!d || d.type !== "minigame:clear") return;
        cleanup();
        resolve(Boolean(d.detail?.cleared));
      };
      window.addEventListener("message", onMsg);
      function cleanup() { window.removeEventListener("message", onMsg); overlay.remove(); }
    });
  }
  function playDummyCountdown() {
    return new Promise(async (resolve) => {
      const btn = setPrimaryCTA("プレイ中…", null, { disabled: true });
      for (let i = 3; i >= 1; i--) { if (btn) btn.textContent = `プレイ中… ${i}`; await sleep(1000); }
      resolve(true);
    });
  }
  function playRewardFull() {
    return new Promise(async (resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, { position: "fixed", inset: "0", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "3000" });
      const video = document.createElement("video");
      video.src = VIDEO_SRC; video.playsInline = true; video.autoplay = true; video.muted = true; video.controls = false;
      Object.assign(video.style, { width: "100vw", height: "100vh", objectFit: "contain", background: "#000" });
      overlay.appendChild(video);
      document.body.appendChild(overlay);
      const finish = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { } overlay.remove(); resolve(); };
      video.addEventListener("ended", finish, { once: true });
      video.play().catch(() => { });
      try { const p = overlay.requestFullscreen?.() || video.requestFullscreen?.(); if (p && typeof p.then === "function") await p; video.muted = false; } catch { }
    });
  }

  async function recordTreasureIfNeeded(pointId) {
    const ref = doc(db, "teams", uid, "points", pointId);
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { foundAt: serverTimestamp() });
    try {
      window.markTreasureFound?.(pointId);
      const s = new Set(JSON.parse(localStorage.getItem("found") || "[]"));
      s.add(pointId); localStorage.setItem("found", JSON.stringify([...s]));
    } catch { }
  }

  async function runAfterGame() {
    await playRewardFull();
    try {
      if (key) await recordTreasureIfNeeded(key);
      await updateHUD();
      const count = (await getDocs(collection(db, "teams", uid, "points"))).size;
      if (count >= TOTAL) {
        goalNote?.classList.remove("hidden");
        setPrimaryCTA("クーポン券を受け取る", () => { location.href = `goal.html?uid=${encodeURIComponent(uid)}`; });
      } else {
        setPrimaryCTA("次のお宝を探す", () => { location.href = "map.html"; });
      }
    } catch (e) {
      console.error(e);
      setPrimaryCTA("次のお宝を探す", () => { location.href = "map.html"; });
    }
  }

  async function runFlow() {
    if (!key || !point) return;
    setPrimaryCTA("ゲーム起動中…", null, { disabled: true });
    let cleared = false;
    if (key === "qr1") cleared = await playTetrisInOverlay(10);
    else if (key === "qr3") cleared = await playDummyCountdown();
    else cleared = true;
    if (!cleared) { setPrimaryCTA("再チャレンジしますか？", runFlow); return; }
    await runAfterGame();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { init().catch(console.error); });
} else {
  init().catch(console.error);
}
