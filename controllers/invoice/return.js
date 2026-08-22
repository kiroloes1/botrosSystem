const mongoose = require("mongoose");
const SalesReturn = require(`${__dirname}/../../models/return`);
const customerModel = require(`${__dirname}/../../models/people/customer`);
const supplierModel = require(`${__dirname}/../../models/people/supplier`);
const Product = require(`${__dirname}/../../models/products`);

// ============================================================
// Helper: يرجّع تأثير مرتجع على المخزون/الرصيد وقت حذفه
// ============================================================
async function reverseReturnEffects(salesReturn, session) {

  if (salesReturn.type === "purchase") return;


  // نظبط الدالة دي بعد ما تتأكد منها.*
  for (const item of salesReturn.items) {
    const productRef = await Product.findById(item.product).session(session);
    if (!productRef) continue;

    const unitsPerPkg = productRef.unitsPerPackage || 1;
    const returnedUnits = item.unit_type === "كرتونة"
      ? Number(item.returnQuantity) * unitsPerPkg
      : Number(item.returnQuantity);

    if (productRef.totalUnits < returnedUnits) {
      throw new Error(
        `لا يمكن حذف المرتجع، جزء من كمية المنتج (${productRef.productName}) تم بيعه أو صرفه بالفعل`
      );
    }

    productRef.totalUnits -= returnedUnits;
    productRef.availableQuantity =
      productRef.unit_type === "كرتونة"
        ? Math.floor(productRef.totalUnits / unitsPerPkg)
        : productRef.totalUnits;

    await productRef.save({ session });
  }

  if (salesReturn.customer) {
    const customerDoc = await customerModel.findById(salesReturn.customer).session(session);
    if (customerDoc) {
      customerDoc.balance += Number(salesReturn.totalAmount) || 0;
      await customerDoc.save({ session });
    }
  }
}

// ==========================================
// Get All Sales Returns (Search & Filters)
// بيدعم النوعين: مرتجع فاتورة بيع (invoice/customer) ومرتجع مشتريات (purchase/supplier)
// ==========================================
exports.getReturns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, status, type, customer, supplier, invoice, purchase, startDate, endDate } = req.query;

    let query = {};

    // فلترة بالحالة (completed / cancelled)
    if (status) {
      query.status = status;
    }

    // فلترة بنوع المرتجع (invoice / purchase)
    if (type) {
      query.type = type;
    }

    // فلترة بالعميل
    if (customer && mongoose.Types.ObjectId.isValid(customer)) {
      query.customer = customer;
    }

    // فلترة بالمورد
    if (supplier && mongoose.Types.ObjectId.isValid(supplier)) {
      query.supplier = supplier;
    }

    // فلترة بفاتورة البيع
    if (invoice && mongoose.Types.ObjectId.isValid(invoice)) {
      query.invoice = invoice;
    }

    // فلترة بفاتورة الشراء
    if (purchase && mongoose.Types.ObjectId.isValid(purchase)) {
      query.purchase = purchase;
    }

    // فلترة بالتاريخ
    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) {
        query.returnDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.returnDate.$lte = end;
      }
    }

    // بحث برقم المرتجع، ID، فاتورة البيع/الشراء، أو اسم/رقم هاتف العميل أو المورد
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const searchConditions = [];

      searchConditions.push({ returnNumber: { $regex: searchTerm, $options: "i" } });

      if (mongoose.Types.ObjectId.isValid(searchTerm)) {
        searchConditions.push({ _id: searchTerm });
        searchConditions.push({ invoice: searchTerm });
        searchConditions.push({ purchase: searchTerm });
      }

      const matchingCustomers = await customerModel.find({
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { phone: { $regex: searchTerm, $options: "i" } },
        ],
      }).select("_id");

      const customerIds = matchingCustomers.map((c) => c._id);
      if (customerIds.length > 0) {
        searchConditions.push({ customer: { $in: customerIds } });
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

    const totalReturns = await SalesReturn.countDocuments(query);

    const returns = await SalesReturn.find(query)
      .populate("customer", "name phone")
      .populate("supplier", "name phone")
      .populate("invoice", "invoiceNumber")
      .populate("purchase", "purchaseNumber")
      .select("returnNumber type invoice purchase customer supplier returnDate totalAmount status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalReturns / limit);

    return res.status(200).json({
      message: "تم جلب المرتجعات بنجاح",
      pagination: {
        totalReturns,
        currentPage: page,
        totalPages,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      data: returns,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء جلب المرتجعات",
    });
  }
};

// ==========================================
// Get Sales Return By ID
// ==========================================
exports.getReturnById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID المرتجع غير صحيح" });
    }

    const salesReturn = await SalesReturn.findById(id)
      .populate("customer", "name phone balance")
      .populate("supplier", "name phone balance")
      .populate("user", "username email")
      .populate("invoice", "invoiceNumber invoiceDate finalPrice")
      .populate("purchase", "purchaseNumber purchaseDate finalPrice")
      .populate("items.product", "productName code unit_type");

    if (!salesReturn) {
      return res.status(404).json({ message: "المرتجع غير موجود" });
    }

    return res.status(200).json({
      message: "تم جلب تفاصيل المرتجع بنجاح",
      data: salesReturn,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء جلب تفاصيل المرتجع",
    });
  }
};

// ==========================================
// Delete Sales Return
// بيرجع تأثير المرتجع (لو مرتجع فاتورة بيع) على المخزون ورصيد العميل
// قبل ما يمسح السجل، جوه transaction عشان يفضل كل حاجة متسقة
// ==========================================
exports.deleteReturn = async (req, res) => {
  let session = null;
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID المرتجع غير صحيح" });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const salesReturn = await SalesReturn.findById(id).session(session);
    if (!salesReturn) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "المرتجع غير موجود أو تم حذفه بالفعل" });
    }

    await reverseReturnEffects(salesReturn, session);

    await SalesReturn.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم حذف المرتجع وإلغاء تأثيره على المخزون/الرصيد بنجاح",
    });
  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    return res.status(400).json({
      message: err.message || "حدث خطأ أثناء حذف المرتجع",
    });
  }
};
