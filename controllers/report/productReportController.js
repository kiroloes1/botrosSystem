const mongoose = require("mongoose");
const Product = require(`${__dirname}/../../models/products`);
const Purchase = require(`${__dirname}/../../models/purchase`);
const Invoice = require(`${__dirname}/../../models/invoices`);
const SalesReturn = require(`${__dirname}/../../models/return`);

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
      const dayOfWeek = now.getDay();
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

// 1. تقرير قيمة المخزون
exports.getStockValuationReport = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const searchMatch = search
      ? {
          $or: [
            { category: { $regex: search, $options: "i" } },
            { productName: { $regex: search, $options: "i" } },
            { code: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [overallAgg] = await Product.aggregate([
      { $match: searchMatch },
      {
        $addFields: {
          sellingPriceForUnit: {
            $cond: [{ $eq: ["$unit_type", "كرتونة"] }, "$packageSellingPrice", "$pieceSellingPrice"],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalAvailableQuantity: { $sum: "$availableQuantity" },
          totalStockUnits: { $sum: "$totalUnits" },
          totalCostValue: { $sum: { $multiply: ["$availableQuantity", "$purchasePrice"] } },
          totalSellingValue: { $sum: { $multiply: ["$availableQuantity", "$sellingPriceForUnit"] } },
        },
      },
    ]);

    const categoriesCountAgg = await Product.aggregate([
      { $match: searchMatch },
      { $group: { _id: { $ifNull: ["$category", "غير مصنّف"] } } },
      { $count: "total" },
    ]);
    const totalCategories = categoriesCountAgg[0]?.total || 0;

    const byCategory = await Product.aggregate([
      { $match: searchMatch },
      {
        $addFields: {
          sellingPriceForUnit: {
            $cond: [{ $eq: ["$unit_type", "كرتونة"] }, "$packageSellingPrice", "$pieceSellingPrice"],
          },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$category", "غير مصنّف"] },
          productsCount: { $sum: 1 },
          totalAvailableQuantity: { $sum: "$availableQuantity" },
          costValue: { $sum: { $multiply: ["$availableQuantity", "$purchasePrice"] } },
          sellingValue: { $sum: { $multiply: ["$availableQuantity", "$sellingPriceForUnit"] } },
        },
      },
      { $sort: { sellingValue: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          category: "$_id",
          productsCount: 1,
          totalAvailableQuantity: 1,
          costValue: 1,
          sellingValue: 1,
          potentialProfit: { $subtract: ["$sellingValue", "$costValue"] },
        },
      },
    ]);

    const overall = overallAgg || {
      totalProducts: 0,
      totalAvailableQuantity: 0,
      totalStockUnits: 0,
      totalCostValue: 0,
      totalSellingValue: 0,
    };

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems: totalCategories,
        page,
        limit,
        totalPages: Math.ceil(totalCategories / limit) || 1,
      },
      overall: {
        ...overall,
        potentialProfit: Number((overall.totalSellingValue - overall.totalCostValue).toFixed(2)),
      },
      byCategory,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب تقرير قيمة المخزون",
    });
  }
};

