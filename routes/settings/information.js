const express=require(`express`);
const router=express.Router();

const setting=require(`${__dirname}/../../controllers/settings/information`)

const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
const upload = require(`${__dirname}/../../middlewares/multer`);


// get all info
router.get("/",setting.getSystemSettings);
// protected routes
router.use(authMiddleware.protected);
router.use(authorizationMiddleware.role('superadmin')); 



// update System Settings (information)
router.put("/",
 upload.fields([
    { name: "icon", maxCount: 1 },
    { name: "iconInvoices", maxCount: 1 },
  ])
    ,setting.updateSystemSettings)

// update Financial Pin (to Financial in system )
router.patch("/",setting.updateFinancialPin)



module.exports=router
