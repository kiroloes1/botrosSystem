
const WEEK_START_DAY = 6; 

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getPeriodRange({ period = "today", from, to } = {}) {
  const now = new Date();

  switch (period) {
    case "today": {
      return { start: startOfDay(now), end: endOfDay(now) };
    }

    case "week": {
      const day = now.getDay(); // 0-6 (0=الأحد)
      const diff = (day - WEEK_START_DAY + 7) % 7;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diff);
      return { start: startOfDay(weekStart), end: endOfDay(now) };
    }

    case "month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(monthStart), end: endOfDay(now) };
    }

    case "custom": {
      if (!from || !to) {
        const err = new Error("لازم تحدد 'من تاريخ' و 'إلى تاريخ' لما تختار فترة مخصصة");
        err.statusCode = 400;
        throw err;
      }
      return { start: startOfDay(from), end: endOfDay(to) };
    }

    default: {
      const err = new Error("الفترة غير معروفة، القيم المسموحة: today, week, month, custom");
      err.statusCode = 400;
      throw err;
    }
  }
}

module.exports = { getPeriodRange, startOfDay, endOfDay };
