import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBLrVoofs1K9npmYGoGi1aJuoE4L_BD3M8",
  authDomain: "react-chat-faizan.firebaseapp.com",
  projectId: "react-chat-faizan",
  storageBucket: "react-chat-faizan.firebasestorage.app",
  messagingSenderId: "52031052240",
  appId: "1:52031052240:web:186de31f937a9d775f01d5",
  measurementId: "G-2LWZKX022Q",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth();
export const db = getFirestore();
export const storage = getStorage();
