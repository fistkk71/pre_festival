const CANON_ORIGIN = "https://fistkk71.github.io";
const CANON_BASE   = "/pre_festival/";
if (location.origin !== CANON_ORIGIN || !location.pathname.startsWith(CANON_BASE)) {
  location.replace(CANON_ORIGIN + CANON_BASE);
}



import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==========================
// ユーティリティ
// ==========================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return h > 0 ? `${h}時間${m}分${s}秒` : `${m}分${s}秒`;
};

// ==========================
// トークンテーブル（新旧対応）
// ==========================
const TOKEN_TABLE = Object.freeze({
  // —— ゴール（2地点） ——
  TH_GOAL_GRAND: "qr1", // グランエミオ所沢
  TH_GOAL_CITY: "qr2", // シティタワー所沢クラッシィ

  // —— スタート受付（エミテラス） ——
  TH_GATE_EMI: "gate-emi",

  // 旧（必要なら片方だけ残す）
  G7fS9LzA: "qr1",
  T9nDv4We: "qr2",
});

// ==========================
// 仕様定義（今回の一筆書きルール）
// ==========================
const GOAL_IDS = new Set(["qr1","qr2"]);
const TOTAL_GOALS_TO_CLEAR = 1; // 1個見つけたら終了

// （任意）受付の有効期間を付けたい場合は有効化
// 例：同日内のみOK等の運用に
const USE_GATE_STALE_CHECK = false;
const GATE_STALE_LIMIT_MS = 1000 * 60 * 60 * 8; // 8時間（必要なら変更）

async function init() {
  // ===== メタ（qr.html内template 未変更でも動くが、可能なら data-total="1" に） =====
  const metaEl = document.getElementById("qr-meta");
  const META = metaEl?.dataset || {};
  const TOTAL = TOTAL_GOALS_TO_CLEAR; // ← 強制 1 個で終了
  const VIDEO_SRC = META.video || "./image/treasure.mp4";

  // ===== 対象QR（表示用の名称辞書） =====
  // type: "goal" | "gate" を付けて役割を明示（HUD集計の判定に使う）
  const POINTS = [
        { id: "qr1", name: "グランエミオ所沢", type: "goal" },
    { id: "qr2", name: "シティタワー所沢クラッシィ", type: "goal" },
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

  // スキップボタンは不要
  document.getElementById("skipBtn")?.remove();

  await ensureAuthed();

  // ===== uid 決定 =====
  const qs = new URLSearchParams(location.search);
  const qsUid = qs.get("uid");
  const TEST_MODE =
    qs.get("test") === "1" || qsUid === "test" || location.hostname === "localhost";

  if (qsUid) localStorage.setItem("uid", qsUid);
  let uid = localStorage.getItem("uid");
  if (!uid && TEST_MODE) {
    uid = "test";
    localStorage.setItem("uid", "test");
  }
  if (!uid) {
    alert("参加情報が見つかりません。受付からやり直してください。");
    location.href = "register.html";
    return;
  }

  // ===== QRキー判定（key / token / id を許容） =====
  const rawKey = (qs.get("key") || qs.get("k") || qs.get("id") || "").toLowerCase();
  const token = qs.get("token") || qs.get("t") || "";
  const key = rawKey || TOKEN_TABLE[token] || "";
  const point = POINTS.find((p) => p.id === key);

  // ===== UIセットアップ =====
  if (!key || !point) {
    titleEl.textContent = "QRが無効です";
    placeEl.textContent = "もう一度スキャンしてください。";
    setPrimaryCTA("無効なQRです", null, { disabled: true });
    return; // 以降の処理を行わない
  }

    // —— ゴール系QR（qr1/qr2）を読み取った場合：受付通過チェック ——
  if (GOAL_IDS.has(point.id)) {
    const gateOK = await ensureGateBeforeGoal(uid);
    if (!gateOK) {
      titleEl.textContent = "まだスタートしていません";
      placeEl.textContent =
        "まずは『エミテラス所沢（スタート）』のQRを読み取ってから、ゴール地点へ向かってください。";

      // 地図へ誘導する大きなCTA
      setPrimaryCTA("スタート地点（エミテラス）へ", () => {
        // 可能なら地図側で #emi または ?focus=emi を解釈してマーカーをハイライト
        location.href = "map.html?focus=emi&hint=start";
      }, { className: "btn btn-primary w-full text-lg" });

      // 説明的なボタン（任意で2ndCTAを用意したい場合）
      createSecondaryCTA(
        "今のQRを保存しておく",
        async () => {
          // 不正クリアを避けるため、ここではゴール記録はしない
          alert(
            "スタート後にもう一度このQRを読み取ればクリアできます（途中保存は不要です）。"
          );
        },
        { className: "btn btn-ghost mt-2" }
      );

      // ゴール処理はここで中断（ゲーム起動させない）
      return;
    }
  }

  // —— ここまで来たら、通常のゴールフローに乗せる ——
  titleEl.textContent = "お宝のQRを発見！";
  placeEl.textContent = `地点：${point.name}`;
  setPrimaryCTA("ゲームをプレイする", runFlow);

  // ===== HUD初期表示 =====
  await updateHUD();

  // ==========================
  // 内部関数
  // ==========================
  async function updateHUD() {
    try {
      // ゴール（qr1/qr2）だけを集計
      const count = await getGoalCount(uid);
      foundCountEl && (foundCountEl.textContent = String(count));
      remainCountEl && (remainCountEl.textContent = String(Math.max(TOTAL - count, 0)));
      progressBarEl && (progressBarEl.style.width = `${Math.min(100, (count / TOTAL) * 100)}%`);

      // 経過時間
      const teamSnap = await getDoc(doc(db, "teams", uid));
      if (teamSnap.exists() && teamSnap.data().startTime) {
        const startMs = teamSnap.data().startTime.toMillis();
        elapsedTimeEl && (elapsedTimeEl.textContent = fmt(Date.now() - startMs));
      }
    } catch (e) {
      console.error("HUD更新失敗:", e);
    }
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

  function createSecondaryCTA(label, onClick, opts = {}) {
    const anchor = document.getElementById("secondaryCtaAnchor");
    if (!anchor) return null;
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.className || "btn";
    btn.id = "secondaryCta";
    anchor.innerHTML = "";
    anchor.appendChild(btn);
    if (typeof onClick === "function") btn.addEventListener("click", onClick);
    return btn;
  }

  function playTetrisInOverlay(targetLines = 10) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "#000",
        display: "grid",
        placeItems: "center",
        zIndex: "4000",
      });
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
      function cleanup() {
        window.removeEventListener("message", onMsg);
        overlay.remove();
      }
    });
  }

  function playDummyCountdown() {
    return new Promise(async (resolve) => {
      const btn = setPrimaryCTA("プレイ中…", null, { disabled: true });
      for (let i = 3; i >= 1; i--) {
        if (btn) btn.textContent = `プレイ中… ${i}`;
        await sleep(1000);
      }
      resolve(true);
    });
  }

  function playRewardFull() {
    return new Promise(async (resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "3000",
      });
      const video = document.createElement("video");
      video.src = VIDEO_SRC;
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;
      video.controls = false;
      Object.assign(video.style, { width: "100vw", height: "100vh", objectFit: "contain", background: "#000" });
      overlay.appendChild(video);
      document.body.appendChild(overlay);
      const finish = async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
        } catch {}
        overlay.remove();
        resolve();
      };
      video.addEventListener("ended", finish, { once: true });
      video.play().catch(() => {});
      try {
        const p = overlay.requestFullscreen?.() || video.requestFullscreen?.();
        if (p && typeof p.then === "function") await p;
        video.muted = false;
      } catch {}
    });
  }

  async function recordPointIfNeeded(uid, pointId) {
    const ref = doc(db, "teams", uid, "points", pointId);
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { foundAt: serverTimestamp() });

    // map.html 側のローカル同期（任意）
    try {
      window.markTreasureFound?.(pointId);
      const s = new Set(JSON.parse(localStorage.getItem("found") || "[]"));
      s.add(pointId);
      localStorage.setItem("found", JSON.stringify([...s]));
    } catch {}
  }

  async function getGoalCount(uid) {
    const pointsSnap = await getDocs(collection(db, "teams", uid, "points"));
    let cnt = 0;
    pointsSnap.forEach((d) => {
      if (GOAL_IDS.has(d.id)) cnt++;
    });
    return cnt;
  }



