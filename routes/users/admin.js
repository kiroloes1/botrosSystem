const express = require("express");
const router = express.Router();

const adminController = require(`${__dirname}/../../controllers/admins/admin`);
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);

// protected routes
router.use(authMiddleware.protected);



// CRUD Admin

router.use(authorizationMiddleware.role('superadmin', 'manager')); 
// create admin
router.post("/", adminController.createAdmin);

// get all admins
router.get("/", adminController.getAllAdmins);

// get admin 
router.get("/profile", adminController.getAdmin);

// get admin by id
router.get("/:id", adminController.getAdminById);



// update admin 
router.patch("/:id", adminController.updateAdmin);

// delete admin
router.delete("/:id", adminController.deleteAdmin);

// activate / deactivate
router.patch("/:id/toggle-active", adminController.activateOrDeactivateAdmin);
router.patch("/changeRole/:id" ,adminController.changeRole)
module.exports = router;