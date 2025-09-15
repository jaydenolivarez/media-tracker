// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBA_d8vVWemyDGMeLqIG7JeTJuuWJIDO78",
  authDomain: "photo-tracker-59878.firebaseapp.com",
  projectId: "photo-tracker-59878",
  storageBucket: "photo-tracker-59878.firebasestorage.app",
  messagingSenderId: "808162922549",
  appId: "1:808162922549:web:1d1c0accc9ad51aee2217c",
  measurementId: "G-V8GWGN8JZH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth and Google provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
// Removed unused analytics variable