const mongoose = require("mongoose");
const Product = require(`${__dirname}/../../models/products`);
const Purchase = require(`${__dirname}/../../models/purchase`);
const SalesReturn = require(`${__dirname}/../../models/return`);
const customerModel = require(`${__dirname}/../../models/people/customer`);
const supplierModel = require(`${__dirname}/../../models/people/supplier`);
const Invoice = require(`${__dirname}/../../models/invoices`);


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
      // من غير فلتر فترة -> كل الأوقات
      start = new Date(0);
      end = new Date(8640000000000000);
    }
  }

  return { start, end };
}


async function getCustomersBalanceStats() {
  const [agg] = await customerModel.aggregate([
    {
      $group: {
        _id: null,
        oweUsCount: { $sum: { $cond: [{ $gt: ["$balance", 0] }, 1, 0] } },
        oweUsAmount: { $sum: { $cond: [{ $gt: ["$balance", 0] }, "$balance", 0] } },
        weOweCount: { $sum: { $cond: [{ $lt: ["$balance", 0] }, 1, 0] } },
        weOweAmount: { $sum: { $cond: [{ $lt: ["$balance", 0] }, { $abs: "$balance" }, 0] } },
      },
    },
  ]);

  return {
    // عملاء عليهم فلوس لينا
    oweUsCount: agg?.oweUsCount || 0,
    oweUsAmount: agg?.oweUsAmount || 0,
    // عملاء لهم فلوس عندنا
    weOweCount: agg?.weOweCount || 0,
    weOweAmount: agg?.weOweAmount || 0,
  };
}


async function getSuppliersBalanceStats() {
  const [agg] = await supplierModel.aggregate([
    {
      $group: {
        _id: null,
        weOweCount: { $sum: { $cond: [{ $gt: ["$balance", 0] }, 1, 0] } },
        weOweAmount: { $sum: { $cond: [{ $gt: ["$balance", 0] }, "$balance", 0] } },
        oweUsCount: { $sum: { $cond: [{ $lt: ["$balance", 0] }, 1, 0] } },
        oweUsAmount: { $sum: { $cond: [{ $lt: ["$balance", 0] }, { $abs: "$balance" }, 0] } },
      },
    },
  ]);

  return {
    // موردين لينا عليهم فلوس (إحنا مديونين لهم)
    weOweCount: agg?.weOweCount || 0,
    weOweAmount: agg?.weOweAmount || 0,
    // موردين عليهم لينا (نادر)
    oweUsCount: agg?.oweUsCount || 0,
    oweUsAmount: agg?.oweUsAmount || 0,
  };
}

async function getProductsStats(nearExpiryDays) {
  const now = new Date();
  const nearExpiryDate = new Date(now.getTime() + nearExpiryDays * 24 * 60 * 60 * 1000);

  const totalProducts = await Product.countDocuments();

  const [stockAgg] = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalAvailableQuantity: { $sum: "$availableQuantity" },
        totalStockUnits: { $sum: "$totalUnits" },
      },
    },
  ]);

  const outOfStockCount = await Product.countDocuments({
    $or: [{ status: "out-of-stock" }, { availableQuantity: { $lte: 0 } }],
  });

  const expiredCount = await Product.countDocuments({ expiration: { $lt: now } });

  const nearExpiryCount = await Product.countDocuments({
    expiration: { $gte: now, $lte: nearExpiryDate },
  });

  const nearExpiryPercentage = totalProducts > 0
    ? Number(((nearExpiryCount / totalProducts) * 100).toFixed(1))
    : 0;

  return {
    totalProducts,
    totalAvailableQuantity: stockAgg?.totalAvailableQuantity || 0,
    totalStockUnits: stockAgg?.totalStockUnits || 0,
    outOfStockCount,
    expiredCount,
    nearExpiryDays,
    nearExpiryCount,
    nearExpiryPercentage,
  };
}


exports.getDashboard = async (req, res) => {
  try {
    const period = req.query.period || "today"; // today | week | month | custom
    const { from, to } = req.query;
    const nearExpiryDays = parseInt(req.query.nearExpiryDays) || 30;

    const { start, end } = getDateRange(period, from, to);

    const [
      customers,
      suppliers,
      products,
      purchasesAgg,
      invoicesAgg,
      returnsAgg,
    ] = await Promise.all([
      getCustomersBalanceStats(),
      getSuppliersBalanceStats(),
      getProductsStats(nearExpiryDays),

      Purchase.aggregate([
        { $match: { purchaseDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$finalPrice" } } },
      ]),

      Invoice.aggregate([
        { $match: { invoiceDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$finalPrice" } } },
      ]),

      SalesReturn.aggregate([
        { $match: { returnDate: { $gte: start, $lte: end } } },
        { $group: { _id: "$type", count: { $sum: 1 }, totalAmount: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const purchases = {
      count: purchasesAgg[0]?.count || 0,
      totalAmount: purchasesAgg[0]?.totalAmount || 0,
    };

    const invoices = {
      count: invoicesAgg[0]?.count || 0,
      totalAmount: invoicesAgg[0]?.totalAmount || 0,
    };

    const invoiceReturns = returnsAgg.find((r) => r._id === "invoice");
    const purchaseReturns = returnsAgg.find((r) => r._id === "purchase");

    const returns = {
      count: returnsAgg.reduce((acc, r) => acc + r.count, 0),
      invoiceReturnsCount: invoiceReturns?.count || 0,
      invoiceReturnsAmount: invoiceReturns?.totalAmount || 0,
      purchaseReturnsCount: purchaseReturns?.count || 0,
      purchaseReturnsAmount: purchaseReturns?.totalAmount || 0,
    };

    return res.status(200).json({
      success: true,
      period: { type: period, from: start, to: end },
      customers,
      suppliers,
      purchases,
      invoices,
      returns,
      products,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب بيانات لوحة التحكم",
    });
  }
};
