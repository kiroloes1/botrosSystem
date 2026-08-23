
const Purchase = require(`${__dirname}/../../models/purchase`);
const Product = require(`${__dirname}/../../models/products`);
const supplierModel = require(`${__dirname}/../../models/people/supplier`);
const PaymentModel = require(`${__dirname}/../../models/payment`);
const mongoose = require("mongoose");
const SalesReturn = require(`${__dirname}/../../models/return`);

// ============================================================
// Helper: يجيب المنتج لو موجود، أو ينشئه لو مش موجود
// بيرجع { productRef, isNew }
// ============================================================
async function findOrCreateProduct(item, session) {
  let productRef = null;

  // ============================================
  // 1. لو فيه Product ID → نجيب المنتج الموجود
  // ============================================

  if (
    item.product &&
    mongoose.Types.ObjectId.isValid(item.product)
  ) {
    productRef = await Product
      .findById(item.product)
      .session(session);
  }

  // ============================================
  // 2. البحث بالكود لو موجود
  //    الكود أصبح اختياري
  // ============================================

  if (!productRef && item.code) {
    productRef = await Product
      .findOne({ code: item.code })
      .session(session);
  }

  // ============================================
  // 3. المنتج موجود
  // ============================================

  if (productRef) {
    return {
      productRef,
      isNew: false
    };
  }

  // ============================================
  // 4. Validation للمنتج الجديد
  // ============================================

  if (!item.productName || !item.unit_type) {
    throw new Error(
      `بيانات غير كافية لإنشاء منتج جديد: الاسم ونوع الوحدة مطلوبين`
    );
  }

if (item.unit_type === "قطعة") {
  if (!item.pieceSellingPrice || Number(item.pieceSellingPrice) <= 0) {
    throw new Error(
      `يجب إدخال سعر بيع القطعة عند إضافة منتج جديد: ${item.productName}`
    );
  }
}

if (item.unit_type === "كرتونة") {
  if (
    !item.packageSellingPrice ||
    Number(item.packageSellingPrice) <= 0 ||
    !item.pieceSellingPrice ||
    Number(item.pieceSellingPrice) <= 0
  ) {
    throw new Error(
      `يجب إدخال سعر بيع الكرتونة والقطعة عند إضافة منتج جديد: ${item.productName}`
    );
  }
}

  if (!item.expiration) {
    throw new Error(
      `يجب إدخال تاريخ الصلاحية عند إضافة منتج جديد: ${item.productName}`
    );
  }

  // ============================================
  // 5. توليد كود المنتج تلقائيًا
  // ============================================

  const lastProduct = await Product
    .findOne({
      code: {
        $regex: /^AG-\d+$/
      }
    })
    .sort({ createdAt: -1 })
    .session(session);

  let nextNumber = 1;

  if (lastProduct?.code) {
    const match = lastProduct.code.match(/^AG-(\d+)$/);

    if (match) {
      nextNumber = Number(match[1]) + 1;
    }
  }

  const generatedCode = `AG-${nextNumber}`;

  // ============================================
  // 6. إنشاء المنتج الجديد
  // ============================================

  const newProduct = new Product({
    code: generatedCode,

    productName: item.productName,

    description: item.description || "",

    category: item.category || "",

    companyName: item.companyName || undefined,

    unit_type: item.unit_type,

    unitsPerPackage: Number(item.unitsPerPackage) || 1,

    availableQuantity: 0,

    packageSellingPrice: Number(item.packageSellingPrice),

    pieceSellingPrice: Number(item.pieceSellingPrice),

    purchasePrice: Number(item.price),

    expiration: new Date(item.expiration),

    image: item.image || undefined,
  });

  return {
    productRef: newProduct,
    isNew: true
  };
}
// ============================================================
// create Purchase
// ============================================================
exports.createPurchase = async (req, res) => {
  let session = null;
  try {
    const { userId } = req.user;
    const { SupplierId, purchaseDate, discount = 0, adminNote } = req.body;

    // 1. Parsing Inputs
    const items = typeof req.body.items === "string"
      ? JSON.parse(req.body.items)
      : req.body.items || [];

    const rawPayments = typeof req.body.payment === "string"
      ? JSON.parse(req.body.payment)
      : req.body.payment || [];

    const payments = Array.isArray(rawPayments) ? rawPayments : [rawPayments];

    // 2. Validations
    if (!items.length) {
      return res.status(400).json({ message: "يجب أن تحتوي فاتورة المشتريات على منتج واحد على الأقل" });
    }

    for (const p of payments) {
      if (p.paymentMethod === "wallet" && !p.walletInfo?.senderPhone) {
        return res.status(400).json({ message: "يجب عليك ارفاق رقم المحفظة المحول منها" });
      }
    }

    // 3. Start Session & Transaction
    session = await mongoose.startSession();
    session.startTransaction();

    const supplier = await supplierModel.findById(SupplierId).session(session);
    if (!supplier) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "هذا المورد غير موجود" });
    }

    const oldSupplierBalance = supplier.balance;

    // 4. تجميع الكميات لكل منتج (بالـ product id لو موجود أو بالـ code)
    const productMap = {}; // key -> { productRef, isNew, totalUnitsToAdd }
    const purchaseItems = [];

    for (const item of items) {
      if (!item.quantity || !item.price) {
        throw new Error("يجب إرسال الكمية والسعر لكل منتج");
      }
      if (isNaN(item.quantity) || isNaN(item.price)) {
        throw new Error("الكميات والأسعار يجب أن تكون أرقاماً صحيحة");
      }
      // if (!item.product && !item.code) {
      //   throw new Error("يجب إرسال كود المنتج أو معرّفه لكل عنصر");
      // }

      const key = (item.product || item.code)?.toString();

      if (!productMap[key]) {
        const { productRef, isNew } = await findOrCreateProduct(item, session);
        productMap[key] = { productRef, isNew, totalUnitsToAdd: 0, unit_type: productRef.unit_type };
      }

const entry = productMap[key];

const unitsPerPkg = entry.productRef.unitsPerPackage || 1;

const neededUnits = item.unit_type === "كرتونة"
  ? Number(item.quantity) * unitsPerPkg
  : Number(item.quantity);

entry.totalUnitsToAdd += neededUnits;

// تحديث آخر سعر شراء
entry.productRef.purchasePrice = Number(item.price);

item.subtotal = Number(item.quantity) * Number(item.price);

purchaseItems.push({
  product: entry.productRef._id,
  productName: item.productName || entry.productRef.productName,
  unit_type: item.unit_type,
  quantity: item.quantity,
  price: item.price,
  subtotal: item.subtotal,
});
    }

    // 5. تطبيق الإضافة الفعلية على كل منتج (موجود أو جديد)
    for (const key in productMap) {
      const { productRef, isNew, totalUnitsToAdd } = productMap[key];

      if (isNew) {
        // منتج جديد: الكمية المتاحة = إجمالي القطع الأساسية / وحدات الكرتونة حسب نوع وحدته
        productRef.availableQuantity =
          productRef.unit_type === "كرتونة"
            ? Math.floor(totalUnitsToAdd / (productRef.unitsPerPackage || 1))
            : totalUnitsToAdd;
        await productRef.save({ session }); // pre-save هيحسب totalUnits والـ status
      } else {
        // منتج موجود: نزود totalUnits ونعيد حساب availableQuantity
        productRef.totalUnits += totalUnitsToAdd;
        productRef.availableQuantity =
          productRef.unit_type === "كرتونة"
            ? Math.floor(productRef.totalUnits / (productRef.unitsPerPackage || 1))
            : productRef.totalUnits;


        await productRef.save({ session });
      }
    }

    // 6. Calculations
    const totalPrice = purchaseItems.reduce((acc, curr) => acc + Number(curr.subtotal), 0);
    const totalDiscount = (totalPrice * Number(discount)) / 100;
    const finalPrice = totalPrice - totalDiscount;

    const totalPaid = payments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const netPrice = finalPrice - totalPaid; // المتبقي اللي لسه مديونين بيه للمورد

    // Update Supplier Balance (المبلغ اللي إحنا مديونين بيه للمورد)
    supplier.balance += netPrice;
    await supplier.save({ session });

    let status = "unpaid";
    if (netPrice <= 0) status = "paid";
    else if (totalPaid > 0) status = "partPaid";

    // 7. Create Purchase
    const [createdPurchase] = await Purchase.create(
      [{
        user: userId,
        supplier: SupplierId,
        items: purchaseItems,
        totalPrice,
          paidAmount:totalPaid,
        discount,
        finalPrice: Number(finalPrice.toFixed(2)),
        purchaseDate: purchaseDate || new Date(),
        oldSupplierBalance,
        status,
        adminNote: adminNote || "لا يوجد ملاحظات",
      }],
      { session }
    );

    // 8. Create Payments (moneyFlow: outgoing - إحنا اللي بندفع للمورد)
    for (const p of payments) {
      if (!p.amount || p.amount <= 0) continue;

      let walletInfo = null;
      let bankInfo = null;

      if (p.paymentMethod === "wallet" && p.walletInfo) {
        walletInfo = {
          senderName: p.walletInfo.senderName,
          senderPhone: p.walletInfo.senderPhone,
          receiverName: p.walletInfo.receiverName,
          receiverPhone: p.walletInfo.receiverPhone,
        };
      }

      if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && p.bankInfo) {
        bankInfo = { bankName: p.bankInfo.bankName };
      }

      await PaymentModel.create(
        [{
          customer: null,
          supplier: SupplierId,
          module: "purchase",
          moduleId: createdPurchase._id,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          moneyFlow: "outgoing",
          walletInfo,
          bankInfo,
          transactionDate: purchaseDate || new Date(),
          createdBy: userId,
          notes: adminNote || "لا يوجد ملاحظات مذكوره",
        }],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "تم إنشاء فاتورة المشتريات بنجاح",
      createdPurchase,
    });
  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    return res.status(400).json({
      message: err.message || "حدث خطأ أثناء إنشاء فاتورة المشتريات",
    });
  }
};

