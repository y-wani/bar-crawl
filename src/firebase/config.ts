// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
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

// App Check — attests that requests come from our real app (not a script), so
// the serverless proxy can reject scripted abuse even from valid accounts.
// Dormant until VITE_APPCHECK_SITE_KEY (a reCAPTCHA v3 site key) is configured,
// so it deploys with no behaviour change until App Check is set up in the
// Firebase Console.
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY as
  | string
  | undefined;

let appCheck: AppCheck | undefined;
if (appCheckSiteKey) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// Initialize Firebase Auth and Firestore
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db, appCheck };
export default app;