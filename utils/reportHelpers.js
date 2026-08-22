/**
 * reportHelpers.js
 * دوال مساعدة مشتركة لكل الـ report controllers (pagination + فلترة التاريخ)
 */

/**
 * pagination helper
 * @param {string|number} page
 * @param {string|number} limit
 */
exports.getPagination = (page, limit) => {
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 20, 1);
  const skip = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, skip };
};

/**
 * بيبني mongo match object لفلترة نطاق تاريخ معين على أي حقل
 * dateFrom / dateTo متوقع تيجي كـ string زي "2026-01-01"
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {string} fieldName - اسم الحقل اللي هنفلتر عليه (مثلا purchaseDate, deliveryDate, createdAt...)
 */
exports.buildDateMatch = (dateFrom, dateTo, fieldName) => {
  if (!dateFrom && !dateTo) return {};

  const range = {};
  if (dateFrom) {
    const start = new Date(dateFrom);
    if (!isNaN(start)) range.$gte = start;
  }
  if (dateTo) {
    const end = new Date(dateTo);
    if (!isNaN(end)) {
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
  }

  if (Object.keys(range).length === 0) return {};
  return { [fieldName]: range };
};

/**
 * بيبني response شكله موحد لكل الـ reports (pagination metadata + data)
 */
exports.paginatedResponse = ({ res, pageNum, limitNum, totalItems, data }) => {
  return res.status(200).json({
    success: true,
    page: pageNum,
    limit: limitNum,
    totalItems,
    totalPages: Math.ceil(totalItems / limitNum) || 1,
    data,
  });
};
