const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const paymentController = require(`${__dirname}/../../controllers/dashboard/paymentDashboardController`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================


// create Invoice
router.get("/", paymentController.getPaymentsDashboard);





module.exports = router;