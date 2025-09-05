import { db, ensureAuthed } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ---------- DOM ---------- */
const titleEl = document.getElementById("statusTitle");
const badgeEl = document.getElementById("statusBadge");
const uidEl = document.getElementById("vUid");
const teamEl = document.getElementById("vTeam");
const memEl = document.getElementById("vMembers");
const foundEl = document.getElementById("vFound");
const elapsedEl = document.getElementById("vElapsed");
const redEl = document.getElementById("vRedeemed");
const redeemBtn = document.getElementById("redeemBtn");
const noteEl = document.getElementById("note");

const layerEl = document.getElementById("pwLayer");
const gateEl = document.getElementById("pwGate");
const mainEl = document.getElementById("main");
const pwInput = document.getElementById("pwInput");
const pwBtn = document.getElementById("pwBtn");
const pwMsg = document.getElementById("pwMsg");

/* ---------- CONSTS ---------- */
const VERIFY_KEY = "verify_ok";              // ローカルUX用（表示制御）
const VERIFY_EXP = "verify_exp";
const VERIFY_TTL_MS = 12 * 60 * 60 * 1000;      // 12h（ルール側でも最大12hに制限）

/* ---------- Utils ---------- */
const setBadge = (t, s) => { if (!badgeEl) return; badgeEl.className = `verify-badge ${t}`; badgeEl.textContent = s; };
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h > 0 ? `${h}時間${m}分${r}秒` : `${m}分${r}秒`; };

async function sha256Hex(str) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function createVerifySessionWith(pw) {
  await ensureAuthed();                                    // 匿名ログイン
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error("no-auth");
  const hash = await sha256Hex((pw || "").trim());
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);  // クライアント計算（ルールで最大12hに制限）
  await setDoc(doc(db, "verify_sessions", uid), { hash, expiresAt });
}

/* ---------- Main ---------- */
async function main() {
  await ensureAuthed();

  const p = new URLSearchParams(location.search);
  const uid = p.get("uid") || "";
  if (uidEl) uidEl.textContent = uid || "-";
  if (!uid) {
    if (titleEl) titleEl.textContent = "無効なQRです";
    setBadge("ng", "UIDがありません");
    if (redeemBtn) redeemBtn.disabled = true;
    if (noteEl) noteEl.textContent = "ゴール画面のQRを再読み取りしてください。";
    return;
  }

  try {
    const teamRef = doc(db, "teams", uid);
    const teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) {
      if (titleEl) titleEl.textContent = "無効なUIDです";
      setBadge("ng", "チームが見つかりません");
      if (redeemBtn) redeemBtn.disabled = true;
      return;
    }

    const data = teamSnap.data();
    const teamName = data.teamName || "-";
    const members = data.members || 0;

    const REQUIRED = 1; // クリア必要数（宝の個数）
    const ps = await getDocs(collection(db, "teams", uid, "points"));
    const found = ps.size;

    if (teamEl) teamEl.textContent = teamName;
    if (memEl) memEl.textContent = String(members);
    if (foundEl) foundEl.textContent = `${found} / ${REQUIRED}`;

    let elapsed = data.elapsed;
    if (!elapsed && data.startTime) {
      const end = data.endTime?.toMillis?.() ?? Date.now();
      elapsed = end - data.startTime.toMillis();
    }
    if (elapsedEl) elapsedEl.textContent = elapsed ? fmt(elapsed) : "計測なし";

    const redeemedAt = data.redeemedAt?.toDate?.();
    if (redEl) redEl.textContent = redeemedAt ? `済（${redeemedAt.toLocaleString()}）` : "未";

    if (found < REQUIRED) {
      if (titleEl) titleEl.textContent = "未達です";
      setBadge("ng", "宝が規定数に達していません");
      if (redeemBtn) redeemBtn.disabled = true;
      if (noteEl) noteEl.textContent = "参加者をマップへご案内ください。";
      return;
    }

    if (titleEl) titleEl.textContent = "引き換えできます";
    setBadge("ok", "OK");

    if (redeemedAt) {
      if (redeemBtn) { redeemBtn.textContent = "すでに引き換え済み"; redeemBtn.disabled = true; }
      return;
    }

    if (redeemBtn) redeemBtn.disabled = false;
    if (redeemBtn) redeemBtn.onclick = async () => {
      redeemBtn.disabled = true; redeemBtn.textContent = "登録中…";
      try {
        await updateDoc(teamRef, { redeemedAt: serverTimestamp() }); // ← ルール: hasValidVerifySession() が必要
        if (titleEl) titleEl.textContent = "引き換え完了しました";
        setBadge("ok", "完了");
        if (redEl) redEl.textContent = `済（${new Date().toLocaleString()}）`;
        redeemBtn.textContent = "完了しました";
      } catch (e) {
        console.error("[verify] redeem failed:", e);
        if (e?.code === "permission-denied") {
          setBadge("ng", "権限エラー");
          if (noteEl) noteEl.textContent = "パスワードの再認証が必要です。ボタンを押して再認証してください。";
          redeemBtn.textContent = "パスワードを再認証";
          redeemBtn.disabled = false;
          redeemBtn.onclick = () => {
            // 再認証フローへ（ローカルのOKフラグを無効化してオーバーレイを表示）
            localStorage.removeItem(VERIFY_KEY);
            localStorage.removeItem(VERIFY_EXP);
            if (mainEl) mainEl.hidden = true;
            if (layerEl) layerEl.hidden = false;
            pwInput?.focus();
          };
        } else {
          setBadge("warn", "通信エラー");
          if (noteEl) noteEl.textContent = "ネットワーク状況をご確認ください。";
          redeemBtn.textContent = "もう一度試す";
          redeemBtn.disabled = false;
        }
      }
    };
  } catch (e) {
    console.error("[verify] main error:", e);
    if (titleEl) titleEl.textContent = "エラーが発生しました";
    setBadge("warn", "通信エラー");
    if (redeemBtn) redeemBtn.disabled = true;
    if (noteEl) noteEl.textContent = "ネットワーク状況をご確認ください。";
  }
}

