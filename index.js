const express = require("express");
const { db,realtimeDb } = require('./service/firebase');
const { collection, getDocs , query,  where} = require('firebase/firestore/lite');
const { authenticateUser, email, password, mids, mkeys, midp, mkeyp, storeTransactionLog ,mailEmail, mailPassword,getUserByUID} = require('./service/authenticate');
const bodyParser = require("body-parser");
const https = require('https');
const PaytmChecksum = require('paytmchecksum');
const userData = require("./MOCK_DATA.json");
const app = express();
const PORT = process.env.PORT || 8080;
const cors = require('cors');
const formidable = require('formidable')
const nodemailer = require('nodemailer');
const { ref,get, update ,child} = require("firebase/database");

const isProd = true;
let mid = mids;
let mkey = mkeys;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: mailEmail, // Replace with your email
        pass: mailPassword, // Replace with your app-specific password
    },
});

// Middleware
// app.use(cors);
app.use(bodyParser.json());
// app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Root Endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'success',
        status: 'ok',
        gateway: 'developmen app'
        // pkey: process.env
    });
});

// Define allowed origins for production
const allowedOrigins = ['http://localhost:4200', 'https://khoka.co']; // Add your frontend domains

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'), false);
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true, // Allow cookies & auth headers
}));

app.post('/app', (req, res) => {
    console.log(req.body)
    res.json(req.body);

});

app.post('/api/v1/sendmail', async (req, res) => {
    const { userName, email, status, orderAmount, orderID, transcationId, bookingDate, bookingTime } = req.body;
    const payload = {
        userName, email, status, orderAmount, orderID, transcationId, bookingDate, bookingTime
    }
     
   await sendmail(payload, res);
    
});

// Get All Users
app.get("/rest/getAllUsers", (req, res) => {
    res.json(userData);
});

// Example route
app.get('/api/v1/cors', (req, res) => {
    res.json({ message: 'CORS is configured properly!' });
});

