const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const supplierController = require(`${__dirname}/../../controllers/people/supplier`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================



// GET all suppliers
router.get("/", supplierController.getAllSuppliers);

// GET all suppliers to delivery
// router.get("/getAllSuppliersToDelivery", supplierController.getAllSuppliersToDelivery);

router.get("/getAllSupplierName", supplierController.getAllSupplierName);



router.get("/allPaymentPerSupplier", supplierController.allPaymentPerSupplier);

// GET supplier by ID
router.get("/:id", supplierController.getSupplierById);

// CREATE new supplier
router.post("/", supplierController.createNewSupplier);

// UPDATE supplier
router.put("/:id", supplierController.updateSupplier);


// delete supplier
router.delete("/:id", supplierController.deleteSupplier);



router.patch("/addDebt/:id", supplierController.addDebt);


// ADD to supplier balance (payment)
router.patch("/paySupplier/:id", supplierController.paySupplier);


// delete Payment History
router.delete("/deletePaymentHistory/:paymentId/:supplierId", supplierController.deletePaymentHistory);


router.patch("/editPaymentHistory/:paymentId/:supplierId", supplierController.editPaymentHistory);


module.exports = router;