/* ---------- Gate (password → session) ---------- */
async function unlock() {
  const pw = (pwInput?.value || "").trim();
  pwMsg && (pwMsg.textContent = "");
  try {
    await createVerifySessionWith(pw);                 // ← ここが肝：正しいパスならセッション作成成功
    // UX用のローカル旗（表示中は再入力を促さない）
    const exp = Date.now() + VERIFY_TTL_MS;
    localStorage.setItem(VERIFY_KEY, "1");
    localStorage.setItem(VERIFY_EXP, String(exp));

    if (layerEl) layerEl.hidden = true;
    else if (gateEl) gateEl.style.display = "none";
    if (mainEl) mainEl.hidden = false;
    await main();
  } catch (e) {
    console.error("[verify] session create failed:", e);
    pwMsg && (pwMsg.textContent = "パスワードが違います。");
    pwInput?.focus();
    pwInput?.select?.();
  }
}

function boot() {
  // ローカル旗が有効なら先に画面を開く（セッション切れなら書き込み時に再認証へ誘導）
  const ok = localStorage.getItem(VERIFY_KEY) === "1";
  const exp = Number(localStorage.getItem(VERIFY_EXP) || 0);
  if (ok && exp > Date.now()) {
    localStorage.setItem(VERIFY_EXP, String(Date.now() + VERIFY_TTL_MS)); // 触ったら延長（UX用）
    if (layerEl) layerEl.hidden = true;
    else if (gateEl) gateEl.style.display = "none";
    if (mainEl) mainEl.hidden = false;
    main();
  } else {
    if (layerEl) layerEl.hidden = false;
    if (mainEl) mainEl.hidden = true;
  }

  // イベント
  const tryAuth = (e) => { e?.preventDefault?.(); unlock(); };
  pwBtn?.addEventListener("click", tryAuth);
  pwInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") tryAuth(e); });
}

boot();
