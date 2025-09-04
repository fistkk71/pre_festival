const GOAL_IDS = new Set(["qr1","qr2"]);
import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const PASS = "tokorozawa";
const gateEl = document.getElementById("pwGate");
const mainEl = document.getElementById("main");
const pwInput = document.getElementById("pwInput");
const pwBtn = document.getElementById("pwBtn");
const pwMsg = document.getElementById("pwMsg");
const VERIFY_KEY = "verify_ok";
const VERIFY_EXP = "verify_exp";
const VERIFY_TTL_MS = 12 * 60 * 60 * 1000;

const setBadge = (t, s) => { badgeEl.className = `verify-badge ${t}`; badgeEl.textContent = s; };
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h > 0 ? `${h}時間${m}分${r}秒` : `${m}分${r}秒`; };

async function main() {
  await ensureAuthed();

  const p = new URLSearchParams(location.search);
  const uid = p.get("uid") || "";
  uidEl.textContent = uid || "-";
  if (!uid) { titleEl.textContent = "無効なQRです"; setBadge("ng", "UIDがありません"); redeemBtn.disabled = true; noteEl.textContent = "ゴール画面のQRを再読み取りしてください。"; return; }

  try {
    const teamRef = doc(db, "teams", uid);
    const teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) { titleEl.textContent = "無効なUIDです"; setBadge("ng", "チームが見つかりません"); redeemBtn.disabled = true; return; }

    const data = teamSnap.data();
    const teamName = data.teamName || "-";
    const members = data.members || 0;

    const REQUIRED = 1;
    const ps = await getDocs(collection(db, "teams", uid, "points"));
    const found = ps.size;

    teamEl.textContent = teamName;
    memEl.textContent = String(members);
    foundEl.textContent = `${found} / ${REQUIRED}`;

    let elapsed = data.elapsed;
    if (!elapsed && data.startTime) {
      const end = data.endTime?.toMillis?.() ?? Date.now();
      elapsed = end - data.startTime.toMillis();
    }
    elapsedEl.textContent = elapsed ? fmt(elapsed) : "計測なし";

    const redeemedAt = data.redeemedAt?.toDate?.();
    redEl.textContent = redeemedAt ? `済（${redeemedAt.toLocaleString()}）` : "未";

    if (found < REQUIRED) {
      titleEl.textContent = "未達です";
      setBadge("ng", "宝が規定数に達していません");
      redeemBtn.disabled = true;
      noteEl.textContent = "参加者をマップへご案内ください。";
      return;
    }

    titleEl.textContent = "引き換えできます";
    setBadge("ok", "OK");

    if (redeemedAt) {
      redeemBtn.textContent = "すでに引き換え済み";
      redeemBtn.disabled = true;
      return;
    }

    redeemBtn.disabled = false;
    redeemBtn.onclick = async () => {
      redeemBtn.disabled = true; redeemBtn.textContent = "登録中…";
      try {
        await updateDoc(teamRef, { redeemedAt: serverTimestamp() });
        titleEl.textContent = "引き換え完了しました";
        setBadge("ok", "完了");
        redEl.textContent = `済（${new Date().toLocaleString()}）`;
        redeemBtn.textContent = "完了しました";
      } catch (e) {
        console.error(e);
        redeemBtn.textContent = "もう一度試す"; redeemBtn.disabled = false;
        setBadge("warn", "通信エラー"); noteEl.textContent = "ネットワーク状況をご確認ください。";
      }
    };
  } catch (e) {
    console.error(e);
    titleEl.textContent = "エラーが発生しました"; setBadge("warn", "通信エラー"); redeemBtn.disabled = true; noteEl.textContent = "ネットワーク状況をご確認ください。";
  }
}

function unlock() {
  const exp = Date.now() + VERIFY_TTL_MS;
  localStorage.setItem(VERIFY_KEY, "1");
  localStorage.setItem(VERIFY_EXP, String(exp));
  if (gateEl) gateEl.style.display = "none";
  if (mainEl) mainEl.hidden = false;
  main();
}

function boot() {
  const ok = localStorage.getItem(VERIFY_KEY) === "1";
  const exp = Number(localStorage.getItem(VERIFY_EXP) || 0);
  if (ok && exp > Date.now()) {
    localStorage.setItem(VERIFY_EXP, String(Date.now() + VERIFY_TTL_MS));
    if (gateEl) gateEl.style.display = "none";
    if (mainEl) mainEl.hidden = false;
    main();
    return;
  }
  if (gateEl) gateEl.style.display = "";
  if (mainEl) mainEl.hidden = true;
  const tryAuth = () => {
    const ok = (pwInput?.value || "").trim() === PASS;
    if (ok) {
      pwMsg.textContent = "";
      unlock();
    } else {
      pwMsg.textContent = "パスワードが違います。";
      pwInput?.focus();
      pwInput?.select?.();
    }
  };
  pwBtn?.addEventListener("click", tryAuth);
  pwInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryAuth();
  });
}

boot();
