

const Product = require(`${__dirname}/../../models/products`);
const mongoose = require("mongoose");


exports.getProductNotifications = async (req, res) => {
  try {
    const now = new Date();
    const fiveMonthsLater = new Date();
    fiveMonthsLater.setMonth(now.getMonth() + 5);

    // ============================================================
    // 1. المنتجات المنتهية (Out of Stock)
    // ============================================================
    const outOfStockProducts = await Product.find({
      availableQuantity: 0,
      status: { $ne: "inactive" }
    })
    .select("code productName category availableQuantity totalUnits status expiration")
    .sort({ productName: 1 })
    .lean();

    // ============================================================
    // 2. المنتجات القريبة من النفاذ (كمية 2 أو 3)
    // ============================================================
    const lowStockProducts = await Product.find({
      availableQuantity: { $in: [1, 2, 3] },
      status: { $ne: "inactive" }
    })
    .select("code productName category availableQuantity totalUnits status expiration")
    .sort({ availableQuantity: 1 })
    .lean();

    // ============================================================
    // 3. المنتجات القريبة من الانتهاء (أقل من 5 شهور)
    // ============================================================
    const expiringSoonProducts = await Product.find({
      expiration: { 
        $gte: now, 
        $lte: fiveMonthsLater 
      },
      status: { $ne: "inactive" }
    })
    .select("code productName category availableQuantity totalUnits status expiration")
    .sort({ expiration: 1 })
    .lean();

    // ============================================================
    // 4. المنتجات منتهية الصلاحية (ولكن لديها كمية > 0)
    // ============================================================
    const expiredProducts = await Product.find({
      expiration: { $lt: now },
      availableQuantity: { $gt: 0 },
      status: { $ne: "inactive" }
    })
    .select("code productName category availableQuantity totalUnits status expiration")
    .sort({ expiration: 1 })
    .lean();

    // ============================================================
    // تجميع الإشعارات
    // ============================================================
    const notifications = [];

    // إشعارات المنتجات المنتهية
    outOfStockProducts.forEach(product => {
      notifications.push({
        type: "out_of_stock",
        severity: "critical",
        title: "❗ منتج منتهي من المخزون",
        message: `المنتج "${product.productName}" (${product.code}) نفذت الكمية بالكامل`,
        product: product,
        action: "تحديث المخزون",
        createdAt: new Date()
      });
    });

    // إشعارات المنتجات القريبة من النفاذ
    lowStockProducts.forEach(product => {
      const quantity = product.availableQuantity;
      let severity = "warning";
      let title = "⚠️ منتج قريب من النفاذ";
      
      if (quantity === 1) {
        severity = "critical";
        title = "🔴 منتج على وشك النفاذ";
      }

      notifications.push({
        type: "low_stock",
        severity: severity,
        title: title,
        message: `المنتج "${product.productName}" (${product.code}) متبقي منه ${quantity} قطعة فقط`,
        product: product,
        action: "إعادة تخزين",
        createdAt: new Date()
      });
    });

    // إشعارات المنتجات القريبة من الانتهاء (أقل من 5 شهور)
    expiringSoonProducts.forEach(product => {
      const daysUntilExpiry = Math.ceil(
        (new Date(product.expiration) - now) / (1000 * 60 * 60 * 24)
      );
      
      let severity = "warning";
      let title = "⏰ منتج قريب من الانتهاء";
      
      if (daysUntilExpiry <= 30) {
        severity = "critical";
        title = "🔴 منتج على وشك الانتهاء";
      } else if (daysUntilExpiry <= 60) {
        severity = "warning";
        title = "⚠️ منتج يقترب من الانتهاء";
      }

      const monthsUntilExpiry = Math.floor(daysUntilExpiry / 30);
      const timeText = monthsUntilExpiry > 0 
        ? `${monthsUntilExpiry} شهر` 
        : `${daysUntilExpiry} يوم`;

      notifications.push({
        type: "expiring_soon",
        severity: severity,
        title: title,
        message: `المنتج "${product.productName}" (${product.code}) ينتهي خلال ${timeText}`,
        product: product,
        action: "مراجعة المنتج",
        createdAt: new Date()
      });
    });

    // إشعارات المنتجات منتهية الصلاحية (مع كمية)
    expiredProducts.forEach(product => {
      const daysOverdue = Math.ceil(
        (now - new Date(product.expiration)) / (1000 * 60 * 60 * 24)
      );

      notifications.push({
        type: "expired",
        severity: "critical",
        title: "🚫 منتج منتهي الصلاحية",
        message: `المنتج "${product.productName}" (${product.code}) انتهت صلاحيته منذ ${daysOverdue} يوم، ويتبقى منه ${product.availableQuantity} قطعة`,
        product: product,
        action: "إتلاف أو استرجاع",
        createdAt: new Date()
      });
    });

    // ترتيب الإشعارات حسب الأهمية (critical > warning > info)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // ============================================================
    // إحصائيات الإشعارات
    // ============================================================
    const stats = {
      total: notifications.length,
      critical: notifications.filter(n => n.severity === "critical").length,
      warning: notifications.filter(n => n.severity === "warning").length,
      info: notifications.filter(n => n.severity === "info").length,
      outOfStock: outOfStockProducts.length,
      lowStock: lowStockProducts.length,
      expiringSoon: expiringSoonProducts.length,
      expired: expiredProducts.length,
    };

    return res.status(200).json({
      success: true,
      stats,
      notifications,
      // مجموعات المنتجات منفصلة للتفاصيل
      productGroups: {
        outOfStock: outOfStockProducts,
        lowStock: lowStockProducts,
        expiringSoon: expiringSoonProducts,
        expired: expiredProducts,
      }
    });

  } catch (error) {
    console.error("Error in getProductNotifications:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "حدث خطأ أثناء جلب الإشعارات",
    });
  }
};

