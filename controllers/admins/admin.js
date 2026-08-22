const Admin = require(`${__dirname}/../../models/users`);
const bcrypt=require('bcryptjs');

//  crete admin
exports.createAdmin = async (req, res) => {
  try {
    const { username, email, password, role, notes } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "كل الحقول مطلوبة" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "الإيميل مستخدم بالفعل" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      username,
      email,
      password: hashedPassword,
      role,
      notes
    });

    res.status(201).json({
      message: "تم إنشاء الأدمن بنجاح",
      admin
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// get all mananger
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password");

    res.status(200).json({
      results: admins.length,
      admins
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// get admin by id
exports.getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    res.status(200).json({ admin });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// get admin by id
exports.getAdmin = async (req, res) => {
  try {
    const userID=req.user.userId;
    if(!userID){
      return res.status(404).json({ message: "يجب تسجيل الدخول" });
    }
    const admin = await Admin.findById(userID).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    res.status(200).json({ admin });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// update admin
exports.updateAdmin = async (req, res) => {
  try {
    const updateData = {};

    if (req.body.username) updateData.username = req.body.username;
    if (req.body.email) updateData.email = req.body.email;
    if (req.body.notes) updateData.notes = req.body.notes;
const oldAdmin=await Admin.findById(req.params.id)
const admin = await Admin.findByIdAndUpdate(
  req.params.id,
  {
    ...updateData,
  },
  { new: true, runValidators: true }
);

    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }


    res.status(200).json({
      message: "تم التحديث بنجاح",
      admin
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// change role
exports.changeRole = async (req, res) => {
  try {
   

     
    if (!req.body.role){
      return res.status(400).json("من فضلك اختر دور الادمين")
    }


    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      {role: req.body.role},
      { new: true, runValidators: true }
    );

    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    res.status(200).json({
      message: "تم التحديث بنجاح",
      admin
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// delete admin
exports.deleteAdmin=async(req,res)=>{
    try {
    const admin = await Admin.findByIdAndDelete(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }


    res.status(200).json({
      message: "تم حذف الأدمن بنجاح",
      admin
    });} catch (err) {
           res.status(500).json({ message: err.message });
    }
}

// activate or deactivate
exports.activateOrDeactivateAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

     await Admin.findByIdAndUpdate(
      req.params.id,
      { isVerified: admin.isVerified ? false : true },
      { new: true }
    );

    res.status(200).json({
      message: "تم تفعيل الأدمن",
      admin
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};