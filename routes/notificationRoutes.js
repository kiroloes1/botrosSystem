const express = require('express');
const router = express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
const notificationController = require(`${__dirname}/../controllers/notification/notificationController.js`);

// protected routes
router.use(authMiddleware.protected);
router.use(authorizationMiddleware.role('superadmin', 'manager')); 

router.get(
  "/",

  notificationController.getProductNotifications
);


router.get(
  "/stats",
  
  notificationController.getNotificationStats
);


router.get(
  "/alerts",

  notificationController.getProductAlerts
);

module.exports = router;