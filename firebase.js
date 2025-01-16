// Import the functions you need from the SDKs you need
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore/lite');
const { getDatabase } = require('firebase/database');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDV8mcmbnioCoS1kz9EXKT6Ep_k2frjTEo",
  authDomain: "khoka-rentals-production.firebaseapp.com",
  databaseURL: "https://khoka-rentals-production-default-rtdb.firebaseio.com",
  projectId: "khoka-rentals-production",
  storageBucket: "khoka-rentals-production.appspot.com",
  messagingSenderId: "645730438029",
  appId: "1:645730438029:web:dfb70a1c73dbf6203f0bc4",
  measurementId: "G-P9YRSYGX5N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Realtime Database
const realtimeDb = getDatabase(app);
const auth = getAuth(app);

// Export the initialized Firebase services to use in other parts of your app
module.exports = { app, db, realtimeDb, auth, signInWithEmailAndPassword };