async function ensureRegistered(uid) {
  try {
    const ref = doc(db, "teams", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false; // チームドキュメントがない
    const d = snap.data() || {};
    // 登録完了の目印：teamName が文字列、members が1以上、startTime が存在（運用に合わせて調整可）
    if (typeof d.teamName !== "string" || !d.teamName.trim()) return false;
    if (typeof d.members !== "number" || !(d.members > 0)) return false;
    if (!d.startTime) return false;
    return true;
  } catch (e) {
    console.warn("ensureRegistered failed:", e);
    return false; // エラー時は安全側で未登録と扱う
  }
}

async function runAfterGame() {
    await playRewardFull();
    try {
      if (key) await recordPointIfNeeded(uid, key);
      await updateHUD();
      const count = await getGoalCount(uid);
      if (count >= TOTAL) {
        goalNote?.classList.remove("hidden");
        setPrimaryCTA("クーポン券を受け取る", () => {
          location.href = `goal.html?uid=${encodeURIComponent(uid)}`;
        });
      } else {
        setPrimaryCTA("次のお宝を探す", () => {
          location.href = "map.html";
        });
      }
    } catch (e) {
      console.error(e);
      setPrimaryCTA("次のお宝を探す", () => {
        location.href = "map.html";
      });
    }
  }

  async function runFlow() {
    if (!key || !point) return;
    setPrimaryCTA("ゲーム起動中…", null, { disabled: true });
    let cleared = false;
    if (key === "qr1") cleared = await playTetrisInOverlay(10);
    else if (key === "qr2") cleared = await playDummyCountdown();
    else cleared = true;
    if (!cleared) {
      setPrimaryCTA("再チャレンジしますか？", runFlow);
      return;
    }
    await runAfterGame();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch(console.error);
  });
} else {
  init().catch(console.error);
}