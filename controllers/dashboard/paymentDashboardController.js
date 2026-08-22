const mongoose = require("mongoose");
const PaymentModel = require(`${__dirname}/../../models/payment`);

// ============================================================
// Helper: يحسب بداية ونهاية الفترة المطلوبة (يومي / أسبوعي / شهري / مخصص)
// نفس الهيلبر المستخدم في dashboardController و reportController
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


exports.getPaymentsDashboard = async (req, res) => {
  try {
    const period = req.query.period || "today"; // today | week | month | custom
    const { from, to } = req.query;

    const { start, end } = getDateRange(period, from, to);
    const dateMatch = { transactionDate: { $gte: start, $lte: end } };

    const [summaryAgg, byMethodAgg, byModuleAgg, dailyTrendAgg] = await Promise.all([
      // ------------------------------------------------------
      // الإجمالي العام: وارد ومنصرف وصافي التدفق النقدي
      // ------------------------------------------------------
      PaymentModel.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: "$moneyFlow",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),

      // ------------------------------------------------------
      // التفصيل حسب طريقة الدفع (كاش / محفظة / إنستاباي / آجل)
      // ------------------------------------------------------
      PaymentModel.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: { method: "$paymentMethod", flow: "$moneyFlow" },
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),

      // ------------------------------------------------------
      // التفصيل حسب نوع العملية (pay / debt / invoices / purchase..)
      // ------------------------------------------------------
      PaymentModel.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: { module: "$module", flow: "$moneyFlow" },
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),

      // ------------------------------------------------------
      // الحركة اليومية خلال الفترة (وارد/منصرف لكل يوم) - لرسم بياني
      // ------------------------------------------------------
      PaymentModel.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
              flow: "$moneyFlow",
            },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.day": 1 } },
      ]),
    ]);

    // -------- تجميع الإجمالي العام --------
    const incoming = summaryAgg.find((s) => s._id === "incoming");
    const outgoing = summaryAgg.find((s) => s._id === "outgoing");

    const totalIncoming = incoming?.totalAmount || 0;
    const totalOutgoing = outgoing?.totalAmount || 0;

    const summary = {
      totalIncoming,
      incomingCount: incoming?.count || 0,
      totalOutgoing,
      outgoingCount: outgoing?.count || 0,
      netCashFlow: Number((totalIncoming - totalOutgoing).toFixed(2)),
    };

    // -------- إعادة تشكيل التفصيل حسب طريقة الدفع --------
    const methodMap = {};
    for (const row of byMethodAgg) {
      const method = row._id.method;
      if (!methodMap[method]) {
        methodMap[method] = {
          method,
          incomingCount: 0,
          incomingAmount: 0,
          outgoingCount: 0,
          outgoingAmount: 0,
        };
      }
      if (row._id.flow === "incoming") {
        methodMap[method].incomingCount = row.count;
        methodMap[method].incomingAmount = row.totalAmount;
      } else {
        methodMap[method].outgoingCount = row.count;
        methodMap[method].outgoingAmount = row.totalAmount;
      }
    }
    const byMethod = Object.values(methodMap);

    // -------- إعادة تشكيل التفصيل حسب نوع العملية --------
    const moduleMap = {};
    for (const row of byModuleAgg) {
      const mod = row._id.module;
      if (!moduleMap[mod]) {
        moduleMap[mod] = {
          module: mod,
          incomingCount: 0,
          incomingAmount: 0,
          outgoingCount: 0,
          outgoingAmount: 0,
        };
      }
      if (row._id.flow === "incoming") {
        moduleMap[mod].incomingCount = row.count;
        moduleMap[mod].incomingAmount = row.totalAmount;
      } else {
        moduleMap[mod].outgoingCount = row.count;
        moduleMap[mod].outgoingAmount = row.totalAmount;
      }
    }
    const byModule = Object.values(moduleMap);

    // -------- إعادة تشكيل الحركة اليومية --------
    const dayMap = {};
    for (const row of dailyTrendAgg) {
      const day = row._id.day;
      if (!dayMap[day]) {
        dayMap[day] = { date: day, incoming: 0, outgoing: 0 };
      }
      if (row._id.flow === "incoming") {
        dayMap[day].incoming = row.totalAmount;
      } else {
        dayMap[day].outgoing = row.totalAmount;
      }
    }
    const dailyTrend = Object.values(dayMap).sort((a, b) => (a.date > b.date ? 1 : -1));

    return res.status(200).json({
      success: true,
      period: { type: period, from: start, to: end },
      summary,
      byMethod,
      byModule,
      dailyTrend,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب بيانات لوحة المدفوعات",
    });
  }
};
