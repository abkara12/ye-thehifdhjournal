// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCUnzNMF-Fi8YiyJOBVVHBfSNu-hrbDO7U",
  authDomain: "ye-thehifdhjournal.firebaseapp.com",
  projectId: "ye-thehifdhjournal",
  storageBucket: "ye-thehifdhjournal.firebasestorage.app",
  messagingSenderId: "430287991973",
  appId: "1:430287991973:web:60c2b740f0d297cc2d094c"
};


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
