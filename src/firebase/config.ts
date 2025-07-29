// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCLWeKgrI_7OHGbyBFtQUVYDQWESwF2cps",
  authDomain: "bar-crawl-planner-5985f.firebaseapp.com",
  projectId: "bar-crawl-planner-5985f",
  storageBucket: "bar-crawl-planner-5985f.firebasestorage.app",
  messagingSenderId: "235279583042",
  appId: "1:235279583042:web:f740344412b3381180aadb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth and Firestore
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
export default app; 