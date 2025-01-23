const express = require("express");
const { db } = require('./firebase');
const { collection, getDocs } = require('firebase/firestore/lite');
const { authenticateUser, email, password,mailEmail, mailPassword,mids, mkeys, midp, mkeyp } = require('./authenticate');
const bodyParser = require("body-parser");
const https = require('https');
const PaytmChecksum = require('paytmchecksum');
const userData = require("./MOCK_DATA.json");
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 8080;
const cors = require('cors');

const isProd = true;
let mid = mids;
let mkey = mkeys;

// Middleware
app.use(bodyParser.json());

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
const allowedOrigins = ['https://khoka-dev.web.app', 'http://127.0.0.1:5002', 'http://localhost:4200','https://khoka.co'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (e.g., mobile apps or Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow credentials (cookies, authorization headers)
}));

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

// Authenticate User and Process Payment
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

        const { auth: authKey, orderId, orderAmount, userId, mobile, name } = req.body;
        console.log('serverData' + serverData)
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
                    callbackUrl: isProd ? `https://securegw.paytm.in/paytmCallback?ORDER_ID=${orderId}` : `http://localhost:4200/paytm?ORDER_ID=${orderId}`,
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
                    hostname: isProd ? 'securegw.paytm.in' : 'securegw-stage.paytm.in',
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

/**
 * Query the transaction status from Paytm.
 * @param {string} orderId - The Order ID to query.
 * @param {string} mid - Merchant ID from Paytm.
 * @param {string} mkey - Merchant Key from Paytm.
 * @param {boolean} isProd - Flag to determine production or staging environment.
 * @returns {Promise<object>} - The response from Paytm.
 */
// Transaction Status API
app.post("/api/v1/query-transaction-status", async (req, res) => {
    const { orderId, mid, mkey, isProd } = req.body;

    if (!orderId || !mid || !mkey || typeof isProd !== "boolean") {
        return res.status(400).json({
            error: "Missing required fields: orderId, mid, mkey, or isProd."
        });
    }

    try {
        // Prepare Paytm parameters
        const paytmParams = {
            body: {
                mid: mid,
                orderId: orderId,
            }
        };

        // Generate checksum
        const checksum = await PaytmChecksum.generateSignature(
            JSON.stringify(paytmParams.body),
            mkey
        );

        paytmParams.head = { signature: checksum };

        const post_data = JSON.stringify(paytmParams);

        const options = {
            hostname: isProd ? "securegw.paytm.in" : "securegw-stage.paytm.in",
            port: 443,
            path: "/v3/order/status",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": post_data.length,
            },
        };

        // Send HTTPS request
        const response = await new Promise((resolve, reject) => {
            const post_req = https.request(options, (post_res) => {
                let data = "";
                post_res.on("data", (chunk) => (data += chunk));
                post_res.on("end", () => resolve(data));
            });

            post_req.on("error", (err) => reject(err));
            post_req.write(post_data);
            post_req.end();
        });

        // Send back the parsed response
        res.status(200).json(JSON.parse(response));
    } catch (error) {
        console.error("Error querying transaction status:", error);
        res.status(500).json({
            error: "Failed to fetch transaction status. Please try again.",
        });
    }
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ error: "Page not found" });
});

// Get All Users
app.get("/rest/getAllUsers", (req, res) => {
    res.json(userData);
});

app.post('/api/v1/send-mail', async (req, res) => {
    console.log(req.body)
    const { userName, email, status, orderAmount, orderID, transcationId } = req.body;
  
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: mailEmail, // Replace with your email
        pass: mailPassword, // Replace with your app-specific password
      },
    });
  
    const subject =
      status.toUpperCase() === 'PAYMENT'
        ? `Your Order for Khoka Self Driving Order ID: ${orderID} has been successfully placed`
        : `Your Request to Cancel Khoka Self Driving Order ID: ${orderID} is being processed`;
  
    const body =
      status.toUpperCase() === 'PAYMENT'
        ? `Hi, ${userName}\nThanks for booking your Scooty at Khoka Self Driving...`
        : `Hi, ${userName}\nYour cancellation for order ID ${orderID} is being processed...`;
  
    const mailOptions = {
      from: mailEmail,
      to: email,
      subject: subject,
      text: body,
    };
  
    try {
      await transporter.sendMail(mailOptions);
      res.status(200).send('Email sent successfully');
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).send('Error sending email');
    }
  });

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
});