// Generate Paytm Token
app.post('/api/v2/token', async (req, res) => {
    const { orderId, amount: orderAmount, userId } = req.query;

    if (!orderId || orderId.length <= 2) {
        return res.status(400).json({ error: "Invalid orderId" });
    }

    try {
        const paytmParams = {
            body: {
                requestType: "Payment",
                mid,
                websiteName: "Khoka Rentals",
                orderId,
                callbackUrl: `http://localhost:4200/paytm?ORDER_ID=${orderId}`,
                txnAmount: {
                    value: orderAmount,
                    currency: "INR"
                },
                userInfo: {
                    custId: userId
                }
            }
        };

        const checksum = await PaytmChecksum.generateSignature(JSON.stringify(paytmParams.body), mkey);
        paytmParams.head = { signature: checksum };

        const post_data = JSON.stringify(paytmParams);
        const options = {
            hostname: isProd ? 'securegw.paytm.in' : 'securegw-stage.paytm.in',
            port: 443,
            path: `/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${orderId}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': post_data.length
            }
        };

        const response = await new Promise((resolve, reject) => {
            const post_req = https.request(options, (post_res) => {
                let data = '';
                post_res.on('data', chunk => data += chunk);
                post_res.on('end', () => resolve(data));
            });
            post_req.on('error', reject);
            post_req.write(post_data);
            post_req.end();
        });

        res.json({ response: JSON.parse(response), merchantId: mid });
    } catch (error) {
        console.error("Error generating token:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Authenticate PROD User and Process Payment
app.post('/api/v1/token', async (req, res) => {
    try {
        const user = await authenticateUser(email, password);
        if (!user) {
            return res.status(403).json({ error: 'User authentication failed' });
        }
        const usersRef = collection(db, 'CREDENTIALS');
        const credentialsSnapshot = await getDocs(usersRef);
        const credentialDoc = credentialsSnapshot.docs.find(doc => doc.id === 'PAYTM');
        const serverData = credentialDoc ? credentialDoc.data() : null;
       

        if (!serverData || serverData.BLOCK) {
            return res.status(403).json({ error: 'Access blocked by server' });
        }

        if (serverData.TYPE === 'PRODUCTION') {
            mid = midp;
            mkey = mkeyp;
        }

        const { auth: authKey, orderId, orderAmount, userId, userLocation, mobile, name, vid, qty } = req.body;
        console.log(req.body)

        if (serverData.AUTH && serverData.AUTH === authKey) {
            if (!orderId || !orderAmount || !userId) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const paytmParams = {
                body: {
                    requestType: "Payment",
                    mid,
                    websiteName: "DEFAULT",
                    orderId,
                    callbackUrl: `https://khoka-paytm-vercel2025-khokas-projects.vercel.app/api/v1/redirect?uid=${userId}&location=${userLocation}&vid=${vid}&qty=${qty}`,
                    // callbackUrl: `http://localhost:8080/api/v1/redirect?uid=${userId}&location=${userLocation}&vid=${vid}&qty=${qty}`,
                    txnAmount: {
                        value: orderAmount,
                        currency: "INR"
                    },
                    userInfo: {
                        custId: userId,
                        mobile,
                        email,
                        firstName: name
                    },
                    enablePaymentMode: [
                        { mode: "UPI" }
                    ]
                }
            };

            const checksum = await PaytmChecksum.generateSignature(JSON.stringify(paytmParams.body), mkey);
            paytmParams.head = { signature: checksum };

            const post_data = JSON.stringify(paytmParams);
            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'securegw.paytm.in',
                    port: 443,
                    path: `/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${orderId}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': post_data.length
                    }
                };

                const post_req = https.request(options, (post_res) => {
                    let data = '';
                    post_res.on('data', chunk => data += chunk);
                    post_res.on('end', () => resolve(data));
                });

                // Capture Log in firebase
                storeTransactionLog({
                    details: {
                        paytmParams
                    },
                    Event: 'Token Generated',
                    status: "Success",
                    userLocation: userLocation,
                    timestamp: new Date().toISOString()
                });

                post_req.on('error', reject);
                post_req.write(post_data);
                post_req.end();
            });

            const responseObject = JSON.parse(response);
            responseObject.mid = mid;
            responseObject.midk = mkey;
            res.json(responseObject);
        } else {
            res.status(403).json({ error: "Invalid authentication key" });
        }
    } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/v1/redirect',  async (req, res) => {
    // try {
        const user =await authenticateUser(email, password);
        if (!user) {
            return res.status(403).json({ error: 'User authentication failed' });
        } 

        const form = new formidable.IncomingForm();

        form.parse(req, (err, fields) => {

          

            console.log('fields Redirect page invoke - 1')
            try {
                const uid = req.query.uid || "Unknown";  // Extract UID from query params
                const location = req.query.location || "Unknown";  // Extract location from query params
                const vid = req.query.vid || "Unknown";
                const userSelectedVehicleQuantity = req.query.qty || "Unknown";

                if (!fields || typeof fields !== 'object') {
                    throw new Error('Invalid form data');
                }

                const body = Object.fromEntries(
                    Object.entries(fields || {}).map(([key, value]) => [key, value ? value[0] : null])
                );

                console.log('Transaction Data:', body);

                // Checksum Verification
                const paytmChecksum = fields.CHECKSUMHASH ? fields.CHECKSUMHASH[0] : null;
                if (!paytmChecksum) throw new Error('Missing CHECKSUMHASH');

                if (fields.CHECKSUMHASH) delete fields.CHECKSUMHASH[0];
                let isVerifySignature = false;

                try {
                    isVerifySignature = PaytmChecksum.verifySignature(body, mkeyp, paytmChecksum);
                } catch (error) {
                    console.error("Signature verification failed:", error.message);
                    isVerifySignature = false;
                }

                try {
                    if (isVerifySignature) {
                        //  read vehicle from realtime db using location/vid
                        fetchVehicleById(location, vid)
                            .then(vehicleDetails => {
                                if (vehicleDetails) {
                                    // update the bookings  
                                    createBookingDetailsAfterSuccessful(body, vehicleDetails, uid, location, userSelectedVehicleQuantity);
                                } else {
                                    console.log('Vehicle not found');
                                }
                            })
                            .catch(err => console.error('Unhandled error:', err));
                    } 
                    
                    else {
                        console.log("Signature verification failed", location, vid);
                        fetchVehicleById(location, vid)
                            .then(vehicleDetails => {
                                if (vehicleDetails) {
                                    // update the bookings  
                                    createBookingDetailsAfterSuccessful(body, vehicleDetails, uid, location, userSelectedVehicleQuantity);
                                } else {
                                    console.log('Vehicle not found');
                                }
                            })
                    } 
                } catch (error) {
                 console.log('error', error)
                }

                // Status Handling
                const status = body.STATUS || "UNKNOWN";
                const statusMessages = {
                    "TXN_SUCCESS": { message: "Payment Successful!", color: "var(--green)", redirect: "http://localhost:4200/account" },
                    "TXN_FAILURE": { message: "Payment Failed. Try Again.", color: "var(--waiting-background)", redirect: "http://localhost:4200/splash" },
                    "PENDING": { message: "Transaction Pending. Please Wait.", color: "var(--yellow)", redirect: "http://localhost:4200/account" },
                    "TXN_CANCELLED": { message: "Transaction Cancelled.", color: "var(--peach)", redirect: "http://localhost:4200/splash" },
                    "TXN_REFUNDED": { message: "Transaction Refunded.", color: "var(--purple)", redirect: "http://localhost:4200/splash" },
                    "UNKNOWN": { message: "Unexpected Response from Payment Gateway.", color: "var(--grey-title)", redirect: "http://localhost:4200/splash" }
                };

                const { message, color, redirect } = statusMessages[status];

                // Send HTML Response with Auto-Redirect
                const htmlResponse = `
   
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${status}</title>
                    <style>
                        :root {
                            --black: #000000;
                            --white: #ffffff;
                            --primary-color: #122a44;
                            --secondary-color: #00adef;
                            --yellow: #ffd32d;
                            --yellow-light: #fbf9e4;
                            --grey-title: #56677a;
                            --grey-text: #b5b5b5;
                            --peach: #ff7d7d;
                            --light-green: #e4fbea;
                            --green: #8adb89;
                            --transparent-green: rgba(138, 219, 137, 0.5);
                            --menu-color: #56677a;
                            --light-blue: #f9fdfe;
                            --purple: #6055d5;
                            --waiting-background: #ff4141;
                            --icon-background: #fbf4b7;
                        }

                        body {
                            font-family: 'Arial', sans-serif;
                            background-color: var(--light-blue);
                            color: var(--primary-color);
                            margin: 0;
                            padding: 20px;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                        }

                        h1 {
                            color: var(--primary-color);
                            margin-bottom: 20px;
                            font-size: 1.2rem;
                            text-align: center;
                        }

                        .status {
                                            font-size: 2rem;
                                            font-weight: bold;
                                            color: ${color};
                                        }

                        .container {
                            /* background: var(--white); */ 
                            padding: 30px;
                            border-radius: 15px;
                            /* box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); */
                            max-width: 500px;
                            width: 100%;
                            display: flex;
                            flex-direction: column;
                            gap: 29px;
                            justify-content: center;
                            align-items: center;
                        }

                        .progress-bar {
                            width: 100%;
                            background: var(--yellow-light);
                            border-radius: 20px;
                            overflow: hidden;
                            margin: 20px 0;
                            position: relative;
                        }

                        .progress {
                            height: 10px;
                            width: 0%;
                            background: var(--primary-color);
                            border-radius: 1px;
                            transition: width 1s ease-in-out;
                            text-align: center;
                            color: var(--white);
                            font-weight: bold;
                            line-height: 10px;
                            font-size: 0.5rem;
                        }

                        .instructions {
                            text-align: left;
                            margin-top: 20px;
                            margin-bottom: 20px;
                        }

                        .instructions p {
                            margin: 0px 0;
                            color: var(--menu-color);
                            display: flex;
                            align-items: center;
                            font-size: 0.8rem;
                        }

                        .note-box {
                            border: 1px solid var(--grey-text);
                            border-radius: 10px;
                            padding: 0px 10px;
                            margin-top: 20px;
                            background-color: var(--light-green);
                        }

                        .note-box h3 {
                            color: var(--grey-title);
                            margin-bottom: 5px;
                            display: flex;
                            align-items: center;
                            font-size: 10px;
                        }

                        .note-box h3 .icon {
                            font-size: 12px;
                            margin-right: 10px;
                            color: var(--secondary-color);
                        }

                        .note-box p {
                            color: var(--menu-color);
                            font-size: 0.6rem;
                        
                            margin-bottom: 5px;
                        }

                        .icon {
                            font-size: 24px;
                            margin-right: 10px;
                            color: var(--secondary-color);
                        }

                        .countdown {
                            color: var(--grey-title);
                            font-size: 0.9rem;
                            margin-top: 10px;
                            text-align: center;
                        }

                        .button {
                            background: var(--secondary-color);
                            color: var(--white);
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                            margin-top: 20px;
                            font-size: 1rem;
                            transition: background 0.3s ease;
                            width: 100%;
                        }

                        .button:hover {
                            background: var(--purple);
                        }

                        .rupee-arrow {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            margin: 20px 0;
                        }

                        .rupee-arrow span {
                            font-size: 32px;
                            color: var(--green);
                            margin: 0 10px;
                        }

                        .rupee-arrow .arrow {
                            font-size: 24px;
                            color: var(--secondary-color);
                        }

                        .mobile-icon {
                            font-size: 32px;
                            color: var(--primary-color);
                        }
                    </style>
                    <script>
                        let progress = 0;
                        const intervalTime = 100;  // Set interval to 100ms for smoother progress
                        const duration = 10000;  // 10 seconds
                        const increment = 100 / (duration / intervalTime);  // Calculate progress increment for 10 seconds

                        const interval = setInterval(() => {
                            progress += increment;
                            const progressInt = Math.floor(progress); // Round down to the nearest integer
                            document.querySelector('.progress').style.width = progressInt + '%';
                            document.querySelector('.progress').textContent = Math.min(progressInt, 100) + '%';
                            if (progressInt >= 100) clearInterval(interval);
                        }, intervalTime);
                        setTimeout(() => {
                            window.location.href = "${redirect}";
                        }, 10000);
                    </script>
                </head>
                <body>
                    <div class="container">
                        <h1>Complete Your Payment</h1>
                        <div class="rupee-arrow">
                            <span>₹</span>
                            <span class="arrow">➡️</span>
                            <span class="mobile-icon">📱</span>
                        </div>

                        <h1 class="status">${message}</h1>
                        
                        <div class="instructions">
                            <p><span class="icon">➡️</span> Go to your UPI-linked mobile app or click on the notification.</p>
                            <p><span class="icon">💰</span> Check pending transactions.</p>
                            <p><span class="icon">✅</span> Complete the payment by selecting the bank and entering UPI PIN.</p>
                        </div>
                        
                        <div class="instructions">
                            <div class="note-box">
                                <h3><span class="icon">ℹ️</span> NOTE: Please do not press the back button or close the screen until the payment is complete.</h3>
                                
                            </div>
                        </div>

                        <div class="progress-bar">
                            <div class="progress">0%</div>
                            <p class="countdown">The page will automatically expire in 10 seconds.</p>
                        </div>
                        
                    </div>
                </body>
            </html>
            `;
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(htmlResponse);

            } catch (error) {
                console.error("Error processing request:", error.message);
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h1 style="color: var(--waiting-background);">Error</h1><p>${error.message}</p>`);
            }
        });
     
});

