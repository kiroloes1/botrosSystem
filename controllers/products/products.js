const productModel = require(`${__dirname}/../../models/products`);
const XLSX = require("xlsx");
const uploadToCloud = require(`${__dirname}/../../services/cloudinary`);
const cloudinary = require(`${__dirname}/../../config/cloudinaryConfig`);
const fs = require('fs');
const mongoose = require("mongoose");


// =============================================
// CREATE PRODUCT
// =============================================
exports.createProduct = async (req, res) => {
  const {
   
    productName,
    description,
    category,
    unit_type,
    unitsPerPackage,
    availableQuantity,
    packageSellingPrice,
    pieceSellingPrice,
    purchasePrice,
    imageUrl,
    expiration,
    companyName
  } = req.body;

  // Validation
  if (
   
    !productName ||
    !unit_type ||
    !unitsPerPackage ||
    availableQuantity === undefined ||
    !packageSellingPrice ||
    !pieceSellingPrice ||
    !purchasePrice ||
    !expiration
  ) {
    return res.status(400).json({ message: "يجب عليك ملئ جميع الحقول المطلوبة" });
  }

  try {
    // Check if product code already exists

const lastProduct = await productModel.aggregate([
  {
    $match: {
      code: { $regex: /^AG-\d+$/ }
    }
  },
  {
    $addFields: {
      codeNumber: {
        $toInt: {
          $substr: ["$code", 3, -1]
        }
      }
    }
  },
  {
    $sort: {
      codeNumber: -1
    }
  },
  {
    $limit: 1
  }
]);

let nextNumber = 1;

if (lastProduct.length > 0) {
  nextNumber = lastProduct[0].codeNumber + 1;
}

    const code = `AG-${nextNumber}`;

    const newProduct = new productModel({
      code,
      productName,
      description,
      companyName,
      category,
      unit_type,
      unitsPerPackage: Number(unitsPerPackage),
      availableQuantity: Number(availableQuantity),
      packageSellingPrice: Number(packageSellingPrice),
      pieceSellingPrice: Number(pieceSellingPrice),
      purchasePrice: Number(purchasePrice),
      expiration: new Date(expiration),
      image: {
        url: imageUrl || "",
        publicId: ""
      }
    });

    await newProduct.save();

    return res.status(201).json({
      message: "تم إضافة المنتج بنجاح",
      product: newProduct
    });

  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ: " + err.message });
  }
};

