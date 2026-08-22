const multer = require("multer");
const fs = require("fs");

const uploadPath = "/tmp/uploads";

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const upload = multer({
  dest: uploadPath,
});

module.exports = upload;
