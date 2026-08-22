const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const CustomerController = require(`${__dirname}/../../controllers/people/customer`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================



// GET all Customerrs
router.get("/", CustomerController.getAllCustomers);

// GET all Customerrs to delivery
// router.get("/getAllCustomerrsToDelivery", CustomerController.getAllCustomerrsToDelivery);

router.get("/getAllCustomerName", CustomerController.getAllCustomerName);


router.get("/allPaymentPerCustomer",CustomerController.allPaymentPerCustomer)

// GET Customerr by ID
router.get("/:id", CustomerController.getCustomerById);

// CREATE new Customerr
router.post("/", CustomerController.createNewCustomer);

// UPDATE Customerr
router.put("/:id", CustomerController.updateCustomer);




// delete Payment History
router.delete("/deletePaymentHistory/:paymentId/:customerId", CustomerController.deletePaymentHistory);


router.patch("/editPaymentHistory/:paymentId/:customerId", CustomerController.editPaymentHistory);

// delete Customerr
router.delete("/:id", CustomerController.deleteCustomer);



router.patch("/addDebt/:id", CustomerController.addDebt);


// ADD to supplier balance (payment)
router.patch("/paySupplier/:id", CustomerController.paySupplier);




module.exports = router;