// ============================================================
// update Purchase
// ============================================================
exports.updatePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { userId } = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("ID فاتورة المشتريات غير صحيح");
    }

    const {
      SupplierId,
      purchaseDate,
      discount = 0,
      adminNote,
      items = [],
      payment = [],
    } = req.body;

    const parsedItems = typeof items === "string" ? JSON.parse(items) : items;
    const rawPayments = typeof payment === "string" ? JSON.parse(payment) : payment;
    const payments = Array.isArray(rawPayments) ? rawPayments : [rawPayments];

    if (!parsedItems.length) {
      throw new Error("يجب أن تحتوي فاتورة المشتريات على منتج واحد على الأقل");
    }

    const oldPurchase = await Purchase.findById(id).session(session);
    if (!oldPurchase) throw new Error("فاتورة المشتريات غير موجودة");

    const supplierDoc = await supplierModel.findById(oldPurchase.supplier).session(session);
    if (!supplierDoc) throw new Error("المورد غير موجود");

    // ==========================================
    // 1. ROLLBACK OLD EFFECT (نطرح الكمية اللي كانت اتضافت وقت الإنشاء)
    // ==========================================
    for (const oldItem of oldPurchase.items) {
      const productRef = await Product.findById(oldItem.product).session(session);
      if (!productRef) continue;

      const unitsPerPkg = productRef.unitsPerPackage || 1;
      const oldUnits = oldItem.unit_type === "كرتونة"
        ? Number(oldItem.quantity) * unitsPerPkg
        : Number(oldItem.quantity);

      if (productRef.totalUnits < oldUnits) {
        throw new Error(
          `لا يمكن تعديل الفاتورة، جزء من كمية المنتج (${productRef.productName}) تم بيعه بالفعل`
        );
      }

      productRef.totalUnits -= oldUnits;
      productRef.availableQuantity =
        productRef.unit_type === "كرتونة"
          ? Math.floor(productRef.totalUnits / unitsPerPkg)
          : productRef.totalUnits;

      await productRef.save({ session });
    }

    const oldPayments = await PaymentModel.find({
      moduleId: id,
      module: "purchase",
    }).session(session);

    const oldTotalPaid = oldPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const oldNetPrice = oldPurchase.finalPrice - oldTotalPaid;

    supplierDoc.balance -= oldNetPrice;

    await PaymentModel.deleteMany({
      moduleId: id,
      module: "purchase",
    }).session(session);

    // ==========================================
    // 2. DETECT QUANTITY DECREASE -> AUTO PURCHASE RETURN
    // (ملحوظة: يحتاج تعديل schema الخاص بـ SalesReturn - شوف التعليق
    //  في أول الملف قبل ما تفعّل الجزء ده في بيئة الإنتاج)
    // ==========================================
    const oldItemsMap = new Map();
    for (const oldItem of oldPurchase.items) {
      const key = `${oldItem.product}_${oldItem.unit_type}`;
      const prev = oldItemsMap.get(key);
      if (prev) {
        prev.quantity += Number(oldItem.quantity);
      } else {
        oldItemsMap.set(key, {
          product: oldItem.product,
          productName: oldItem.productName,
          unit_type: oldItem.unit_type,
          quantity: Number(oldItem.quantity),
          price: oldItem.price,
        });
      }
    }

    const newItemsMap = new Map();
    for (const item of parsedItems) {
      const key = `${item.product || item.code}_${item.unit_type}`;
      const prev = newItemsMap.get(key);
      if (prev) {
        prev.quantity += Number(item.quantity);
      } else {
        newItemsMap.set(key, { quantity: Number(item.quantity) });
      }
    }

    const autoReturnItems = [];
    for (const [key, oldData] of oldItemsMap.entries()) {
      const newQty = newItemsMap.get(key)?.quantity || 0;
      const diff = oldData.quantity - newQty; // موجب = نقصان = مرتجع للمورد

      if (diff > 0) {
        autoReturnItems.push({
          product: oldData.product,
          productName: oldData.productName,
          unit_type: oldData.unit_type,
          invoiceQuantity: oldData.quantity,
          returnQuantity: diff,
          price: oldData.price,
          subtotal: diff * oldData.price,
        });
      }
    }

    // ==========================================
    // 3. APPLY NEW ITEMS (نفس منطق findOrCreateProduct)
    // ==========================================
    const productMap = {};
    const newPurchaseItems = [];

    for (const item of parsedItems) {
      if (!item.quantity || !item.price) {
        throw new Error("يجب إرسال الكمية والسعر لكل منتج");
      }
      if (isNaN(item.quantity) || isNaN(item.price)) {
        throw new Error("الكميات والأسعار يجب أن تكون أرقاماً صحيحة");
      }
      // if (!item.product && !item.code) {
      //   throw new Error("يجب إرسال كود المنتج أو معرّفه لكل عنصر");
      // }

      const key = (item.product || item.code)?.toString();

      if (!productMap[key]) {
        const { productRef, isNew } = await findOrCreateProduct(item, session);
        productMap[key] = { productRef, isNew, totalUnitsToAdd: 0 };
      }

      const entry = productMap[key];
      entry.productRef.purchasePrice = Number(item.price);
      const unitsPerPkg = entry.productRef.unitsPerPackage || 1;
      const neededUnits = item.unit_type === "كرتونة"
        ? Number(item.quantity) * unitsPerPkg
        : Number(item.quantity);

      entry.totalUnitsToAdd += neededUnits;

      item.subtotal = Number(item.quantity) * Number(item.price);
      newPurchaseItems.push({
        product: entry.productRef._id,
        productName: item.productName || entry.productRef.productName,
        unit_type: item.unit_type,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
      });
    }

    for (const key in productMap) {
      const { productRef, isNew, totalUnitsToAdd } = productMap[key];

      if (isNew) {
        productRef.availableQuantity =
          productRef.unit_type === "كرتونة"
            ? Math.floor(totalUnitsToAdd / (productRef.unitsPerPackage || 1))
            : totalUnitsToAdd;
        await productRef.save({ session });
      } else {
        productRef.totalUnits += totalUnitsToAdd;
        productRef.availableQuantity =
          productRef.unit_type === "كرتونة"
            ? Math.floor(productRef.totalUnits / (productRef.unitsPerPackage || 1))
            : productRef.totalUnits;
        await productRef.save({ session });
      }
    }

    const totalPrice = newPurchaseItems.reduce((acc, curr) => acc + Number(curr.subtotal), 0);
    const totalDiscount = (totalPrice * Number(discount)) / 100;
    const finalPrice = totalPrice - totalDiscount;

    const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const netPrice = finalPrice - totalPaid;

    supplierDoc.balance += netPrice;
    await supplierDoc.save({ session });

    let status = "unpaid";
    if (netPrice <= 0) status = "paid";
    else if (totalPaid > 0) status = "partPaid";

    // ==========================================
    // 4. UPDATE PURCHASE DOC
    // ==========================================
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      id,
      {
        supplier: SupplierId || oldPurchase.supplier,
        user: userId,
        items: newPurchaseItems,
        totalPrice,
          paidAmount:totalPaid,
        discount,
        finalPrice: Number(finalPrice.toFixed(2)),
        purchaseDate: purchaseDate || oldPurchase.purchaseDate,
        status,
        adminNote: adminNote || "لا يوجد ملاحظات",
      },
      { new: true, session }
    );

    // ==========================================
    // 4.5 AUTO PURCHASE RETURN (لو حصل نقص في الكمية)
    // ==========================================
    if (autoReturnItems.length > 0) {
      const totalReturnAmount = autoReturnItems.reduce((acc, i) => acc + i.subtotal, 0);

      await SalesReturn.create(
        [{
          purchase: updatedPurchase._id,
          supplier: supplierDoc._id,
          user: userId,
          returnDate: purchaseDate || new Date(),
          items: autoReturnItems,
          totalAmount: totalReturnAmount,
          note: "مرتجع مشتريات تلقائي تم إنشاؤه أثناء تعديل الفاتورة",
          type: "purchase",
        }],
        { session }
      );
    }

    // ==========================================
    // 5. CREATE NEW PAYMENTS
    // ==========================================
    for (const p of payments) {
      if (!p.amount || p.amount <= 0) continue;

      let walletInfo = null;
      let bankInfo = null;

      if (p.paymentMethod === "wallet") {
        if (!p.walletInfo?.senderPhone) {
          throw new Error("يجب إرفاق رقم المحفظة المحول منها");
        }
        walletInfo = {
          senderName: p.walletInfo.senderName,
          senderPhone: p.walletInfo.senderPhone,
          receiverName: p.walletInfo.receiverName,
          receiverPhone: p.walletInfo.receiverPhone,
        };
      }

      if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && p.bankInfo) {
        bankInfo = { bankName: p.bankInfo.bankName };
      }

      await PaymentModel.create(
        [{
          customer: null,
          supplier: supplierDoc._id,
          module: "purchase",
          moduleId: updatedPurchase._id,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod,
          moneyFlow: "outgoing",
          walletInfo,
          bankInfo,
          transactionDate: purchaseDate || new Date(),
          createdBy: userId,
          notes: adminNote || "تعديل فاتورة مشتريات",
        }],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم تعديل فاتورة المشتريات بنجاح",
      purchase: updatedPurchase,
      autoReturn: autoReturnItems.length > 0 ? autoReturnItems : null,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء تعديل فاتورة المشتريات",
    });
  }
};