// 2. تقرير حركة المنتجات
exports.getProductMovementReport = async (req, res) => {
  try {
    const period = req.query.period || "today";
    const { from, to } = req.query;
    const { start, end } = getDateRange(period, from, to);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const searchRegex = new RegExp(search, "i");

    const groupByProductUnit = (extraGroup = {}) => [
      {
        $group: {
          _id: { product: "$items.product", unit_type: "$items.unit_type" },
          productName: { $first: "$items.productName" },
          ...extraGroup,
        },
      },
    ];

    const [purchased, sold, purchaseReturned, salesReturned] = await Promise.all([
      Purchase.aggregate([
        { $match: { purchaseDate: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        ...groupByProductUnit({ qty: { $sum: "$items.quantity" }, amount: { $sum: "$items.subtotal" } }),
      ]),

      Invoice.aggregate([
        { $match: { invoiceDate: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        ...groupByProductUnit({ qty: { $sum: "$items.quantity" }, amount: { $sum: "$items.subtotal" } }),
      ]),

      SalesReturn.aggregate([
        { $match: { type: "purchase", returnDate: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: { product: "$items.product", unit_type: "$items.unit_type" },
            productName: { $first: "$items.productName" },
            qty: { $sum: "$items.returnQuantity" },
            amount: { $sum: "$items.subtotal" },
          },
        },
      ]),

      SalesReturn.aggregate([
        { $match: { type: "invoice", returnDate: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: { product: "$items.product", unit_type: "$items.unit_type" },
            productName: { $first: "$items.productName" },
            qty: { $sum: "$items.returnQuantity" },
            amount: { $sum: "$items.subtotal" },
          },
        },
      ]),
    ]);

    const key = (row) => `${row._id.product}_${row._id.unit_type}`;
    const merged = {};

    const upsert = (row, field) => {
      const k = key(row);
      if (!merged[k]) {
        merged[k] = {
          product: row._id.product,
          productName: row.productName || "",
          unit_type: row._id.unit_type,
          purchasedQty: 0,
          soldQty: 0,
          purchaseReturnedQty: 0,
          salesReturnedQty: 0,
        };
      }
      merged[k][field] = row.qty;
    };

    purchased.forEach((r) => upsert(r, "purchasedQty"));
    sold.forEach((r) => upsert(r, "soldQty"));
    purchaseReturned.forEach((r) => upsert(r, "purchaseReturnedQty"));
    salesReturned.forEach((r) => upsert(r, "salesReturnedQty"));

    let allMovements = Object.values(merged).map((row) => ({
      ...row,
      netChange: row.purchasedQty + row.salesReturnedQty - row.soldQty - row.purchaseReturnedQty,
    }));

    if (search) {
      allMovements = allMovements.filter((item) => searchRegex.test(item.productName));
    }

    allMovements.sort((a, b) => b.soldQty - a.soldQty);

    const totalItems = allMovements.length;
    const paginatedMovement = allMovements.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      period: { type: period, from: start, to: end },
      pagination: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
      movement: paginatedMovement,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب تقرير حركة المنتجات",
    });
  }
};

// 3. تقرير انتهاء الصلاحية
exports.getExpiryReport = async (req, res) => {
  try {
    const nearExpiryDays = parseInt(req.query.nearExpiryDays) || 30;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const now = new Date();
    const nearExpiryDate = new Date(now.getTime() + nearExpiryDays * 24 * 60 * 60 * 1000);

    const searchQuery = search
      ? {
          $or: [
            { productName: { $regex: search, $options: "i" } },
            { code: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const expiredMatch = { expiration: { $lt: now }, ...searchQuery };
    const nearExpiryMatch = { expiration: { $gte: now, $lte: nearExpiryDate }, ...searchQuery };

    const [expiredCount, nearExpiryCount, expired, nearExpiry] = await Promise.all([
      Product.countDocuments(expiredMatch),
      Product.countDocuments(nearExpiryMatch),

      Product.find(expiredMatch)
        .select("code productName category unit_type availableQuantity expiration")
        .sort({ expiration: 1 })
        .skip(skip)
        .limit(limit),

      Product.find(nearExpiryMatch)
        .select("code productName category unit_type availableQuantity expiration")
        .sort({ expiration: 1 })
        .skip(skip)
        .limit(limit),
    ]);

    const withDaysLeft = (list) =>
      list.map((p) => ({
        _id: p._id,
        code: p.code,
        productName: p.productName,
        category: p.category,
        unit_type: p.unit_type,
        availableQuantity: p.availableQuantity,
        expiration: p.expiration,
        daysLeft: Math.ceil((new Date(p.expiration) - now) / (24 * 60 * 60 * 1000)),
      }));

    return res.status(200).json({
      success: true,
      nearExpiryDays,
      expiredPagination: {
        totalItems: expiredCount,
        page,
        limit,
        totalPages: Math.ceil(expiredCount / limit) || 1,
      },
      nearExpiryPagination: {
        totalItems: nearExpiryCount,
        page,
        limit,
        totalPages: Math.ceil(nearExpiryCount / limit) || 1,
      },
      expiredCount,
      expired: withDaysLeft(expired),
      nearExpiryCount,
      nearExpiry: withDaysLeft(nearExpiry),
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب تقرير انتهاء الصلاحية",
    });
  }
};

// 4. تقرير نقص المخزون
exports.getLowStockReport = async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 5;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const matchQuery = {
      availableQuantity: { $lte: threshold },
      ...(search && {
        $or: [
          { productName: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const totalCount = await Product.countDocuments(matchQuery);

    const products = await Product.find(matchQuery)
      .select("code productName category unit_type availableQuantity totalUnits status")
      .sort({ availableQuantity: 1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      threshold,
      pagination: {
        totalItems: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      count: totalCount,
      products,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب تقرير نقص المخزون",
    });
  }
};