const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const  productReportController = require(`${__dirname}/../../controllers/report/productReportController`);
const  invoiceReportController = require(`${__dirname}/../../controllers/report/invoicesReport`);
const  purchaseReportController = require(`${__dirname}/../../controllers/report/purchaseReports`);

const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================


// create Invoice
router.get("/product/stockValuationReport", productReportController.getStockValuationReport);

router.get("/product/productMovementReport", productReportController.getProductMovementReport);


router.get("/product/expiryReport", productReportController.getExpiryReport);


router.get("/product/lowStockReport", productReportController.getLowStockReport);

router.get("/invoice/salesReport", invoiceReportController.getSalesReport);


router.get("/purchase/purchasesReport", purchaseReportController.getPurchasesReport);







module.exports = router;