// ============================================================
// delete Purchase
// ============================================================
exports.deletePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("ID فاتورة المشتريات غير صحيح");
    }

    const oldPurchase = await Purchase.findById(id).session(session);
    if (!oldPurchase) {
      throw new Error("فاتورة المشتريات غير موجودة أو تم حذفها بالفعل");
    }

    const supplierDoc = await supplierModel.findById(oldPurchase.supplier).session(session);
    if (!supplierDoc) {
      throw new Error("المورد المرتبط بالفاتورة غير موجود");
    }

    // ROLLBACK STOCK (نطرح الكمية اللي كانت اتضافت)
    for (const oldItem of oldPurchase.items) {
      const productRef = await Product.findById(oldItem.product).session(session);
      if (!productRef) continue;

      const unitsPerPkg = productRef.unitsPerPackage || 1;
      const oldUnits = oldItem.unit_type === "كرتونة"
        ? Number(oldItem.quantity) * unitsPerPkg
        : Number(oldItem.quantity);

      if (productRef.totalUnits < oldUnits) {
        throw new Error(
          `لا يمكن حذف الفاتورة، جزء من كمية المنتج (${productRef.productName}) تم بيعه بالفعل`
        );
      }

      productRef.totalUnits -= oldUnits;
      productRef.availableQuantity =
        productRef.unit_type === "كرتونة"
          ? Math.floor(productRef.totalUnits / unitsPerPkg)
          : productRef.totalUnits;

      await productRef.save({ session });
    }

    const oldPayments = await PaymentModel.find({
      moduleId: id,
      module: "purchase",
    }).session(session);

    const oldTotalPaid = oldPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const oldNetPrice = oldPurchase.finalPrice - oldTotalPaid;

    supplierDoc.balance -= oldNetPrice;
    await supplierDoc.save({ session });

    await PaymentModel.deleteMany({
      moduleId: id,
      module: "purchase",
    }).session(session);

    await SalesReturn.deleteMany({ purchase: id }).session(session);
    await Purchase.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم حذف فاتورة المشتريات وإلغاء كافة تأثيراتها على المخزون والحسابات بنجاح",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء حذف فاتورة المشتريات",
    });
  }
};

