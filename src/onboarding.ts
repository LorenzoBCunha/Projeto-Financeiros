import type { SQLiteDatabase } from 'expo-sqlite';
import {validateUserName} from './profile.ts';

export type InitialPlan = {
  income: number;
  fixed: { name: string; amount: number }[];
  goals: { name: string; monthly: number; target: number | null; rollover: boolean }[];
};

export function parseMoney(text: string): number | null {
  let value = text.trim();
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) value=value.replace(/\./g,'');
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

export async function saveInitialPlan(db: SQLiteDatabase, plan: InitialPlan, userName:string) {
  const name=validateUserName(userName);
  const names = new Set<string>();
  if (!Number.isSafeInteger(plan.income) || plan.income < 0) throw new Error('Informe um salário válido.');
  for (const item of plan.fixed) {
    const name = item.name.trim();
    if (!name || names.has(name.toLocaleLowerCase('pt-BR')) || !Number.isSafeInteger(item.amount) || item.amount <= 0) throw new Error('Informe nomes diferentes e valores maiores que zero para as despesas.');
    names.add(name.toLocaleLowerCase('pt-BR'));
  }
  names.clear();
  for (const goal of plan.goals) {
    const name = goal.name.trim();
    if (!name || names.has(name.toLocaleLowerCase('pt-BR')) || !Number.isSafeInteger(goal.monthly) || goal.monthly <= 0 || (goal.target !== null && (!Number.isSafeInteger(goal.target) || goal.target <= 0))) throw new Error('Informe nomes diferentes e valores válidos para as metas.');
    names.add(name.toLocaleLowerCase('pt-BR'));
  }
  await db.withTransactionAsync(async () => {
    if (await db.getFirstAsync("SELECT value FROM settings WHERE key='setup_complete'")) throw new Error('A configuração inicial já foi concluída.');
    await db.runAsync("INSERT INTO settings(key,value) VALUES('user_name',?)", name);
    await db.runAsync("INSERT INTO settings(key,value) VALUES('monthly_income',?)", String(plan.income));
    for (const item of plan.fixed) await db.runAsync('INSERT INTO fixed_templates(name,amount) VALUES(?,?)', item.name.trim(), item.amount);
    for (const [index, goal] of plan.goals.entries()) await db.runAsync('INSERT INTO envelopes(id,name,monthly,rollover,target) VALUES(?,?,?,?,?)', `goal-${index + 1}`, goal.name.trim(), goal.monthly, goal.rollover ? 1 : 0, goal.target);
    await db.runAsync("INSERT INTO settings(key,value) VALUES('setup_complete','1')");
  });
}

