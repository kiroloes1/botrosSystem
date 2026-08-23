const mongoose = require("mongoose");
const Invoice = require(`${__dirname}/../../models/invoices`);
const Purchase = require(`${__dirname}/../../models/purchase`);
const Product = require(`${__dirname}/../../models/products`);
const PaymentModel = require(`${__dirname}/../../models/payment`);

const PURCHASE_PAYMENT_MODULES = ["purchases", "purchase"];

function getDateRange(period, from, to) {
  const now = new Date();
  let start, end;

  switch (period) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case "week": {
      const dayOfWeek = now.getDay(); // 0 = الأحد
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case "month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case "custom": {
      if (!from || !to) {
        throw new Error("يجب إرسال تاريخ البداية والنهاية (from, to) لفترة مخصصة");
      }
      start = new Date(from);
      start.setHours(0, 0, 0, 0);
      end = new Date(to);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default: {
      start = new Date(0);
      end = new Date(8640000000000000);
    }
  }

  return { start, end };
}

exports.getPurchasesReport = async (req, res) => {
  try {
    const period = req.query.period || "today"; // today | week | month | custom
    const { from, to, productId } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const { start, end } = getDateRange(period, from, to);

    // شروط الفلترة الأساسية للفواتير
    const purchaseMatch = { purchaseDate: { $gte: start, $lte: end } };

    // فلترة بناءً على ID منتج معين إذا تم إرساله
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      purchaseMatch["items.product"] = new mongoose.Types.ObjectId(productId);
    }

    // شرط البحث برمز أو اسم المنتج
    const productSearchMatch = search
      ? {
          $or: [
            { "items.productName": { $regex: search, $options: "i" } },
            { "productInfo.code": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [purchasesSummaryAgg, topPurchasedAgg, paymentsAgg] = await Promise.all([
      // ------------------------------------------------------
      // 1. إجمالي المشتريات (عدد الفواتير، المجموع قبل وبعد الخصم)
      // ------------------------------------------------------
      Purchase.aggregate([
        { $match: purchaseMatch },
        {
          $group: {
            _id: null,
            purchasesCount: { $sum: 1 },
            totalPrice: { $sum: "$totalPrice" },
            finalPrice: { $sum: "$finalPrice" },
          },
        },
      ]),

      // ------------------------------------------------------
      // 2. المنتجات الأكثر شراءً (مع Search و Pagination)
      // ------------------------------------------------------
      Purchase.aggregate([
        { $match: purchaseMatch },
        { $unwind: "$items" },
        ...(productId && mongoose.Types.ObjectId.isValid(productId)
          ? [{ $match: { "items.product": new mongoose.Types.ObjectId(productId) } }]
          : []),
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
        { $match: productSearchMatch },
        {
          $group: {
            _id: "$items.product",
            productName: { $first: "$items.productName" },
            code: { $first: "$productInfo.code" },
            totalQuantity: { $sum: "$items.quantity" },
            totalCost: { $sum: "$items.subtotal" },
            timesPurchased: { $sum: 1 },
          },
        },
        { $sort: { totalQuantity: -1 } },
        {
          $facet: {
            metadata: [{ $count: "total" }],
            data: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  product: "$_id",
                  productName: 1,
                  code: 1,
                  totalQuantity: 1,
                  totalCost: 1,
                  timesPurchased: 1,
                },
              },
            ],
          },
        },
      ]),

      // ------------------------------------------------------
      // 3. المدفوعات الفعلية للموردين
      // ------------------------------------------------------
      PaymentModel.aggregate([
        {
          $match: {
            module: { $in: PURCHASE_PAYMENT_MODULES },
            moneyFlow: "outgoing",
            transactionDate: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: "$paymentMethod",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const purchasesSummary = purchasesSummaryAgg[0] || { purchasesCount: 0, totalPrice: 0, finalPrice: 0 };

    const totalPaid = paymentsAgg.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const paymentsByMethod = paymentsAgg.map((p) => ({
      method: p._id,
      count: p.count,
      totalAmount: p.totalAmount,
    }));

    // استخراج بيانات الترقيم لقائمة الأكثر شراءً
    const topPurchasedCount = topPurchasedAgg[0]?.metadata[0]?.total || 0;
    const topPurchasedProducts = topPurchasedAgg[0]?.data || [];

    return res.status(200).json({
      success: true,
      period: { type: period, from: start, to: end },
      pagination: {
        page,
        limit,
        topPurchasedTotalPages: Math.ceil(topPurchasedCount / limit) || 1,
      },
      purchases: {
        purchasesCount: purchasesSummary.purchasesCount,
        totalPrice: purchasesSummary.totalPrice,
        totalDiscount: Number((purchasesSummary.totalPrice - purchasesSummary.finalPrice).toFixed(2)),
        finalPrice: purchasesSummary.finalPrice,
      },
      payments: {
        totalPaid,
        byMethod: paymentsByMethod,
      },
      topPurchasedProducts: {
        totalItems: topPurchasedCount,
        items: topPurchasedProducts,
      },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء إنشاء تقرير المشتريات",
    });
  }
};
