import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAXvG30XoOxnElhMNOjVtT7_JzqOQUzcnY",
  authDomain: "pre-festival-8b772.firebaseapp.com",
  projectId: "pre-festival-8b772",
  storageBucket: "pre-festival-8b772.firebasestorage.app",
  messagingSenderId: "158050372793",
  appId: "1:158050372793:web:89233b5312777ab9271f68",
  measurementId: "G-DPE1PBS3CY",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const db   = getFirestore(app);
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});
enableIndexedDbPersistence(db).catch(() => {});

export async function ensureAuthed() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export { app, db, auth };