/**
 * الحصول على إحصائيات سريعة للإشعارات (للوحة التحكم)
 */
exports.getNotificationStats = async (req, res) => {
  try {
    const now = new Date();
    const fiveMonthsLater = new Date();
    fiveMonthsLater.setMonth(now.getMonth() + 5);

    // تنفيذ الاستعلامات المتوازية
    const [
      outOfStockCount,
      lowStockCount,
      expiringSoonCount,
      expiredCount,
      totalProducts
    ] = await Promise.all([
      Product.countDocuments({ 
        availableQuantity: 0, 
        status: { $ne: "inactive" } 
      }),
      Product.countDocuments({ 
        availableQuantity: { $in: [1, 2, 3] }, 
        status: { $ne: "inactive" } 
      }),
      Product.countDocuments({ 
        expiration: { $gte: now, $lte: fiveMonthsLater }, 
        status: { $ne: "inactive" } 
      }),
      Product.countDocuments({ 
        expiration: { $lt: now }, 
        availableQuantity: { $gt: 0 },
        status: { $ne: "inactive" } 
      }),
      Product.countDocuments({ status: { $ne: "inactive" } })
    ]);

    const totalNotifications = outOfStockCount + lowStockCount + expiringSoonCount + expiredCount;

    return res.status(200).json({
      success: true,
      stats: {
        totalNotifications,
        critical: outOfStockCount + expiredCount,
        warning: lowStockCount + (expiringSoonCount > 0 ? 1 : 0),
        details: {
          outOfStock: outOfStockCount,
          lowStock: lowStockCount,
          expiringSoon: expiringSoonCount,
          expired: expiredCount,
        }
      },
      hasNotifications: totalNotifications > 0
    });

  } catch (error) {
    console.error("Error in getNotificationStats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "حدث خطأ أثناء جلب إحصائيات الإشعارات",
    });
  }
};

/**
 * الحصول على تنبيهات المنتجات (نسخة مبسطة للـ Dashboard)
 */
exports.getProductAlerts = async (req, res) => {
  try {
    const now = new Date();
    const fiveMonthsLater = new Date();
    fiveMonthsLater.setMonth(now.getMonth() + 5);

    // المنتجات المنتهية
    const outOfStock = await Product.find({
      availableQuantity: 0,
      status: { $ne: "inactive" }
    })
    .select("code productName availableQuantity")
    .limit(10)
    .lean();

    // المنتجات قليلة المخزون
    const lowStock = await Product.find({
      availableQuantity: { $in: [1, 2, 3] },
      status: { $ne: "inactive" }
    })
    .select("code productName availableQuantity")
    .limit(10)
    .lean();

    // المنتجات منتهية الصلاحية
    const expired = await Product.find({
      expiration: { $lt: now },
      availableQuantity: { $gt: 0 },
      status: { $ne: "inactive" }
    })
    .select("code productName expiration availableQuantity")
    .limit(10)
    .lean();

    // المنتجات القريبة من الانتهاء
    const expiringSoon = await Product.find({
      expiration: { $gte: now, $lte: fiveMonthsLater },
      status: { $ne: "inactive" }
    })
    .select("code productName expiration availableQuantity")
    .limit(10)
    .lean();

    return res.status(200).json({
      success: true,
      alerts: {
        outOfStock: {
          count: outOfStock.length,
          items: outOfStock
        },
        lowStock: {
          count: lowStock.length,
          items: lowStock
        },
        expired: {
          count: expired.length,
          items: expired.map(p => ({
            ...p,
            daysOverdue: Math.ceil((now - new Date(p.expiration)) / (1000 * 60 * 60 * 24))
          }))
        },
        expiringSoon: {
          count: expiringSoon.length,
          items: expiringSoon.map(p => ({
            ...p,
            monthsRemaining: Math.max(0, Math.floor(
              (new Date(p.expiration) - now) / (1000 * 60 * 60 * 24 * 30)
            ))
          }))
        }
      }
    });

  } catch (error) {
    console.error("Error in getProductAlerts:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "حدث خطأ أثناء جلب التنبيهات",
    });
  }
};