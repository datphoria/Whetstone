/**
 * Ceiling used when surfacing "almost affordable" upgrades.
 * Always at least +25M above cash on hand so mid-tier upgrades like Bludgeon
 * (~19M) appear when the bank stack is a bit short; also scales with larger
 * budgets so endgame upgrades stay visible.
 */
export function defaultStretchBudget(budget: number): number {
  const safe = Number.isFinite(budget) && budget > 0 ? budget : 0;
  return Math.max(safe * 3, safe + 25_000_000);
}

export function shortfall(cost: number, budget: number): number {
  return Math.max(0, cost - Math.max(0, budget));
}
