const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const purchaseController = require(`${__dirname}/../../controllers/purchase/purchase`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================



// create purchase
router.post("/", purchaseController.createPurchase);


// create purchase
router.put("/:id", purchaseController.updatePurchase);



// create purchase
router.delete("/:id", purchaseController.deletePurchase);


// create purchase
router.get("/", purchaseController.getPurchases);

router.get("/getPurchasesBySupplier", purchaseController.getPurchasesBySupplier);



// search
router.get("/search", purchaseController.searchPurchase);



// create purchase
router.get("/:id", purchaseController.getPurchaseById);




module.exports = router;
