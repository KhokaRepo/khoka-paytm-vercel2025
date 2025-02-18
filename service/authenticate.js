const { auth, realtimeDb ,signInWithEmailAndPassword } = require('./firebase'); // Adjust the path as needed
const { ref, push } = require("firebase/database");
const { getFirestore, doc, getDoc } = require("firebase/firestore"); 

require('dotenv').config();

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const mids = process.env.MIDS;
const mkeys = process.env.MKEYS;
const midp = process.env.MIDP;
const mkeyp = process.env.MKEYP;
const mailEmail = process.env.MAILEMAIL;
const mailPassword = process.env.MAILPASSWORD;

const db = getFirestore(); // Initialize Firestore

const authenticateUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Authenticated as:', userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
};

// Initialize Realtime Database
const storeTransactionLog = async (data) => {
  try {
    const user = await authenticateUser(email, password);
    if (user) {
      const transactionRef = ref(realtimeDb, 'TRANSACTIONLOG/iitguwahati');
      await push(transactionRef, data);
      console.log('Transaction log stored successfully');
    }
  } catch (error) {
    console.error('Error storing transaction log:', error);
  }
};



const getUserByUID = async (uid) => {
  try {
    const userRef = doc(db, "USERS", uid); // Reference to the user's document
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data(); // Store data in a variable
      // console.log("User Data:", userData);
      return userData; // Return user data
    } else {
      console.log("No such user found!");
      return null;
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}


module.exports = { authenticateUser, email, password, mids, mkeys, midp, mkeyp, mailEmail, mailPassword , storeTransactionLog, getUserByUID};
