const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "https://fistkk71.github.io"]; if (!ALLOWED.includes(location.origin)) location.replace("https://tokosai.net");

import { db } from "./firebase-init.js";
import {
  collection, query, where, orderBy, limit, onSnapshot,
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function yyyymmddJST() {
  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  return `${p.find(x => x.type === "year").value}${p.find(x => x.type === "month").value}${p.find(x => x.type === "day").value}`;
}

/* ---------- ナビ開閉（全ページ共通パターン） ---------- */
const navToggle = document.getElementById("nav-toggle");
const mainMenu = document.getElementById("main-menu");
if (navToggle && mainMenu) {
  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    navToggle.setAttribute("aria-expanded", String(next));
    mainMenu.classList.toggle("active", next);
  });
}

/* ---------- util: 時間表示 mm分ss秒（>1h なら h時間mm分ss秒） ---------- */
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}時間${m}分${s}秒` : `${m}分${s}秒`;
}

/* ---------- ランキング（上位10） ---------- */
const leaderboardRoot = document.getElementById("leaderboard-content");
if (leaderboardRoot) {
  const q = query(
    collection(db, "teams"),
    where("elapsed", ">", 0),
    orderBy("elapsed", "asc"),
    limit(10)
  );
  onSnapshot(q, snap => {
    const ul = document.createElement("ul");
    ul.id = "rank";
    ul.className = "ranking-list";

    let i = 0;
    snap.forEach(d => {
      i += 1;
      const { teamName = "匿名チーム", elapsed = 0 } = d.data();
      const li = document.createElement("li");
      li.innerHTML = `<strong>${i}位</strong>　${teamName} — ${formatDuration(elapsed)}`;
      ul.appendChild(li);
    });

    leaderboardRoot.replaceChildren(ul);
  });
}

/* ---------- 「続きから再開」ボタン ---------- */
(async () => {
  try {
    const uid = localStorage.getItem("uid");
    if (!uid) return;

    const docSnap = await getDoc(doc(db, "teams", uid));
    if (docSnap.exists() && !docSnap.data().elapsed) {
      const btn = document.createElement("a");
      btn.href = `map.html?uid=${encodeURIComponent(uid)}`;
      btn.className = "btn-primary";
      btn.style.marginLeft = "0.6rem";
      btn.textContent = "続きから再開";
      document.querySelector(".hero-content")?.appendChild(btn);
    }
  } catch (_) {
  }
})();

(async () => {
  try {
    const uid = localStorage.getItem("uid");
    if (!uid) return;

    const team = (await getDoc(doc(db, "teams", uid))).data();
    if (!team) return;

    const today = yyyymmddJST();
    if (team.playDay === today && team.redeemedAt) {
      const a = document.querySelector('.hero-content a[href$="register.html"]'); if (a) {
        a.setAttribute("aria-disabled", "true");
        a.classList.add("btn-disabled");
        a.onclick = (e) => e.preventDefault();
        a.textContent = "本日の参加は終了しました";
      }
      const hero = document.querySelector(".hero-content p");
      if (hero) hero.textContent = "1日1回の参加となります";
    }
  } catch (_) { }
})();
