const mongoose = require('mongoose');

/**
 * Builds a Mongo date-range filter for a given field.
 * from/to are expected as 'YYYY-MM-DD' or any Date-parsable string.
 */
function buildDateRangeFilter(field, from, to) {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter[field].$lte = end;
    }
  }
  return filter;
}

/** Safely casts a string to ObjectId, returns undefined if invalid/empty */
function toObjectId(id) {
  if (!id) return undefined;
  if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
  return new mongoose.Types.ObjectId(id);
}

/** Adds key:value to filter only if value is defined (after optional transform) */
function addIfPresent(filter, key, value, transform = (v) => v) {
  if (value !== undefined && value !== null && value !== '') {
    const t = transform(value);
    if (t !== undefined) filter[key] = t;
  }
  return filter;
}

function parsePagination(query, defaultLimit = 10) {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(parseInt(query.limit) || defaultLimit, 200);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

module.exports = {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
};
