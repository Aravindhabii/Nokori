import { db } from './db.js';
import { todayIST } from './time.js';

// The single source of truth for money math. Every route reads balances/spending
// through these helpers so the sign conventions live in exactly one place.

/**
 * Per-account balance = opening balance + a single signed SUM over every entry
 * that touches the account (as income dest, expense source, or transfer leg).
 */
const accountsStmt = db.prepare(`
  SELECT a.id, a.name, a.type, a.is_default, a.archived, a.opening_balance_paise,
    a.opening_balance_paise + COALESCE(SUM(CASE
      WHEN e.type='income'   AND e.account_id = a.id      THEN  e.amount_paise
      WHEN e.type='expense'  AND e.account_id = a.id      THEN -e.amount_paise
      WHEN e.type='transfer' AND e.from_account_id = a.id THEN -e.amount_paise
      WHEN e.type='transfer' AND e.to_account_id = a.id   THEN  e.amount_paise
      ELSE 0 END), 0) AS balance_paise
  FROM accounts a
  LEFT JOIN entries e
    ON e.user_id = a.user_id
   AND (e.account_id = a.id OR e.from_account_id = a.id OR e.to_account_id = a.id)
  WHERE a.user_id = ?
  GROUP BY a.id
  ORDER BY a.is_default DESC, a.archived ASC, a.id
`);

export function getAccounts(userId) {
  return accountsStmt.all(userId).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    is_default: !!a.is_default,
    archived: !!a.archived,
    opening_balance: a.opening_balance_paise / 100,
    balance: a.balance_paise / 100,
  }));
}

/** Money on hand = sum of all non-archived asset-account balances. */
export function getTotalAssets(userId) {
  const total = accountsStmt
    .all(userId)
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + a.balance_paise, 0);
  return total / 100;
}

/** The user's default quick-entry account id (or null). */
export function getDefaultAccountId(userId) {
  const row = db
    .prepare(`SELECT id FROM accounts WHERE user_id = ? AND is_default = 1 AND archived = 0`)
    .get(userId);
  return row ? row.id : null;
}

// ---------- Credit cards ----------
// Statement/due days are 1–28 (enforced at the DB), so no month-length clamping.

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addMonth = (y, m, n) => {
  const idx = (m - 1) + n; // m is 1-based
  return { y: y + Math.floor(idx / 12), m: (((idx % 12) + 12) % 12) + 1 };
};
const addDay = (dateStr) => {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
};

/** Compute statement-cycle dates for a card given today (IST). */
function cycleDates(statementDay, dueDay) {
  const [Y, M, D] = todayIST().split('-').map(Number);
  // Most recent statement date on/before today.
  const last = D >= statementDay ? { y: Y, m: M } : addMonth(Y, M, -1);
  const lastStatement = ymd(last.y, last.m, statementDay);
  const prev = addMonth(last.y, last.m, -1);
  const prevStatement = ymd(prev.y, prev.m, statementDay);
  // Last closed statement period = (prevStatement+1 … lastStatement].
  const lastPeriodStart = addDay(prevStatement);
  // Current (open) cycle = charges after the last statement date.
  const currentCycleStart = addDay(lastStatement);
  // The current open cycle closes on the next statement date.
  const next = addMonth(last.y, last.m, 1);
  const nextStatementMonth = `${next.y}-${String(next.m).padStart(2, '0')}`;
  // Due date: the due day after the last statement (same month if due>statement, else next month).
  const due = dueDay > statementDay ? { y: last.y, m: last.m } : addMonth(last.y, last.m, 1);
  const dueDate = ymd(due.y, due.m, dueDay);
  return { lastStatement, lastPeriodStart, currentCycleStart, dueDate, nextStatementMonth };
}

