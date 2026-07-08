// Inicialización de Firebase / Firestore
// SDK modular v11 cargado desde el CDN de gstatic.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

// Configuración del proyecto (braianmodulopc)
const firebaseConfig = {
  apiKey: "AIzaSyC3x_GMeG9eWphRMg16VNFp7lIEVgC5xrY",
  authDomain: "braianmodulopc.firebaseapp.com",
  projectId: "braianmodulopc",
  storageBucket: "braianmodulopc.firebasestorage.app",
  messagingSenderId: "990787462506",
  appId: "1:990787462506:web:2d50ba57e0b33ebd53b113",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Crea un usuario SIN cerrar la sesión actual (usa una app secundaria temporal).
async function crearUsuarioAislado(email, password) {
  const secApp = initializeApp(firebaseConfig, "secundaria-" + Date.now());
  const secAuth = getAuth(secApp);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await signOut(secAuth);
    return cred.user;
  } finally {
    await deleteApp(secApp);
  }
}

export {
  db,
  auth,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  crearUsuarioAislado,
};