// ============================================================
// Get all Purchases (Search & Filters)
// ============================================================
exports.getPurchases = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, status, supplier, startDate, endDate } = req.query;

    let query = {};

    if (status) query.status = status;

    if (supplier && mongoose.Types.ObjectId.isValid(supplier)) {
      query.supplier = supplier;
    }

    if (startDate || endDate) {
      query.purchaseDate = {};
      if (startDate) query.purchaseDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.purchaseDate.$lte = end;
      }
    }

    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const searchConditions = [];

      searchConditions.push({ purchaseNumber: { $regex: searchTerm, $options: "i" } });

      if (mongoose.Types.ObjectId.isValid(searchTerm)) {
        searchConditions.push({ _id: searchTerm });
      }

      const matchingSuppliers = await supplierModel.find({
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { phone: { $regex: searchTerm, $options: "i" } },
        ],
      }).select("_id");

      const supplierIds = matchingSuppliers.map((s) => s._id);
      if (supplierIds.length > 0) {
        searchConditions.push({ supplier: { $in: supplierIds } });
      }

      if (searchConditions.length > 0) {
        query.$or = searchConditions;
      } else {
        query._id = null;
      }
    }

    const totalPurchases = await Purchase.countDocuments(query);

    const purchases = await Purchase.find(query)
      .populate("supplier", "name phone")
      .select("purchaseNumber supplier purchaseDate finalPrice status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalPurchases / limit);

    return res.status(200).json({
      message: "Purchases retrieved successfully",
      pagination: {
        totalPurchases,
        currentPage: page,
        totalPages,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      data: purchases,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "An error occurred while fetching purchases",
    });
  }
};

