const jwt = require("jsonwebtoken");
const User = require(`${__dirname}/../models/users`);

exports.protected = async (req, res, next) => {
  try {
    // ================= API KEY =================
    const apiKey = req.headers["x-api-key"];

    if (apiKey) {
      if (apiKey !== process.env.INTERNAL_API_KEY) {
        return res.status(401).json({
          message: "Invalid API Key",
        });
      }

      req.system = true;
      return next();
    }

    // ================= JWT =================
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No token or API Key provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ACCESS_JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "The user belonging to this token no longer exists",
      });
    }

    req.user = decoded;
    

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Authentication failed",
      error: error.message,
    });
  }
};