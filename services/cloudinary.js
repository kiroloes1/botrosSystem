const cloudinary=require(`../config/cloudinaryConfig`)
const fs=require("fs");

exports.uploadToCloud=async(file, folder)=> {
  if (!file) return null;

  const result = await cloudinary.uploader.upload(file.path, {
    folder
  });
    fs.unlinkSync(file.path);
  return {
    url: result.secure_url,
    publicId: result.public_id
  };
}




exports.deleteFromCloud = async (publicId) => {
  if (!publicId) return null;
  return await cloudinary.uploader.destroy(publicId);
};