// ============================================================
// getPurchaseById
// ============================================================
exports.getPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID فاتورة المشتريات غير صحيح" });
    }

    const purchase = await Purchase.findById(id)
      .populate("supplier", "name phone balance")
      .populate("user", "name email")
      .populate("items.product", "productName code purchasePrice unit_type");

    if (!purchase) {
      return res.status(404).json({ message: "فاتورة المشتريات غير موجودة" });
    }

    const payments = await PaymentModel.find({
      moduleId: id,
      module: "purchase",
    }).populate("createdBy", "name");

    const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const remainingAmount = purchase.finalPrice - totalPaid;

    return res.status(200).json({
      message: "تم جلب تفاصيل فاتورة المشتريات بنجاح",
      data: {
        purchase,
        payments,
        summary: {
          totalPrice: purchase.totalPrice,
          discount: purchase.discount,
          finalPrice: purchase.finalPrice,
          totalPaid,
          remainingAmount: Number(remainingAmount.toFixed(2)),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء جلب تفاصيل فاتورة المشتريات",
    });
  }
};

exports.getPurchasesBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.query;

        const {
            fromDate,
            toDate,
            minAmount,
            maxAmount,
            hasRemaining,
            paymentMethod,
        } = req.query;

        // =========================
        // Purchase Filter
        // =========================

        const filter = {
            supplier: supplierId,
        };

        // =========================
        // Date Filter
        // =========================

        if (fromDate || toDate) {
            filter.purchaseDate = {};

            if (fromDate) {
                const from = new Date(fromDate);

                if (!isNaN(from.getTime())) {
                    filter.purchaseDate.$gte = from;
                }
            }

            if (toDate) {
                const to = new Date(toDate);

                if (!isNaN(to.getTime())) {
                    // نهاية اليوم
                    to.setHours(23, 59, 59, 999);
                    filter.purchaseDate.$lte = to;
                }
            }
        }

        // =========================
        // Amount Filter
        // =========================

        if (minAmount !== undefined || maxAmount !== undefined) {
            filter.finalPrice = {};

            if (minAmount !== undefined) {
                filter.finalPrice.$gte = Number(minAmount);
            }

            if (maxAmount !== undefined) {
                filter.finalPrice.$lte = Number(maxAmount);
            }
        }

        // =========================
        // Get Purchases
        // =========================

        let purchases = await Purchase.find(filter)
            .populate("supplier", "name balance phone")
            .populate("user", "username email")
            .populate("items.product", "productName")
            .sort({ purchaseDate: -1 })
            .lean();

        // =========================
        // Purchase IDs
        // =========================

        const purchaseIds = purchases.map(
            purchase => purchase._id
        );

        // =========================
        // Get Payments
        // =========================

        const payments = purchaseIds.length
            ? await PaymentModel.find({
                module: "purchase",
                moduleId: { $in: purchaseIds },
            }).lean()
            : [];

        // =========================
        // Get Returns
        // =========================

        const returns = purchaseIds.length
            ? await SalesReturn.find({
                purchase: { $in: purchaseIds },
            }).lean()
            : [];

        // =========================
        // Group Returns By Purchase
        // =========================

        const returnsMap = new Map();

        for (const returnInvoice of returns) {
            const purchaseId =
                returnInvoice.purchase?.toString();

            if (!purchaseId) continue;

            if (!returnsMap.has(purchaseId)) {
                returnsMap.set(purchaseId, []);
            }

            returnsMap.get(purchaseId).push(returnInvoice);
        }

        // =========================
        // Filter Payments
        // =========================

        const filteredPayments = payments.filter(payment => {
            // أي وسيلة غير الشيك
            if (payment.paymentMethod !== "cheque") {
                return true;
            }

            // الشيك لازم يكون موجود وغير مرتجع أو ملغي
            return (
                payment.cheque &&
                !["returned", "cancelled"].includes(
                    payment.cheque.status
                )
            );
        });

        // =========================
        // Attach Payments + Returns
        // =========================

        purchases = purchases.map(purchase => {

            // -------------------------
            // Payments
            // -------------------------

            const purchasePayments =
                filteredPayments.filter(
                    p =>
                        p.moduleId.toString() ===
                        purchase._id.toString()
                );

            purchase.Payments = purchasePayments;

            purchase.payment = purchasePayments.map(p => ({
                paymentMethod: p.paymentMethod,
                paidAmount: Number(p.amount) || 0,
            }));

            purchase.paidAmount =
                purchase.payment.reduce(
                    (sum, p) =>
                        sum + (Number(p.paidAmount) || 0),
                    0
                );

            purchase.remainingAmount = Math.max(
                0,
                (Number(purchase.finalPrice) || 0) -
                purchase.paidAmount
            );

            // -------------------------
            // Returns
            // -------------------------

            const purchaseReturns =
                returnsMap.get(
                    purchase._id.toString()
                ) || [];

            purchase.returns = purchaseReturns;

            purchase.totalReturned =
                purchaseReturns.reduce(
                    (sum, returnInvoice) =>
                        sum +
                        (Number(returnInvoice.totalAmount) || 0),
                    0
                );

            return purchase;
        });

        // =========================
        // Payment Method Filter
        // =========================

        if (paymentMethod) {
            purchases = purchases.filter(purchase =>
                purchase.payment?.some(
                    p =>
                        p.paymentMethod ===
                        paymentMethod
                )
            );
        }

        // =========================
        // Remaining Filter
        // =========================

        if (hasRemaining === "true") {
            purchases = purchases.filter(
                purchase =>
                    purchase.remainingAmount > 0
            );
        } else if (hasRemaining === "false") {
            purchases = purchases.filter(
                purchase =>
                    purchase.remainingAmount === 0
            );
        }

        // =========================
        // Response
        // =========================

        return res.status(200).json({
            results: purchases.length,
            purchases,
        });

    } catch (err) {
        console.error(
            "getPurchasesBySupplier Error:",
            err
        );

        return res.status(500).json({
            message: err.message,
        });
    }
};


