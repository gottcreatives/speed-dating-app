import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCVO_gCRj4XMrik8qxq3BPz_eGZEvUSaTY",
  authDomain: "dating-event-reg-app.firebaseapp.com",
  projectId: "dating-event-reg-app",
  storageBucket: "dating-event-reg-app.firebasestorage.app",
  messagingSenderId: "153226976259",
  appId: "1:153226976259:web:f1c32cdee8e1df640e4236",
  measurementId: "G-N79CDJZYMX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);