// =============================================
// CREATE FROM EXCEL
// =============================================
exports.createFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const file = req.file.buffer;
    const workbook = XLSX.read(file, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const productData = XLSX.utils.sheet_to_json(worksheet);

    let added = 0;
    let skipped = 0;
    let errors = [];

    const pushProducts = [];
    const seenCodes = new Set();

    // =============================================
    // GET LATEST CODE FOR AUTO-GENERATION
    // =============================================
    const getNextCode = async () => {
      // Find the last product with code starting with "AG-"
      const lastProduct = await productModel.findOne(
        { code: { $regex: /^AG-\d+$/ } },
        { code: 1 }
      ).sort({ code: -1 });

      let lastNumber = 0;
      if (lastProduct) {
        const match = lastProduct.code.match(/^AG-(\d+)$/);
        if (match) {
          lastNumber = parseInt(match[1]);
        }
      }

      // Also check seenCodes for duplicates in current batch
      let maxSeen = 0;
      for (const code of seenCodes) {
        const match = code.match(/^AG-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxSeen) maxSeen = num;
        }
      }

      const nextNumber = Math.max(lastNumber, maxSeen) + 1;
      return `AG-${String(nextNumber).padStart(3, '0')}`;
    };

    // Get existing codes
    const allCodes = productData.map(p => p.code).filter(c => c);
    const existingProducts = await productModel.find({
      code: { $in: allCodes }
    });
    const existingCodes = new Set(existingProducts.map(p => p.code));

    for (const product of productData) {
      let {
        code,
        productName,
        description,
        companyName,
        category,
        unit_type,
        unitsPerPackage,
        availableQuantity,
        packageSellingPrice,
        pieceSellingPrice,
        purchasePrice,
        imageUrl,
        expiration
      } = product;

      // =============================================
      // AUTO-GENERATE CODE IF NOT PROVIDED
      // =============================================
      if (!code || code.trim() === "") {
        code = await getNextCode();
        // Add to seenCodes to avoid duplicate in same batch
        seenCodes.add(code);
      }

      // Check required fields
      const requiredFields = {
        code: "كود المنتج",
        productName: "اسم المنتج",
        unit_type: "نوع الوحدة",
        unitsPerPackage: "عدد الوحدات في العبوة",
        availableQuantity: "الكمية المتاحة",
        packageSellingPrice: "سعر بيع العبوة",
        pieceSellingPrice: "سعر بيع القطعة",
        purchasePrice: "سعر الشراء",
        expiration: "تاريخ الانتهاء"
      };

      const missingFields = [];
      Object.keys(requiredFields).forEach((field) => {
        if (
          product[field] === undefined ||
          product[field] === null ||
          product[field] === "" ||
          (typeof product[field] === "number" && isNaN(product[field]))
        ) {
          missingFields.push(requiredFields[field]);
        }
      });

      if (missingFields.length > 0) {
        skipped++;
        errors.push({
          product: code || productName || "Unknown",
          reason: `ناقص: ${missingFields.join("، ")}`
        });
        continue;
      }

      // Duplicate inside Excel (check with seenCodes)
      if (seenCodes.has(code)) {
        skipped++;
        errors.push({ product: code, reason: "مكرر داخل ملف Excel" });
        continue;
      }
      seenCodes.add(code);

      // Duplicate in DB
      if (existingCodes.has(code)) {
        skipped++;
        errors.push({ product: code, reason: "موجود مسبقاً" });
        continue;
      }

      // Handle unit_type: if "قطعة", unitsPerPackage = 1
      let finalUnitsPerPackage = Number(unitsPerPackage);
      let finalPackageSellingPrice = Number(packageSellingPrice);
      
      if (unit_type === "قطعة") {
        finalUnitsPerPackage = 1;
        finalPackageSellingPrice = Number(pieceSellingPrice);
      }

      pushProducts.push({
        code,
        productName,
        description: description || "",
        category: category || "",
        companyName: companyName || "اسم الشركه غير مذكور",
        unit_type,
        unitsPerPackage: finalUnitsPerPackage,
        availableQuantity: Number(availableQuantity),
        packageSellingPrice: finalPackageSellingPrice,
        pieceSellingPrice: Number(pieceSellingPrice),
        purchasePrice: Number(purchasePrice),
        expiration: new Date(expiration),
        image: {
          url: imageUrl || "",
          publicId: ""
        },
        totalUnits: Number(availableQuantity) * finalUnitsPerPackage,
        status: Number(availableQuantity) > 0 ? "active" : "out-of-stock"
      });
    }

    // Insert in chunks
    const chunkSize = 100;
    for (let i = 0; i < pushProducts.length; i += chunkSize) {
      const chunk = pushProducts.slice(i, i + chunkSize);
      try {
        const result = await productModel.insertMany(chunk, { ordered: false });
        added += result.length;
      } catch (err) {
        if (err.code === 11000) {
          added += err.result?.nInserted || 0;
          skipped += chunk.length - (err.result?.nInserted || 0);
        } else {
          throw err;
        }
      }
    }

    return res.status(200).json({
      message: "تم رفع المنتجات بنجاح",
      added,
      skipped,
      errors,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "حدث خطأ أثناء رفع المنتجات",
      error: err.message
    });
  }
};

// =============================================
// GET ALL PRODUCTS (ADMIN)
// =============================================
exports.getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, category, status , expire  } = req.query;
    let matchQuery = {};

    if (search) {
      matchQuery.$or = [
        { productName: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } }

      ];
    }

    if (category && category !== "الكل") {
      matchQuery.category = category;
    }

    if (status && status !== "الكل") {
      if (status === "متوفر") matchQuery.availableQuantity = { $gt: 0 };
      if (status === "نافذ") matchQuery.availableQuantity = { $lte: 0 };
    }

    // ===============================
// فلترة حالة انتهاء المنتج
// ===============================

if (expire && expire !== "الكل") {

    const now = new Date();

    // بداية اليوم
    now.setHours(0, 0, 0, 0);

    // بعد 4 شهور من اليوم
    const fourMonthsLater = new Date(now);
    fourMonthsLater.setMonth(fourMonthsLater.getMonth() + 4);

    if (expire === "منتهي") {

        matchQuery.expiration = {
            $lt: now
        };

    } else if (expire === "قريب الانتهاء") {

        matchQuery.expiration = {
            $gte: now,
            $lte: fourMonthsLater
        };

    } else if (expire === "ساري") {

        matchQuery.expiration = {
            $gt: fourMonthsLater
        };

    } else if (expire === "بدون تاريخ انتهاء") {

        matchQuery.$or = [
            { expiration: null },
            { expiration: { $exists: false } }
        ];

    }
}
const now = new Date();

const fourMonthsLater = new Date();
fourMonthsLater.setMonth(fourMonthsLater.getMonth() + 4);

