const { auth, signInWithEmailAndPassword } = require('./firebase'); // Adjust the path as needed
require('dotenv').config();
const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const mids = process.env.MIDS;
const mkeys = process.env.MKEYS;
const midp = process.env.MIDP;
const mkeyp = process.env.MKEYP;
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

module.exports = { authenticateUser, email, password, mids, mkeys, midp, mkeyp };