exports.searchPurchase = async (req, res) => {
    try {
        const {
            search,
            page: pageQuery,
            limit: limitQuery
        } = req.query;



        const pipeline = [
            // 1. ربط جدول العملاء أولاً
            {
                $lookup: {
                    from: "suppliers",
                    localField: "supplier",
                    foreignField: "_id",
                    as: "supplier"
                }
            },
            {
                $unwind: {
                    path: "$supplier",
                    preserveNullAndEmptyArrays: true
                }
            }
        ];

        // 2. الفلترة برقم الفاتورة أو اسم العميل بعد الـ lookup
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        {
                            purchaseNumber: {
                                $regex: search,
                                $options: "i"
                            }
                        },
                        {
                            "supplier.name": {
                                $regex: search,
                                $options: "i"
                            }
                        }
                    ]
                }
            });
        }

        // 3. الترتيب والتصفيف (Pagination)
        pipeline.push(
            {
                $sort: {
                    purchaseDate: -1
                }
            },
            {
                $facet: {
 
                    total: [
                        { $count: "count" }
                    ]
                }
            }
        );

        const result = await Purchase.aggregate(pipeline);

        const purchases = result[0]?.data || [];
        const total = result[0]?.total[0]?.count || 0;

        res.status(200).json({
            purchases,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            results: purchases.length
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: error.message
        });
    }
};