const chargesStmt = db.prepare(
  `SELECT COALESCE(SUM(amount_paise),0) AS p FROM entries
   WHERE user_id=? AND type='expense' AND card_id=?`
);
const paymentsStmt = db.prepare(
  `SELECT COALESCE(SUM(amount_paise),0) AS p FROM entries
   WHERE user_id=? AND type='transfer' AND to_card_id=?`
);
// Statement charges EXCLUDE EMI purchases (emi_plan_id IS NULL) — those bill via
// the installment schedule, not the full principal, in the cycle they land in.
const regularChargesRangeStmt = db.prepare(
  `SELECT COALESCE(SUM(amount_paise),0) AS p FROM entries
   WHERE user_id=? AND type='expense' AND card_id=? AND emi_plan_id IS NULL
     AND occurred_at>=? AND occurred_at<=?`
);
const cardPlansStmt = db.prepare(`SELECT * FROM emi_plans WHERE user_id=? AND card_id=?`);
const cardsStmt = db.prepare(`SELECT * FROM credit_cards WHERE user_id=? ORDER BY archived ASC, id`);

const monthOf = (dateStr) => dateStr.slice(0, 7);
const addMonthsStr = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const r = addMonth(y, m, n);
  return `${r.y}-${String(r.m).padStart(2, '0')}`;
};
const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};
/** Installment amount a plan bills in month `ym` (0 if outside its active window). */
const installmentForMonth = (plan, ym) => {
  const end = addMonthsStr(plan.start_month, plan.months - 1);
  return ym >= plan.start_month && ym <= end ? plan.monthly_paise : 0;
};

/** All cards with computed outstanding / available / statement figures. */
export function getCards(userId) {
  return cardsStmt.all(userId).map((c) => {
    const charges = chargesStmt.get(userId, c.id).p;
    const payments = paymentsStmt.get(userId, c.id).p;
    const outstanding = charges - payments;
    const { lastStatement, lastPeriodStart, currentCycleStart, dueDate, nextStatementMonth } = cycleDates(
      c.statement_day,
      c.due_day
    );
    const plans = cardPlansStmt.all(userId, c.id);
    const lastMonth = monthOf(lastStatement);
    // Last bill = installments billed in the last statement's month; current open cycle
    // will bill installments in the NEXT statement's month.
    const lastInstallments = plans.reduce((s, pl) => s + installmentForMonth(pl, lastMonth), 0);
    const curInstallments = plans.reduce((s, pl) => s + installmentForMonth(pl, nextStatementMonth), 0);
    const lastStatementAmount =
      regularChargesRangeStmt.get(userId, c.id, lastPeriodStart, lastStatement).p + lastInstallments;
    const currentCycleSpend =
      regularChargesRangeStmt.get(userId, c.id, currentCycleStart, '9999-12-31').p + curInstallments;
    return {
      id: c.id,
      name: c.name,
      credit_limit: c.credit_limit_paise / 100,
      statement_day: c.statement_day,
      due_day: c.due_day,
      archived: !!c.archived,
      outstanding: outstanding / 100,
      available: (c.credit_limit_paise - outstanding) / 100,
      current_cycle_spend: currentCycleSpend / 100,
      last_statement_amount: lastStatementAmount / 100,
      due_date: dueDate,
    };
  });
}

const emisStmt = db.prepare(`
  SELECT e.*, c.name AS card_name
  FROM emi_plans e JOIN credit_cards c ON c.id = e.card_id
  WHERE e.user_id = ? ORDER BY e.id DESC
`);

/** All EMI plans with elapsed/remaining installment progress. */
export function getEmis(userId) {
  const cur = monthOf(todayIST());
  return emisStmt.all(userId).map((pl) => {
    const endMonth = addMonthsStr(pl.start_month, pl.months - 1);
    let elapsed = monthsBetween(pl.start_month, cur) + 1; // inclusive of start month
    elapsed = Math.max(0, Math.min(pl.months, elapsed));
    const remaining = pl.months - elapsed;
    return {
      id: pl.id,
      card_id: pl.card_id,
      card_name: pl.card_name,
      principal: pl.principal_paise / 100,
      months: pl.months,
      monthly: pl.monthly_paise / 100,
      start_month: pl.start_month,
      end_month: endMonth,
      elapsed,
      remaining,
      remaining_amount: (remaining * pl.monthly_paise) / 100,
      done: remaining <= 0,
    };
  });
}
