export type Envelope = { name: string; monthly: number; rollover: boolean; balance: number };
export type Transaction = { amount: number; date: string; location: string; payment: string; category: string };
export type Debt = { name: string; amount: number; due: string; noticeDays: number };

export function money(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Informe um valor válido em centavos.');
  return value;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function margin(income: number, fixed: number[], envelopes: Envelope[]): number {
  return money(income) - fixed.reduce((sum, n) => sum + money(n), 0) - envelopes.reduce((sum, e) => sum + money(e.monthly), 0);
}
export function budgetMargin(income:number,fixed:number,allocated:number,freeExtra:number):number {
  return money(income)+money(freeExtra)-money(fixed)-money(allocated);
}
export function freeToSpend(income:number,fixed:number,allocated:number,freeExtra:number,direct:number,bills:number,billGoals:number,goalDeficit:number):number {
  return budgetMargin(income,fixed,allocated,freeExtra)-money(direct)-money(bills)+money(billGoals)-money(goalDeficit);
}
export function validateExpense(t: Transaction, today: string): string[] {
  const errors: string[] = [];
  if (!Number.isSafeInteger(t.amount) || t.amount <= 0) errors.push('Informe o valor.');
  if (!validDate(t.date) || t.date > today) errors.push('Informe uma data válida que não seja futura.');
  if (!t.location.trim()) errors.push('Informe o local.');
  if (!['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Vale'].includes(t.payment)) errors.push('Escolha a forma de pagamento.');
  if (!t.category.trim()) errors.push('Escolha a categoria.');
  return errors;
}
export function debtNotificationDate(debt: Debt): string {
  if (!debt.name.trim() || !Number.isSafeInteger(debt.amount) || debt.amount <= 0 || !validDate(debt.due) || ![0, 1, 3, 7].includes(debt.noticeDays)) throw new Error('Preencha todos os dados da dívida.');
  const date = new Date(`${debt.due}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - debt.noticeDays);
  return date.toISOString().slice(0, 10);
}
export function nextMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const [year, m] = month.split('-').map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}
export function rollEnvelopes(envelopes: Envelope[]): Envelope[] {
  return envelopes.map(e => ({ ...e, balance: money(e.monthly) + (e.rollover ? money(e.balance) : 0) }));
}
export type YearItem = { month: string; clt: number; extra: number; expenses: number; categories: Record<string, number>; saved: Record<string, number> };
export function summarizeYear(year: number, items: YearItem[]) {
  const months = items.filter(item => item.month.startsWith(`${year}-`)).slice().sort((a, b) => a.month.localeCompare(b.month));
  const totals = { clt: 0, extra: 0, expenses: 0, categories: {} as Record<string, number>, saved: {} as Record<string, number> };
  for (const item of months) {
    totals.clt += money(item.clt); totals.extra += money(item.extra); totals.expenses += money(item.expenses);
    for (const [key, amount] of Object.entries(item.categories)) totals.categories[key] = (totals.categories[key] || 0) + money(amount);
    for (const [key, amount] of Object.entries(item.saved)) { if (!Number.isSafeInteger(amount)) throw new Error('Valor de meta inválido.'); totals.saved[key] = (totals.saved[key] || 0) + amount; }
  }
  const ranked = months.slice().sort((a, b) => a.expenses - b.expenses || a.month.localeCompare(b.month));
  return { year, ...totals, income: totals.clt + totals.extra, leastSpent: ranked[0]?.month ?? null, mostSpent: ranked.at(-1)?.month ?? null, months };
}
