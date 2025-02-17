// Import the functions you need from the SDKs you need
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore/lite');
const { getDatabase, } = require("firebase/database");
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyADoXeVFy_AtPW5k8eGOv2jdgzRGF0aNjI",
  authDomain: "khoka-dev.firebaseapp.com",
  databaseURL: "https://khoka-dev-default-rtdb.firebaseio.com",
  projectId: "khoka-dev",
  storageBucket: "khoka-dev.firebasestorage.app",
  messagingSenderId: "901819154799",
  appId: "1:901819154799:web:97f1cb8c6c2b0fcf31a89a"
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