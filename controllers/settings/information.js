const SystemSettings = require(`${__dirname}/../../models/Settings`);
const bcrypt=require(`bcryptjs`)
const axios=require('axios');
const {uploadToCloud,deleteFromCloud}=require(`${__dirname}/../../services/cloudinary`)
// get all system info
exports.getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne().select("-financialPin")
      .populate("updatedBy", "username email role")
      .populate("financialPinUpdatedBy", "username email role");




    if (!settings) {
      settings = await SystemSettings.create({
        factoryName: "اسم المصنع",
        invoiceFactoryName: "اسم المصنع",
        financialPin: "123456", 
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب الإعدادات",
      error: error.message,
    });
  }
};


// update informtion to system  
exports.updateSystemSettings = async (req, res) => {
  try {
    const {
      factoryName,
      invoiceFactoryName,
      systemFont,
      invoiceFont,
      theme,
      phones
    } = req.body;

    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = new SystemSettings();
    }

    // ===========================
    // Basic Information
    // ===========================

    if (factoryName !== undefined) {
      settings.factoryName = factoryName;
    }

    if (invoiceFactoryName !== undefined) {
      settings.invoiceFactoryName = invoiceFactoryName;
    }

    if (systemFont !== undefined) {
      settings.systemFont = systemFont;
    }

    if (invoiceFont !== undefined) {
      settings.invoiceFont = invoiceFont;
    }
if (phones !== undefined) {
  let parsedPhones = phones;

  if (typeof parsedPhones === "string") {
    try {
      parsedPhones = JSON.parse(parsedPhones);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "صيغة أرقام الهاتف غير صحيحة",
      });
    }
  }

  // التأكد أنها Array
  if (!Array.isArray(parsedPhones)) {
    parsedPhones = [parsedPhones];
  }

  // تنظيف الأرقام
  settings.phones = parsedPhones
    .map(phone => String(phone).trim())
    .filter(Boolean);
}

    // ===========================
    // Theme
    // ===========================

    if (theme) {
      settings.theme = {
        ...settings.theme?.toObject?.() || settings.theme || {},
        ...theme,
      };
    }

    // ===========================
    // System Icon
    // ===========================

    if (req.files?.icon?.[0]) {

      if (settings.icon?.publicId) {
        await deleteFromCloud(settings.icon.publicId);
      }

      const uploadedIcon = await uploadToCloud(
        req.files.icon[0],
        "system-settings"
      );

      if (uploadedIcon) {
        settings.icon = {
          url: uploadedIcon.url,
          publicId: uploadedIcon.publicId,
        };
      }
    }

    // ===========================
    // Invoice Icon
    // ===========================

    if (req.files?.iconInvoices?.[0]) {

      if (settings.iconInvoices?.publicId) {
        await deleteFromCloud(settings.iconInvoices.publicId);
      }

      const uploadedIconInvoices = await uploadToCloud(
        req.files.iconInvoices[0],
        "system-settings"
      );

      if (uploadedIconInvoices) {
        settings.iconInvoices = {
          url: uploadedIconInvoices.url,
          publicId: uploadedIconInvoices.publicId,
        };
      }
    }

    // ===========================
    // Updated By
    // ===========================

    settings.updatedBy = req.user.userId;

    await settings.save();

    res.status(200).json({
      success: true,
      message: "تم تحديث الإعدادات بنجاح",
      data: settings,
    });

  } catch (error) {

    console.error("updateSystemSettings error:", error);

    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث الإعدادات",
      error: error.message,
    });
  }
};


// update informtion to system  
exports.updateFinancialPin = async (req, res) => {
  try {
    const {
      financialPin
    } = req.body;

    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = new SystemSettings();
    }



    if (financialPin !== undefined) {
      
         const financialPinHash =await  bcrypt.hash(financialPin,12)
         settings.financialPin = financialPinHash;
         settings.financialPinUpdatedBy = req.user.userId;
         settings.financialPinUpdatedDate=new Date();
    }



    await settings.save();


    res.status(200).json({
      success: true,
      message: "تم تحديث  رمز الحمايه الماليه بنجاح",
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث رمز الحمايه الماليه ",
      error: error.message,
    });
  }
};

