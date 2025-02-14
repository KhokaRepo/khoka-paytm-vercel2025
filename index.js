const express = require("express");
const { db , realtimeDb} = require('./firebase');
const { collection, getDocs } = require('firebase/firestore/lite');
const { authenticateUser, email, password, mailEmail, mailPassword, mids, mkeys, midp, mkeyp ,storeTransactionLog} = require('./authenticate');
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
const allowedOrigins = ['https://khoka-dev.web.app', 'http://127.0.0.1:5002', 'http://localhost:4200', 'https://khoka.co'];

app.use(cors({
    origin: true,
    // function (origin, callback) {
    //     // Allow requests with no origin (e.g., mobile apps or Postman)
    //     if (!origin) return callback(null, true);
    //     if (allowedOrigins.indexOf(origin) === -1) {
    //         const msg = 'The CORS policy for this site does not allow access from the specified origin.';
    //         return callback(new Error(msg), false);
    //     }
    //     return callback(null, true);
    // },
    allowedHeaders: 'Content-Type, Authorization',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow credentials (cookies, authorization headers)
}));

app.post('/app', (req, res) => {
    console.log(req.body)
    res.json(req.body);

});

app.post('/api/v1/sendmail', async (req, res) => {
    const { userName, email, status, orderAmount, orderID, transcationId, bookingDate, bookingTime } = req.body;
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: mailEmail, // Replace with your email
            pass: mailPassword, // Replace with your app-specific password
        },
    });
    // 
    const subject = getSubject(status, orderID);
    const body = getBody(userName, status, orderID, orderAmount, bookingDate, bookingTime, transcationId);

    const mailOptions = {
        from: mailEmail,
        to: email,
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
                userName,
                orderID,
                transcationId,
                bookingDate,
                bookingTime,
                orderAmount
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
        // console.log('serverData' + serverData)
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
                    callbackUrl:`https://khoka.co/paytm`, //`https://securegw.paytm.in/theia/paytmCallback?ORDER_ID=${orderId}`,
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

                // Capture Log in firebase
                storeTransactionLog({
                    details:{
                        paytmParams
                    }, 
                    Event: 'Token Generated',
                    status: "Success",
                    timestamp: new Date().toISOString()
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

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
});


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
function getBody(userName, status, orderID, amount, bookingDate, bookingTime, transactionID) {
    if (status.toUpperCase() === 'PAYMENT') {
        return `Hi, ${userName},
        
Thank you for booking your Scooty at Khoka Self Driving! Your booking has been successfully placed, and the details are as follows:

- Order ID: ${orderID}
- Booking Amount: ₹${amount}
- Booking Date: ${bookingDate}
- Booking Time: ${bookingTime}
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

    return '';
}

function getBodyWithLogo(userName, status, orderID, amount, bookingDate, bookingTime, transactionID) {
    if (status.toUpperCase() === 'PAYMENT') {
        return `
            <div style="text-align: center; font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd;">
  <!-- Logo -->
  <div style="margin-bottom: 20px;">
    <img src="https://your-logo-url.com/logo.png" alt="Khoka Logo" style="width: 200px; height: auto;" />
  </div>
  
  <!-- Greeting -->
  <p style="font-size: 16px; font-weight: bold;">Hi, John Doe,</p>
  
  <!-- Message -->
  <p style="font-size: 14px;">
    Thank you for booking your Scooty at <strong>Khoka Self Driving</strong>. Below are your booking details:
  </p>
  
  <!-- Booking Details -->
  <table style="font-size: 14px; width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">Order ID:</td>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>ZCW12345</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">Amount Paid:</td>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>$150</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">Booking Date:</td>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>2025-01-23</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">Booking Time:</td>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>10:00 AM</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">Transaction ID:</td>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>TXN56789</strong></td>
    </tr>
  </table>
  
  <!-- Follow-Up Message -->
  <p style="font-size: 14px;">
    Your ticket has been sent for assigning a vehicle. Please be patient, and we will update you soon.
  </p>
  
  <!-- Footer -->
  <p style="font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px;">
    For more info, contact:<br />
    <strong>Email:</strong> <a href="mailto:joinkhoka@gmail.com" style="color: #0066cc;">joinkhoka@gmail.com</a><br />
    <strong>Phone:</strong> <a href="tel:+917415361977" style="color: #0066cc;">+91 7415361977</a>
  </p>
</div>

        `;
    }
    // Add a similar structure for 'CANCELED' case
    return '';
}



