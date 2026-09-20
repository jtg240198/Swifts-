// Shared date logic for the "pay for this month's Saturdays" model.
//
// Rule: subscribers pay, in one go, for every Saturday draw in a given
// month. The purchase window for a month closes once that month's first
// Saturday has passed — after that, buying moves on to next month instead.

function firstSaturday(year, monthIndex0) {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = (6 - day + 7) % 7;
  d.setUTCDate(1 + offset);
  return d;
}

function countSaturdaysInMonth(year, monthIndex0) {
  let count = 0;
  const d = firstSaturday(year, monthIndex0);
  while (d.getUTCMonth() === monthIndex0) {
    count++;
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return count;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Given "now", work out which month people are currently buying for.
function getTargetMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMonthsFirstSat = firstSaturday(y, m);

  let targetYear = y, targetMonth = m;
  const todayDateOnly = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstSatDateOnly = Date.UTC(thisMonthsFirstSat.getUTCFullYear(), thisMonthsFirstSat.getUTCMonth(), thisMonthsFirstSat.getUTCDate());
  if (todayDateOnly > firstSatDateOnly) {
    // This month's window has closed — move to next month.
    targetMonth = m + 1;
    if (targetMonth > 11) { targetMonth = 0; targetYear = y + 1; }
  }

  const saturdays = countSaturdaysInMonth(targetYear, targetMonth);
  return {
    year: targetYear,
    monthIndex0: targetMonth,
    monthName: MONTH_NAMES[targetMonth],
    saturdays,
    monthKey: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
    pricePence: saturdays * 500 // £5 per Saturday
  };
}

function currentCalendarMonthKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = { firstSaturday, countSaturdaysInMonth, getTargetMonth, currentCalendarMonthKey, MONTH_NAMES };
