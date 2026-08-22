const jwt = require("jsonwebtoken");
const settings = require(`${__dirname}/../models/Settings`);
const bcrypt=require(`bcryptjs`)
exports.protected = async (req, res, next) => {
  try {
    // ================= API KEY =================



    // ================= JWT =================
    const authHeader = req.headers.authorization;
    

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No token or API Key provided",
      });
    }

    const token = authHeader.split(" ")[2];


    const decoded = jwt.verify(token, process.env.ACCESS_JWT_SECRET);

    
    if (!decoded.financialPin) {
      return res.status(401).json({
        message: "يجب ادخال الرقم السري المالي للوصول إلى هذه الصفحة",
      });
    }
    const systemSettings = await settings.findOne()

    const isPinValid = await bcrypt.compare(decoded.financialPin, systemSettings.financialPin);

    if (!isPinValid) {
      return res.status(401).json({
        message: "يجب ادخال الرقم السري المالي الصحيح للوصول إلى هذه الصفحة",
      });
    }

 
    

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Authentication failed",
      error: error.message,
    });
  }
};