const productsData = await productModel.aggregate([
  { $match: matchQuery },

  { $sort: { createdAt: -1 } },

  {
    $facet: {
      metadata: [
        { $count: "total" }
      ],

      data: [
        { $skip: skip },
        { $limit: limit }
      ],

      // المنتجات المنتهية
      totalExpire: [
        {
          $match: {
            expiration: { $lt: now },
            totalUnits: { $gt: 0 }
          }
        },
        {
          $count: "count"
        }
      ],

      // المنتجات التي ستنتهي خلال 4 شهور
      totalNearExpire: [
        {
          $match: {
            expiration: {
              $gte: now,
              $lte: fourMonthsLater
            },
            totalUnits: { $gt: 0 }
          }
        },
        {
          $count: "count"
        }
      ]
    }
  }
]);



    const products = productsData[0].data || [];
    const totalCount = productsData[0].metadata[0]?.total || 0;
    const totalExpire =
  productsData[0].totalExpire[0]?.count || 0;

      const totalNearExpire =
  productsData[0].totalNearExpire[0]?.count || 0;

    return res.status(200).json({
      message: "تم جلب المنتجات بنجاح",
      data: products,
      total: totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalExpire,
      totalNearExpire
    });

  } catch (err) {
    return res.status(500).json({
      message: "حدث خطأ أثناء جلب المنتجات: " + err.message
    });
  }
};

// =============================================
// GET PRODUCT BY ID (ADMIN)
// =============================================
exports.getProductByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await productModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id)
        }
      }
    ]);

    if (product.length === 0) {
      return res.status(404).json({
        message: "المنتج غير موجود"
      });
    }

    return res.status(200).json({
      message: "تم جلب المنتج بنجاح",
      data: product[0]
    });

  } catch (err) {
    return res.status(500).json({
      message: err.message
    });
  }
};

// =============================================
// GET ALL CATEGORIES
// =============================================
exports.filterProductBasedOnCategory = async (req, res) => {
  try {
    const categories = await productModel.distinct("category");
    return res.status(200).json({
      message: "تم جلب جميع الأصناف بنجاح",
      data: categories,
      length: categories.length
    });
  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ أثناء جلب الأصناف: " + err.message });
  }
};

// =============================================
// SEARCH PRODUCTS (ADMIN)
// =============================================
exports.search = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { category, search } = req.query;

    if (!search) {
      return res.status(400).json({
        message: "من فضلك ادخل كلمات للبحث عنها"
      });
    }

    let matchQuery = {
      ...(category && { category }),
      $or: [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      

      ]
    };

    const products = await productModel.find(matchQuery)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: `تم العثور على ${products.length} منتج(ات)`,
      data: products
    });

  } catch (err) {
    return res.status(500).json({
      message: "حدث خطأ أثناء البحث: " + err.message
    });
  }
};

// =============================================
// SEARCH PRODUCTS (ADMIN)
// =============================================
exports.search2 = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { category, search } = req.query;

    if (!search) {
      return res.status(400).json({
        message: "من فضلك ادخل كلمات للبحث عنها"
      });
    }

let matchQuery = {
  ...(category && { category }),
  totalUnits: { $gt: 0 },
  $or: [
    { productName: { $regex: search, $options: "i" } },
    { description: { $regex: search, $options: "i" } },
    { code: { $regex: search, $options: "i" } },
  ]
};

    const products = await productModel.find(matchQuery)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: `تم العثور على ${products.length} منتج(ات)`,
      data: products
    });

  } catch (err) {
    return res.status(500).json({
      message: "حدث خطأ أثناء البحث: " + err.message
    });
  }
};

// =============================================
// SUGGESTION (AUTOCOMPLETE)
// =============================================
exports.suggestion = async (req, res) => {
  try {
    const { category } = req.query;

    let filter = {};
    if (category) {
      filter.category = category;
    }

    const suggestion = await productModel.find(
      filter,
      {
        category: 1,
        description: 1,
        productName: 1,
        code: 1
      }
    );

    res.status(200).json({
      message: `تم العثور على ${suggestion.length} منتج(ات)`,
      data: suggestion
    });

  } catch (err) {
    res.status(500).json({
      message: "حدث خطأ أثناء البحث: " + err.message
    });
  }
};

