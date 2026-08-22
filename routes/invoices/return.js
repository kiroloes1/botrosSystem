const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const SalesReturnController = require(`${__dirname}/../../controllers/invoice/return`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================



// create Invoice
router.delete("/:id", SalesReturnController.deleteReturn);


// create Invoice
router.get("/", SalesReturnController.getReturns);


// create Invoice
router.get("/:id", SalesReturnController.getReturnById);




module.exports = router;