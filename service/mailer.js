const nodemailer = require('nodemailer');
const {mailEmail, mailPassword} =  require('./authenticate')

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: mailEmail, // Replace with your email
        pass: mailPassword, // Replace with your app-specific password
    },
});


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


module.exports = { sendmail, sendmailBE } 