// Authenticate Stage User and Process Payment
app.post('/api/v1/stage_token', async (req, res) => {
    try {
        const user = await authenticateUser(email, password);
        if (!user) {
            return res.status(403).json({ error: 'User authentication failed' });
        }
        const usersRef = collection(db, 'CREDENTIALS');
        const credentialsSnapshot = await getDocs(usersRef);
        const credentialDoc = credentialsSnapshot.docs.find(doc => doc.id === 'PAYTMS');
        const serverData = credentialDoc ? credentialDoc.data() : null;

        if (!serverData || serverData.BLOCK) {
            return res.status(403).json({ error: 'Access blocked by server' });
        }

        const { auth: authKey, orderId, orderAmount, userId, mobile, name } = req.body;
        // console.log('serverData' + serverData)
        if (serverData.AUTH && serverData.AUTH === authKey) {
            if (!orderId || !orderAmount || !userId) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const paytmParams = {
                body: {
                    requestType: "Payment",
                    mid,
                    websiteName: "WEBSTAGING",
                    orderId,
                    callbackUrl: `https://localhost:4200/api/v1/redirect-payment-khoka?ORDER_ID=${orderId}`, //`https://securegw.paytm.in/theia/paytmCallback?ORDER_ID=${orderId}`,
                    txnAmount: {
                        value: orderAmount,
                        currency: "INR"
                    },
                    userInfo: {
                        custId: userId,
                        mobile,
                        email,
                        firstName: name
                    },
                    enablePaymentMode: [
                        { mode: "UPI" }
                    ]
                }
            };

            const paytmchecksumStage = await PaytmChecksum.generateSignature(JSON.stringify(paytmParams.body), mkey);

            paytmParams.head = { signature: paytmchecksumStage };

            const post_data = JSON.stringify(paytmParams);
            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'securegw-stage.paytm.in',
                    port: 443,
                    path: `/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${orderId}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': post_data.length
                    }
                };

                const post_req = https.request(options, (post_res) => {
                    let data = '';
                    post_res.on('data', chunk => data += chunk);
                    post_res.on('end', () => resolve(data));
                });

                // Capture Log in firebase
                post_req.on('error', reject);
                post_req.write(post_data);
                post_req.end();
            });

            const responseObject = JSON.parse(response);
            responseObject.mid = mid;
            res.json(responseObject);
        } else {
            res.status(403).json({ error: "Invalid authentication key" });
        }
    } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const DB_PATHS = {
    LOCATIONS: "LOCATIONS",
    VEHICLE_TYPES: "VEHICLETYPES",
    PLANS: "PLANS",
    VEHICLES: "VEHICLES",
    SERVICES: "SERVICES",
    BANNER_PHOTO: "BANNERPHOTO",
    BOOKINGS: "BOOKINGS",
    CANCELLATION: "CANCELLATION",
    TRANSACTIONS: "TRANSACTIONS",
    SERVER_STATUS: "SERVER_STATUS",
    NOTIFICATIONS: "NOTIFICATIONS"
};



const  createOrUpdateBookingAttributes = async (bookingId, userId, updateObject, userLocation) => {
// async function createOrUpdateBookingAttributes(bookingId, userId, updateObject, userLocation) {
    try {
        if (!bookingId || !userId || !updateObject || !userLocation) {
            throw new Error("Missing required parameters.");
        }
        const userlocation = userLocation.replace(/\s+/g, '').toLowerCase();
        const locationPath = `${DB_PATHS.BOOKINGS}/${userlocation}/${userId}/${bookingId}`;
        const dbRef = ref(realtimeDb, locationPath);
        await update(dbRef, updateObject);
        console.log("Ticket updated successfully.");
        return { success: true, message: "Ticket updated successfully." };
    } catch (error) {
        console.error("Error updating Ticket:", error.message);
        return { success: false, message: "Error updating Ticket.", error };
    }
}

const  updateTransactions = async (uid, orderId, transactionUpdateObject, userLocation) => {
// async function updateTransactions(uid, orderId, transactionUpdateObject, userLocation) {
    try {
        if (!uid || !orderId || !transactionUpdateObject || !userLocation) {
            throw new Error("Missing required parameters.");
        }
        const userlocation = userLocation.replace(/\s+/g, "").toLowerCase();
        const locationPath = `${DB_PATHS.TRANSACTIONS}/${userlocation}/${uid}/${orderId}`;
        const dbRef = ref(realtimeDb, locationPath);

        await update(dbRef, transactionUpdateObject);
        console.log("Transaction Status updated successfully.");

        return { success: true, message: "Transaction Status updated successfully." };
    } catch (error) {
        console.error("Transaction Error updating status:", error.message);
        return { success: false, message: "Transaction Error updating status.", error };
    }
}


const  updateAvailableVehiclesAttributes = async (updates, userId, userLocation, vid) => {
// async function updateAvailableVehiclesAttributes(updates, userId, userLocation, vid) {
    try {
        if (!updates || !userId || !userLocation || !vid) {
            throw new Error("Missing required parameters.");
        }
        const userlocation = userLocation.replace(/\s+/g, "").toLowerCase();
        const locationPath = `${DB_PATHS.VEHICLES}/${userlocation}/${vid}`;
        const dbRef = ref(realtimeDb, locationPath);

        await update(dbRef, updates);
        console.log("Vehicle Update successful.");

        return { success: true, message: "Vehicle Update successful." };
    } catch (error) {
        console.error("Error updating Vehicle attributes:", error.message);
        return { success: false, message: "Error updating Vehicle attributes.", error };
    }
}

const  fetchVehicleById = async (userLocation, vehicleId) => {
// async function fetchVehicleById(userLocation, vehicleId) {
    try {

        if (!userLocation || !vehicleId) {
            throw new Error("User location and vehicle ID are required.");
        }

        const userlocation = userLocation.replace(/\s+/g, '').toLowerCase();
        const vehiclePath = `${DB_PATHS.VEHICLES}/${userlocation}/${vehicleId}`; // Path to specific vehicle
        const dbRef = ref(realtimeDb);

        let snapshot;
        try {
            snapshot = await get(child(dbRef, vehiclePath));
        } catch (firebaseError) {
            throw new Error(`Firebase read error: ${firebaseError.message}`);
        }

        if (snapshot.exists()) {
            const data = snapshot.val();
            return {
                id: vehicleId,
                booked: data.booked || 0,
                date: data.date || "",
                location: data.location || "",
                remaining: data.remaining || 0,
                title: data.title || "",
                total: data.total || 0,
                waiting: data.waiting || 0
            };
        } else {
            console.warn(`Vehicle with ID ${vehicleId} not found.`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching vehicle:", error.message);
        return null;
    }
}

const  createBookingDetailsAfterSuccessful = async (data, vehicleDetails, uid, location, userSelectedVehicleQuantity) => {
// async function createBookingDetailsAfterSuccessful(data, vehicleDetails, uid, location, userSelectedVehicleQuantity) {
    try {
       
        await createTransactionDetailsAfterSuccessful(data, uid, location);
        console.log("Transaction details created 5");


        await removeVehicleAndUpdateBooking(vehicleDetails, data.ORDERID, uid, location, userSelectedVehicleQuantity, data);
        console.log("Vehicle updated and booking modified 6");


         //get user buy user id
         getUserByUID(uid).then((userData) => {
            if (userData) {
                var status  ='PAYMENT';
                if(data.STATUS !== 'TXN_SUCCESS'){
                    if(data.STATUS === 'TXN_FAILURE'){
                            status = 'FAILURE';
                    } else if(data.STATUS === 'PENDING'){
                        status = 'PENDING';
                    }
                    
                }
                 
                const payload = {
                    userName: userData.username, 
                    email: userData.email, 
                    status: status,
                    orderAmount: data.TXNAMOUNT,
                    orderID: data.ORDERID,
                    transcationId: data.BANKTXNID, 
                    bookingDate: data.TXNDATE
                }
                 
                sendmailBE(payload)
                console.log("Booking email sent 4");
            }
        });




    } catch (error) {
        console.error("Error in booking process:", error.message);
    }
}

const  createTransactionDetailsAfterSuccessful = async (data, uid, location) => {
// async function createTransactionDetailsAfterSuccessful(data, uid, location) {
    try {
        const updateTransactionObject = {
            status: data.STATUS,    
            transactiondate: getTransactionTime(),
            transactiontime: data.TXNDATE,
            transactionid: data.BANKTXNID,
        };

        await updateTransactions(
            uid, data.ORDERID, updateTransactionObject, location
        );


    } catch (error) {
        console.error("Error updating transaction:", error.message);
    }
}

const  removeVehicleAndUpdateBooking = async (vehicleDetails_, orderId, uid, location, userSelectedVehicleQuantity, data) => {

// async function removeVehicleAndUpdateBooking(vehicleDetails_, orderId, uid, location, userSelectedVehicleQuantity, data) {
    try {
        const { remaining, booked, waiting } = vehicleDetails_;
        if (remaining > 0) {
            if(data.STATUS === 'TXN_SUCCESS'){
                await UpdateVehicle(remaining, booked, waiting, true, vehicleDetails_.id, uid, location, userSelectedVehicleQuantity);
            }   
          
            await updateBookingStatus(true, orderId, uid, location, data);
        } else {
            if(data.STATUS === 'TXN_SUCCESS'){
                await UpdateVehicle(remaining, booked, waiting, false, vehicleDetails_.id, uid, location, userSelectedVehicleQuantity);
            } 
       
            await updateBookingStatus(false, orderId, uid, location, data);
        }
    } catch (error) {
        console.error("Error updating vehicle/booking:", error.message);
    }
}

const  updateBookingStatus = async (isRemaining, orderId, uid, location, data) => {
// async function updateBookingStatus(isRemaining, orderId, uid, location, data) {
    try {
        var status = isRemaining ? "CONFIRMED" : "WAITING";
        if(data.STATUS !== 'TXN_SUCCESS'){
            if(data.STATUS === 'TXN_FAILURE'){
                    status = 'FAILURE';
            } else if(data.STATUS === 'PENDING'){
                status = 'PENDING';
            }
            
        }
        const updateTicketData = {
            status: status, // Status of the transaction
            referenceid: data.BANKTXNID, // Bank transaction ID
            ordercreatedate: new Date(data.TXNDATE).toISOString(), // Order timestamp
        };
        await createOrUpdateBookingAttributes(
            orderId, uid, updateTicketData, location
        );
        console.log("updateBookingStatus 7");

    } catch (error) {
        console.error("Error updating booking status:", error.message);
    }
}

const  UpdateVehicle = async (remaining, booked, waiting, isFromRemaining, vid, uid, location, userSelectedVehicleQuantity) => {
// async function UpdateVehicle(remaining, booked, waiting, isFromRemaining, vid, uid, location, userSelectedVehicleQuantity) {
    try {
        let remain = remaining;
        let wait = waiting;
        const vehicles = parseInt(userSelectedVehicleQuantity);

        if (isFromRemaining) {
            if (vehicles > 1) {
                remain -= vehicles;
                booked += vehicles;
            } else {
                remain -= 1;
                booked += 1;
            }
        } else {
            if (vehicles > 1) {
                wait -= vehicles;
                booked += vehicles;
            } else {
                wait -= 1;
                booked += 1;
            }
        }

        const payload = {
            booked: booked,
            remaining: remain,
            waiting: wait,
        };

        await updateAvailableVehiclesAttributes(
            payload, uid, location, vid
        );
        console.log("updateAvailableVehiclesAttributes 8 Done completed");

        // Close checkout after delay
        setTimeout(() => {
            // closeCheckoutForAccount();
        }, 1000);

    } catch (error) {
        console.error("Error updating vehicle:", error.message);
    }
}

function getCurrentDate() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0'); // Get day
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Get month (0-based, so add 1)
    const year = date.getFullYear(); // Get year
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // Get time in 12-hour format

    return `${day} ${month} ${year}, ${time}`;
}

function getTransactionTime() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0'); // Get day and pad with leading zero
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Get month in short format (e.g., Jan)
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // Get time in 12-hour format
    const year = date.getFullYear(); // Get year
    return `${time}, ${day} ${month} ${year}`;
}

async function sendmail(payload, res) {

    const subject = getSubject(payload.status, payload.orderID);
    const body = getBody(payload.userName, payload.status, payload.orderID, payload.orderAmount,
        payload.bookingDate, payload.bookingTime, payload.transcationId);

    const mailOptions = {
        from: mailEmail,
        to: payload.emailemail,
        subject: subject,
        text: body,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({
            status: "success",
            code: 200,
            message: "Email sent successfully",
            data: {
                payload
            }
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({
            status: "error",
            code: 500,
            message: "An unexpected error occurred",
            error: error.message
        });
    }
}

async function sendmailBE(payload) {

    const subject = getSubject(payload.status, payload.orderID);
    const body = getBody(payload.userName, payload.status, payload.orderID, payload.orderAmount,
        payload.bookingDate, payload.transcationId);

    const mailOptions = {
        from: mailEmail,
        to: payload.email,
        subject: subject,
        text: body,
    };

    try {
        await transporter.sendMail(mailOptions);
        // res.status(200).json({
        //     status: "success",
        //     code: 200,
        //     message: "Email sent successfully",
        //     data: {
        //         userName,
        //         orderID,
        //         transcationId,
        //         bookingDate,
        //         bookingTime,
        //         orderAmount
        //     }
        // });
        console.error('Email sent successfully:', 200);
    } catch (error) {
        console.error('Error sending email:', error);
        // res.status(500).json({
        //     status: "error",
        //     code: 500,
        //     message: "An unexpected error occurred",
        //     error: error.message
        // });
    }
}


/**
 * Get the email subject based on the status and order ID.
 * 
 * @param {string} status - The status of the order (e.g., PAYMENT or CANCELED).
 * @param {string} orderID - The order ID.
 * @returns {string} - The subject of the email.
 */
function getSubject(status, orderID) {
    if (status.toUpperCase() === 'PAYMENT') {
        return `Your Order for Khoka Self Driving Order ID: ${orderID} has been successfully placed`;
    }
    if (status.toUpperCase() === 'CANCELED') {
        return `Your Request to Cancel Khoka Self Driving Order ID: ${orderID} is being processed`;
    }
    if (status.toUpperCase() === 'FAILURE') {
        return `Transaction Failed for Khoka Self Driving Order ID: ${orderID}`;
    }
    
    if (status.toUpperCase() === 'PENDING') {
        return `Your Payment for Khoka Self Driving Order ID: ${orderID} is in Progress`;
    }
    
    return '';
}

/**
 * Get the email body based on the user's name, status, and order ID.
 * 
 * @param {string} userName - The name of the user.
 * @param {string} status - The status of the order (e.g., PAYMENT or CANCELED).
 * @param {string} orderID - The order ID.
 * @returns {string} - The body of the email.
 */
function getBody(userName, status, orderID, amount, bookingDate, transactionID) {
    if (status.toUpperCase() === 'PAYMENT') {
        return `Hi, ${userName},
        
Thank you for booking your Scooty at Khoka Self Driving! Your booking has been successfully placed, and the details are as follows:

- Order ID: ${orderID}
- Booking Amount: ₹${amount}
- Booking Date: ${bookingDate}
- Transaction ID: ${transactionID}

Your ticket is currently being processed to assign a vehicle. We appreciate your patience during this time.

Thank you for choosing Khoka Self Driving!

For more information or assistance, feel free to contact us:
- Mail ID: joinkhoka@gmail.com
- Phone: +917415361977`;
    }

    if (status.toUpperCase() === 'CANCELED') {
        return `Hi, ${userName},
        
We have received your request to cancel your booking, and the cancellation for the following order is being processed:

- Order ID: ${orderID}
- Booking Amount: ₹${amount}
- Transaction ID: ${transactionID}

As per our cancellation and refund policy, the refund process has been initiated. You will be notified via email or SMS once the refund is successfully processed. 

Thank you for your understanding and for connecting with Khoka Self Driving!

For more information or assistance, feel free to contact us:
- Mail ID: joinkhoka@gmail.com
- Phone: +917415361977`;
    }
    if (status.toUpperCase() === 'FAILURE') {
        return `Hi, ${userName},
    
    We regret to inform you that your transaction has failed. Please find the details below:
    
    - Order ID: ${orderID}
    - Booking Amount: ₹${amount}
    - Transaction ID: ${transactionID}
    
    Possible reasons for failure:
    - Insufficient balance
    - Bank server issues
    - Incorrect payment details
    
    You may retry the payment or use an alternative payment method. If the amount was deducted from your account, it will be refunded as per our standard refund policy.
    
    For any assistance, feel free to contact us:
    - Mail ID: joinkhoka@gmail.com
    - Phone: +917415361977
    
    Thank you for choosing Khoka Self Driving!`;
    }
    if (status.toUpperCase() === 'PENDING') {
        return `Hi, ${userName},
    
    Your payment for the following order is currently in progress:
    
    - Order ID: ${orderID}
    - Booking Amount: ₹${amount}
    - Transaction ID: ${transactionID}
    
    Sometimes, payments take a little longer to process due to banking network delays. Please allow some time for the transaction to be completed. You will receive a confirmation once the payment status is updated.
    
    If the payment remains pending for an extended period, please check with your bank or reach out to our support team.
    
    For assistance, contact us:
    - Mail ID: joinkhoka@gmail.com
    - Phone: +917415361977
    
    Thank you for choosing Khoka Self Driving!`;
    }
    
    
    return '';
}


// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ error: "Page not found" });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
});