const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const invoiceController = require(`${__dirname}/../../controllers/invoice/invoice`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager',)); // only admin and manager can access these routes
// ========================== ROUTES ==========================



// create Invoice
router.post("/", invoiceController.createInvoice);


// create Invoice
router.put("/:id", invoiceController.updateInvoice);



// create Invoice
router.delete("/:id", invoiceController.deleteInvoice);


// create Invoice
router.get("/", invoiceController.getInvoices);

router.get("/getInvoicesByCustomer", invoiceController.getInvoicesByCustomer);

// search
router.get("/search", invoiceController.searchInvoice);

// create Invoice
router.get("/:id", invoiceController.getInvoiceById);




module.exports = router;