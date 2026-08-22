const mongoose = require("mongoose");
const Invoice = require(`${__dirname}/../../models/invoices`);
const SalesReturn = require(`${__dirname}/../../models/return`);
const Product = require(`${__dirname}/../../models/products`);

// ============================================================

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

exports.getSalesReport = async (req, res) => {
  try {
    const period = req.query.period || "today"; // today | week | month | custom
    const { from, to, productId } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const { start, end } = getDateRange(period, from, to);

    // بناء شروط الفلترة بالفواتير المباشرة
    const invoiceMatch = { invoiceDate: { $gte: start, $lte: end } };
    const salesReturnMatch = { type: "invoice", returnDate: { $gte: start, $lte: end } };

    // فلترة بناءً على ID منتج معين إذا تم إرساله
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      invoiceMatch["items.product"] = new mongoose.Types.ObjectId(productId);
      salesReturnMatch["items.product"] = new mongoose.Types.ObjectId(productId);
    }

    // بناء شرط البحث بالاسم أو الكود للمنتجات
    const productSearchMatch = search
      ? {
          $or: [
            { "items.productName": { $regex: search, $options: "i" } },
            { "productInfo.code": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [
      salesSummaryAgg,
      profitAgg,
      topSellingAgg,
      returnsSummaryAgg,
      topReturnedAgg,
    ] = await Promise.all([
      // ------------------------------------------------------
      // 1. إجمالي المبيعات (عدد الفواتير والمبالغ)
      // ------------------------------------------------------
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: null,
            invoicesCount: { $sum: 1 },
            totalPrice: { $sum: "$totalPrice" },
            finalPrice: { $sum: "$finalPrice" },
          },
        },
      ]),

      // ------------------------------------------------------
      // 2. إجمالي تكلفة البضاعة المباعة لحساب الأرباح
      // ------------------------------------------------------
      Invoice.aggregate([
        { $match: invoiceMatch },
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
        {
          $addFields: {
            lineCost: {
              $multiply: ["$items.quantity", { $ifNull: ["$productInfo.purchasePrice", 0] }],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalCost: { $sum: "$lineCost" },
          },
        },
      ]),

      // ------------------------------------------------------
      // 3. المنتجات الأكثر مبيعاً (مع Search و Pagination)
      // ------------------------------------------------------
      Invoice.aggregate([
        { $match: invoiceMatch },
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
            totalRevenue: { $sum: "$items.subtotal" },
            timesSold: { $sum: 1 },
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
                  totalRevenue: 1,
                  timesSold: 1,
                },
              },
            ],
          },
        },
      ]),

      // ------------------------------------------------------
      // 4. إجمالي مرتجعات الفواتير
      // ------------------------------------------------------
      SalesReturn.aggregate([
        { $match: salesReturnMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),

      // ------------------------------------------------------
      // 5. المنتجات الأكثر إرجاعاً (مع Search و Pagination)
      // ------------------------------------------------------
      SalesReturn.aggregate([
        { $match: salesReturnMatch },
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
            totalReturnQuantity: { $sum: "$items.returnQuantity" },
            totalReturnAmount: { $sum: "$items.subtotal" },
            timesReturned: { $sum: 1 },
          },
        },
        { $sort: { totalReturnQuantity: -1 } },
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
                  totalReturnQuantity: 1,
                  totalReturnAmount: 1,
                  timesReturned: 1,
                },
              },
            ],
          },
        },
      ]),
    ]);

    const salesSummary = salesSummaryAgg[0] || { invoicesCount: 0, totalPrice: 0, finalPrice: 0 };
    const totalCost = profitAgg[0]?.totalCost || 0;

    const netProfit = Number((salesSummary.finalPrice - totalCost).toFixed(2));
    const profitMargin =
      salesSummary.finalPrice > 0
        ? Number(((netProfit / salesSummary.finalPrice) * 100).toFixed(1))
        : 0;

    const returnsSummary = returnsSummaryAgg[0] || { count: 0, totalAmount: 0 };

    // استخراج بيانات الترقيم لقائمة الأكثر مبيعاً
    const topSellingCount = topSellingAgg[0]?.metadata[0]?.total || 0;
    const topSellingProducts = topSellingAgg[0]?.data || [];

    // استخراج بيانات الترقيم لقائمة الأكثر إرجاعاً
    const topReturnedCount = topReturnedAgg[0]?.metadata[0]?.total || 0;
    const topReturnedProducts = topReturnedAgg[0]?.data || [];

    return res.status(200).json({
      success: true,
      period: { type: period, from: start, to: end },
      pagination: {
        page,
        limit,
        topSellingTotalPages: Math.ceil(topSellingCount / limit) || 1,
        topReturnedTotalPages: Math.ceil(topReturnedCount / limit) || 1,
      },
      sales: {
        invoicesCount: salesSummary.invoicesCount,
        totalPrice: salesSummary.totalPrice,
        totalDiscount: Number((salesSummary.totalPrice - salesSummary.finalPrice).toFixed(2)),
        finalPrice: salesSummary.finalPrice,
        netSalesAfterReturns: Number((salesSummary.finalPrice - returnsSummary.totalAmount).toFixed(2)),
      },
      profit: {
        totalCost,
        netProfit,
        profitMargin,
      },
      returns: {
        count: returnsSummary.count,
        totalAmount: returnsSummary.totalAmount,
        returnRate:
          salesSummary.invoicesCount > 0
            ? Number(((returnsSummary.count / salesSummary.invoicesCount) * 100).toFixed(1))
            : 0,
      },
      topSellingProducts: {
        totalItems: topSellingCount,
        items: topSellingProducts,
      },
      topReturnedProducts: {
        totalItems: topReturnedCount,
        items: topReturnedProducts,
      },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء إنشاء تقرير المبيعات",
    });
  }
};