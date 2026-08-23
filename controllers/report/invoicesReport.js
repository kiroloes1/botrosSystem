const mongoose = require("mongoose");
const Invoice = require(`${__dirname}/../../models/invoices`);
const Product = require(`${__dirname}/../../models/products`);
const Expense = require(`${__dirname}/../../models/expense`);

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
    const period = req.query.period || "today";
    const { from, to, productId } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const { start, end } = getDateRange(period, from, to);

    const invoiceMatch = { invoiceDate: { $gte: start, $lte: end } };
    const expenseMatch = { expenseDate: { $gte: start, $lte: end } };

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      invoiceMatch["items.product"] = new mongoose.Types.ObjectId(productId);
    }

    // ✅ شرط البحث الموحد للمنتجات
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
      expensesAgg,
      productProfitAgg
    ] = await Promise.all([
      // ------------------------------------------------------
      // 1. إجمالي المبيعات
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
      // 2. إجمالي تكلفة البضاعة المباعة
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
        // ✅ إضافة شرط البحث هنا أيضاً
        ...(search ? [{ $match: productSearchMatch }] : []),
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
      // 3. المنتجات الأكثر مبيعاً (مع Search)
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
        // ✅ تطبيق شرط البحث هنا (تم نقله إلى هنا)
        ...(search ? [{ $match: productSearchMatch }] : []),
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
      // 4. إجمالي المصاريف
      // ------------------------------------------------------
      Expense.aggregate([
        { $match: expenseMatch },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: "$totalAmount" },
          },
        },
      ]),

      // ------------------------------------------------------
      // 5. ربح كل منتج على حدة (مع Search) ✅ تم الإصلاح
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
        // ✅ ✅ ✅ إضافة شرط البحث هنا (الجزء المفقود)
        ...(search ? [{ $match: productSearchMatch }] : []),
        {
          $addFields: {
            lineCost: {
              $multiply: ["$items.quantity", { $ifNull: ["$productInfo.purchasePrice", 0] }]
            },
            lineProfit: {
              $subtract: [
                "$items.subtotal",
                {
                  $multiply: ["$items.quantity", { $ifNull: ["$productInfo.purchasePrice", 0] }]
                }
              ]
            }
          }
        },
        {
          $group: {
            _id: "$items.product",
            productName: { $first: "$items.productName" },
            code: { $first: "$productInfo.code" },
            category: { $first: "$productInfo.category" },
            totalQuantitySold: { $sum: "$items.quantity" },
            totalRevenue: { $sum: "$items.subtotal" },
            totalCost: { $sum: "$lineCost" },
            totalProfit: { $sum: "$lineProfit" },
            timesSold: { $sum: 1 },
            totalQuantityForAvg: { $sum: "$items.quantity" },
            totalRevenueForAvg: { $sum: "$items.subtotal" }
          }
        },
        {
          $addFields: {
            averageSellingPrice: {
              $cond: [
                { $eq: ["$totalQuantityForAvg", 0] },
                0,
                { $divide: ["$totalRevenueForAvg", "$totalQuantityForAvg"] }
              ]
            },
            profitMargin: {
              $cond: [
                { $eq: ["$totalRevenue", 0] },
                0,
                { $multiply: [{ $divide: ["$totalProfit", "$totalRevenue"] }, 100] }
              ]
            }
          }
        },
        {
          $project: {
            totalQuantityForAvg: 0,
            totalRevenueForAvg: 0
          }
        },
        { $sort: { totalProfit: -1 } },
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
                  category: 1,
                  totalQuantitySold: 1,
                  totalRevenue: 1,
                  totalCost: 1,
                  totalProfit: 1,
                  profitMargin: { $round: ["$profitMargin", 1] },
                  averageSellingPrice: { $round: ["$averageSellingPrice", 2] },
                  timesSold: 1
                }
              }
            ]
          }
        }
      ])
    ]);

    // ============================================================
    // استخراج النتائج
    // ============================================================

    const salesSummary = salesSummaryAgg[0] || { invoicesCount: 0, totalPrice: 0, finalPrice: 0 };
    const totalCost = profitAgg[0]?.totalCost || 0;
    const totalExpenses = expensesAgg[0]?.totalExpenses || 0;

    const netProfit = Number((salesSummary.finalPrice - totalCost - totalExpenses).toFixed(2));
    const profitMargin =
      salesSummary.finalPrice > 0
        ? Number(((netProfit / salesSummary.finalPrice) * 100).toFixed(1))
        : 0;

    const topSellingCount = topSellingAgg[0]?.metadata[0]?.total || 0;
    const topSellingProducts = topSellingAgg[0]?.data || [];

    const productProfitData = productProfitAgg[0] || { metadata: [{ total: 0 }], data: [] };
    const productProfitCount = productProfitData.metadata[0]?.total || 0;
    const productProfitItems = productProfitData.data || [];

    return res.status(200).json({
      success: true,
      period: {
        type: period,
        from: start,
        to: end
      },
      pagination: {
        page,
        limit,
        topSellingTotalPages: Math.ceil(topSellingCount / limit) || 1,
        productProfitTotalPages: Math.ceil(productProfitCount / limit) || 1,
      },
      sales: {
        invoicesCount: salesSummary.invoicesCount,
        totalPrice: salesSummary.totalPrice,
        totalDiscount: Number((salesSummary.totalPrice - salesSummary.finalPrice).toFixed(2)),
        finalPrice: salesSummary.finalPrice,
      },
      profit: {
        totalCost,
        totalExpenses,
        netProfit,
        profitMargin,
      },
      topSellingProducts: {
        totalItems: topSellingCount,
        items: topSellingProducts,
      },
      productProfit: {
        totalItems: productProfitCount,
        items: productProfitItems,
      },
    });

  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء إنشاء تقرير المبيعات",
    });
  }
};