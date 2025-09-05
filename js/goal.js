const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "https://fistkk71.github.io"]; if (!ALLOWED.includes(location.origin)) location.replace("https://tokosai.net");

import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const uidParam = new URLSearchParams(location.search).get("uid");
const uid = uidParam || localStorage.getItem("uid");
if (uidParam) localStorage.setItem("uid", uidParam);

const timeEl = document.getElementById("timeDisplay");
const rankBtn = document.getElementById("rankBtn");
const homeBtn = document.getElementById("homeBtn");
const teamEl = document.getElementById("resultTeam");
const memEl = document.getElementById("resultMembers");
const treEl = document.getElementById("resultTreasures");
const saveEl = document.getElementById("saveStatus");
const qrCanvas = document.getElementById("goalQr");
const verifyUrlEl = document.getElementById("verifyUrl");

const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h > 0 ? `${h}時間${m}分${r}秒` : `${m}分${r}秒`; };

function setButtonsIncomplete() {
  rankBtn && (rankBtn.textContent = "マップへ戻る", rankBtn.classList.remove("primary"), rankBtn.classList.add("secondary"), rankBtn.onclick = () => location.href = "map.html");
  homeBtn && (homeBtn.textContent = "トップへ戻る", homeBtn.onclick = () => location.href = "index.html");
}
function setButtonsComplete() {
  rankBtn && (rankBtn.textContent = "ランキングを見る", rankBtn.classList.add("primary"), rankBtn.onclick = () => { localStorage.removeItem("uid"); location.href = "index.html"; });
  homeBtn && (homeBtn.textContent = "トップへ戻る", homeBtn.onclick = () => { localStorage.removeItem("uid"); location.href = "index.html"; });
}
async function renderVerifyQR({ uid }) {
  const url = new URL(`./verify.html?uid=${encodeURIComponent(uid)}`, location.href).toString();
  const wrap = document.querySelector(".qr-wrap") || document.body;
  const canvas = document.getElementById("goalQr") || document.getElementById("couponQR");
  const link = document.getElementById("verifyUrl");

  try {
    if (window.QRCode?.toCanvas && canvas) {
      await window.QRCode.toCanvas(canvas, url, { width: 256, margin: 1 });
    } else if (typeof window.QRCode === "function") {
      if (canvas) canvas.remove();
      wrap.innerHTML = "";
      new window.QRCode(wrap, { text: url, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel?.M || 1 });
    } else {
      const img = document.createElement("img");
      img.alt = "QR"; img.width = 256; img.height = 256;
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=" + encodeURIComponent(url);
      if (canvas) canvas.replaceWith(img); else wrap.appendChild(img);
    }
    if (link) link.textContent = url;
  } catch (e) { console.error("QR render failed:", e); }
}

async function finalize() {
  if (uid) renderVerifyQR({ uid });
  await ensureAuthed();
  if (!uid) { timeEl.textContent = "参加情報（UID）が見つかりません。受付からやり直してください。"; setButtonsIncomplete(); return; }
  try {
    const teamRef = doc(db, "teams", uid);
    const teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) { timeEl.textContent = "チームデータが見つかりません。"; setButtonsIncomplete(); return; }

    const data = teamSnap.data();
    const teamName = data.teamName || "-";
    const members = data.members || 0;

    const REQUIRED = 1;
    const ps = await getDocs(collection(db, "teams", uid, "points"));
    const found = ps.size;

    teamEl.textContent = teamName;
    memEl.textContent = String(members);
    if (treEl) treEl.textContent = `${found} / ${REQUIRED}`;
    if (found < REQUIRED) {
      timeEl.textContent = "まだゴール条件を満たしていません。";
      saveEl.textContent = "City または Grand のどちらか1箇所でクリアしてください。";
      setButtonsIncomplete();
      return;
    }

    let { elapsed, startTime } = data;
    if (!elapsed && startTime) {
      const startMs = startTime.toMillis();
      elapsed = Date.now() - startMs;
      await updateDoc(teamRef, { endTime: serverTimestamp(), elapsed });
      saveEl.textContent = "記録を保存しました。";
    } else { saveEl.textContent = ""; }

    timeEl.textContent = elapsed ? fmt(elapsed) : "記録なし";
    setButtonsComplete();
    renderVerifyQR({ uid });
  } catch (e) {
    console.error(e);
    timeEl.textContent = "エラーが発生しました。通信状況をご確認ください。";
    setButtonsIncomplete();
  }
}
window.addEventListener("DOMContentLoaded", finalize);