// =============================================
// EXPORT PRODUCTS
// =============================================
exports.exportProducts = async (req, res) => {
  try {
    const products = await productModel.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// =============================================
// UPDATE PRODUCT
// =============================================
exports.updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ message: "من فضلك اختر المنتج أولاً" });
    }

    const updateData = req.body;

    // Validate numeric fields
    if (updateData.unitsPerPackage !== undefined) {
      updateData.unitsPerPackage = Number(updateData.unitsPerPackage);
    }
    if (updateData.availableQuantity !== undefined) {
      updateData.availableQuantity = Number(updateData.availableQuantity);
    }
    if (updateData.packageSellingPrice !== undefined) {
      updateData.packageSellingPrice = Number(updateData.packageSellingPrice);
    }
    if (updateData.pieceSellingPrice !== undefined) {
      updateData.pieceSellingPrice = Number(updateData.pieceSellingPrice);
    }
    if (updateData.purchasePrice !== undefined) {
      updateData.purchasePrice = Number(updateData.purchasePrice);
    }
    if (updateData.expiration) {
      updateData.expiration = new Date(updateData.expiration);
    }

    // Calculate totalUnits if relevant fields updated
    if (updateData.availableQuantity !== undefined || updateData.unitsPerPackage !== undefined) {
      const product = await productModel.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "هذا المنتج غير موجود" });
      }
      const unitsPerPackage = updateData.unitsPerPackage ?? product.unitsPerPackage;
      const availableQuantity = updateData.availableQuantity ?? product.availableQuantity;
      updateData.totalUnits = unitsPerPackage * availableQuantity;
      updateData.status = availableQuantity > 0 ? "active" : "out-of-stock";
    }

    const updatedProduct = await productModel.findByIdAndUpdate(
      productId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "هذا المنتج غير موجود" });
    }

    res.status(200).json({
      message: "تم تحديث المنتج بنجاح",
      product: updatedProduct
    });

  } catch (err) {
    res.status(500).json({ message: "حدث خطأ أثناء تحديث المنتج: " + err.message });
  }
};

// =============================================
// DELETE PRODUCT
// =============================================
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ message: "من فضلك اختر المنتج أولاً" });
    }

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "هذا المنتج غير موجود" });
    }

    // Delete image from Cloudinary
    if (product.image?.publicId) {
      await cloudinary.uploader.destroy(product.image.publicId);
    }

    await productModel.findByIdAndDelete(productId);

    res.status(200).json({
      message: "تم حذف المنتج بنجاح",
      product
    });

  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ أثناء حذف المنتج: " + err.message });
  }
};

// =============================================
// DELETE ALL PRODUCTS
// =============================================
exports.deleteAllProducts = async (req, res) => {
  try {
    const products = await productModel.find();

    const publicIds = [];
    products.forEach(product => {
      if (product.image?.publicId) {
        publicIds.push(product.image.publicId);
      }
    });

    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds);
    }

    await productModel.deleteMany();

    res.status(200).json({
      message: "تم حذف جميع المنتجات والصور بنجاح",
      deletedImages: publicIds.length
    });

  } catch (err) {
    res.status(500).json({
      message: "خطأ أثناء حذف جميع المنتجات: " + err.message
    });
  }
};

// =============================================
// UPLOAD IMAGE TO PRODUCT
// =============================================
exports.uploadImageToProduct = async (req, res) => {
  try {
    const file = req.file;
    const folderBase = 'productImage';
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ message: "من فضلك اختر المنتج أولاً" });
    }

    const product = await productModel.findById(productId, { image: 1 });
    if (!product) {
      return res.status(400).json({ message: "هذا المنتج غير موجود" });
    }

    if (!file) {
      return res.status(400).json({ message: "لم يتم إرسال أي صورة" });
    }

    if (product?.image?.publicId) {
      await uploadToCloud.deleteFromCloud(product.image.publicId);
    }

    const result = await uploadToCloud.uploadToCloud(file, `${folderBase}/image`);
    product.image.url = result.url;
    product.image.publicId = result.publicId;

    await product.save();

    res.status(201).json({
      message: "تم رفع الصورة لهذا المنتج",
      product
    });

  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ أثناء رفع الصورة: " + err.message });
  }
};

// =============================================
// DELETE IMAGE FROM PRODUCT
// =============================================
exports.deleteImageToProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ message: "من فضلك اختر المنتج أولاً" });
    }

    const product = await productModel.findById(productId, { image: 1 });
    if (!product) {
      return res.status(404).json({ message: "هذا المنتج غير موجود" });
    }

    if (product.image?.publicId) {
      await cloudinary.uploader.destroy(product.image.publicId);
    }

    product.image = { url: "", publicId: "" };
    await product.save();

    res.status(200).json({
      message: "تم حذف الصورة لهذا المنتج بنجاح",
      product
    });

  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ أثناء حذف الصورة: " + err.message });
  }
};