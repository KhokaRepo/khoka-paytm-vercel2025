const { ref,get, update ,child} = require("firebase/database");
const {realtimeDb} = require('./firebase');
const {getUserByUID} = require('./authenticate');
const {sendmailBE} =  require('./mailer')

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

async function createOrUpdateBookingAttributes(bookingId, userId, updateObject, userLocation) {
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

async function updateTransactions(uid, orderId, transactionUpdateObject, userLocation) {
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

async function updateAvailableVehiclesAttributes(updates, userId, userLocation, vid) {
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


const fetchVehicleById = async (userLocation, vehicleId) => {
    if (!userLocation || !vehicleId) throw new Error("User location and vehicle ID are required.");

    const sanitizedLocation = userLocation.replace(/\s+/g, '').toLowerCase();
    const vehiclePath = `${DB_PATHS.VEHICLES}/${sanitizedLocation}/${vehicleId}`;
    
    try {
        const snapshot = await get(child(ref(realtimeDb), vehiclePath));
        if (!snapshot.exists()) {
            console.warn(`Vehicle with ID ${vehicleId} not found.`);
            return null;
        }

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
    } catch (error) {
        console.error("Error fetching vehicle:", error);
        throw error;
    }
};

const createBookingDetailsAfterSuccessful = async (
    data,
    vehicleDetails,
    uid,
    location,
    userSelectedVehicleQuantity
) => {
    try {
        await createTransactionDetailsAfterSuccessful(data, uid, location);
        console.log("Transaction details created 5");

        await removeVehicleAndUpdateBooking(vehicleDetails, data.ORDERID, uid, location, userSelectedVehicleQuantity, data);
        console.log("Vehicle updated and booking modified 6");

        const userData = await getUserByUID(uid);
        if (userData) {
            const status = data.STATUS === "TXN_SUCCESS" ? "PAYMENT" : 
                           data.STATUS === "TXN_FAILURE" ? "FAILURE" : 
                           data.STATUS === "PENDING" ? "PENDING" : "UNKNOWN";

            await sendmailBE({
                userName: userData.username,
                email: userData.email,
                status,
                orderAmount: data.TXNAMOUNT,
                orderID: data.ORDERID,
                transcationId: data.BANKTXNID,
                bookingDate: data.TXNDATE
            });

            console.log("Booking email sent 4");
        }
    } catch (error) {
        console.error("Error in booking process:", error);
        throw error;
    }
};


async function createTransactionDetailsAfterSuccessful(data, uid, location) {
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

async function removeVehicleAndUpdateBooking(vehicleDetails_, orderId, uid, location, userSelectedVehicleQuantity, data) {
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

async function updateBookingStatus(isRemaining, orderId, uid, location, data) {
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

async function UpdateVehicle(remaining, booked, waiting, isFromRemaining, vid, uid, location, userSelectedVehicleQuantity) {
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

module.exports = { fetchVehicleById, createBookingDetailsAfterSuccessful};
