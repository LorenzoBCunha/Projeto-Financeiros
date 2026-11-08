import type {SQLiteDatabase} from 'expo-sqlite';
import {SCHEMA} from './schema.ts';
import {validDate} from './finance.ts';

export const tables = {
  settings:['key','value'],
  months:['id','income','closed_at','summary'],
  envelopes:['id','name','monthly','rollover','target','active'],
  goal_movements:['id','envelope_id','kind','amount','date'],
  fixed_templates:['id','name','amount'],
  cards:['id','name','closing_day','due_day','include_closing_day','active'],
  debts:['id','name','amount','due','notice_days','paid_transaction_id','notification_id'],
  investments:['id','name','kind','details','cost','value','reminder_at','notification_id'],
  recurring_expenses:['id','name','amount','next_due','anchor_day','interval_months','notice_days','active','notification_id'],
  recurring_occurrences:['recurring_id','due','debt_id'],
  debt_pix:['debt_id','pix_key'],
  goal_deadlines:['envelope_id','due_date','notification_id'],
  month_envelopes:['month_id','envelope_id','name_snapshot','target_snapshot','rollover_snapshot','allocated','carried'],
  transactions:['id','month_id','type','amount','date','name','payment','category','envelope_id','debt_id'],
  card_statements:['id','card_id','closing_date','due_date','debt_id'],
  credit_charges:['transaction_id','statement_id','previously_paid'],
  installment_charges:['transaction_id','statement_id','installment_no','amount'],
  bill_payments:['debt_id','transaction_id'],
  bill_partial_payments:['transaction_id','debt_id'],
  bill_partial_allocations:['payment_transaction_id','envelope_id','amount'],
  fixed_status:['transaction_id','status','due','paid_date'],
  income_receipts:['month_id','amount','received_date'],
  annual_summaries:['year','data','created_at'],
} as const;
type Table = keyof typeof tables;
export type Cell = string | number | null;
export type Dump = Record<Table,Record<string,Cell>[]>;
export const names=Object.keys(tables) as Table[];
const numeric:Record<Table,readonly string[]>={settings:[],months:['income'],envelopes:['monthly','rollover','target','active'],goal_movements:['id','amount'],fixed_templates:['id','amount'],cards:['id','closing_day','due_day','include_closing_day','active'],debts:['id','amount','notice_days','paid_transaction_id'],investments:['id','cost','value'],recurring_expenses:['id','amount','anchor_day','interval_months','notice_days','active'],recurring_occurrences:['recurring_id','debt_id'],debt_pix:['debt_id'],goal_deadlines:[],month_envelopes:['target_snapshot','rollover_snapshot','allocated','carried'],transactions:['id','amount','debt_id'],card_statements:['id','card_id','debt_id'],credit_charges:['transaction_id','statement_id','previously_paid'],installment_charges:['transaction_id','statement_id','installment_no','amount'],bill_payments:['debt_id','transaction_id'],bill_partial_payments:['transaction_id','debt_id'],bill_partial_allocations:['payment_transaction_id','amount'],fixed_status:['transaction_id'],income_receipts:['amount'],annual_summaries:['year']};
const nullable:Record<Table,readonly string[]>={settings:[],months:['closed_at','summary'],envelopes:['target'],goal_movements:[],fixed_templates:['amount'],cards:[],debts:['paid_transaction_id','notification_id'],investments:['reminder_at','notification_id'],recurring_expenses:['notification_id'],recurring_occurrences:[],debt_pix:[],goal_deadlines:['notification_id'],month_envelopes:['target_snapshot'],transactions:['payment','category','envelope_id','debt_id'],card_statements:['closing_date'],credit_charges:['statement_id'],installment_charges:[],bill_payments:[],bill_partial_payments:[],bill_partial_allocations:[],fixed_status:['paid_date'],income_receipts:[],annual_summaries:[]};

export function validateDump(input:unknown):Dump {
  if (!input || typeof input!=='object') throw new Error('Conteúdo do backup inválido.');
  const payload=input as {version?:unknown;tables?:unknown};
  if (payload.version!==1 || !payload.tables || typeof payload.tables!=='object') throw new Error('Versão de backup incompatível.');
  const rows={...(payload.tables as Record<string,unknown>)};
  const newTables=['cards','card_statements','credit_charges','bill_payments'];
  const present=newTables.filter(name=>Object.prototype.hasOwnProperty.call(rows,name)).length;
  if (present!==0 && present!==newTables.length) throw new Error('Tabelas do backup inválidas.');
  if (present===0) for (const name of newTables) rows[name]=[];
  if (!Object.prototype.hasOwnProperty.call(rows,'bill_partial_payments')) rows.bill_partial_payments=[];
  for (const name of ['recurring_expenses','recurring_occurrences','goal_movements','investments','debt_pix','goal_deadlines','installment_charges','bill_partial_allocations','fixed_status','income_receipts']) if (!Object.prototype.hasOwnProperty.call(rows,name)) rows[name]=[];
  if (Object.keys(rows).length!==names.length || names.some(name=>!Array.isArray(rows[name]))) throw new Error('Tabelas do backup inválidas.');
  for (const name of names) for (const row of rows[name] as unknown[]) {
    if (!row || typeof row!=='object' || Array.isArray(row)) throw new Error('Registro de backup inválido.');
    const record=row as Record<string,unknown>; const columns=tables[name] as readonly string[];
    if (Object.keys(record).length!==columns.length || columns.some(key=>!Object.prototype.hasOwnProperty.call(record,key))) throw new Error('Campos do backup inválidos.');
    for (const [column,value] of Object.entries(record)) {
      if (value===null && nullable[name].includes(column)) continue;
      if (numeric[name].includes(column) ? !(typeof value==='number' && Number.isSafeInteger(value)) : !(typeof value==='string' && value.length<=1000000)) throw new Error('Valor inválido no backup.');
    }
    for (const column of (name==='months'?['closed_at']:name==='debts'?['due']:name==='transactions'?['date']:name==='goal_movements'?['date']:name==='card_statements'?['closing_date','due_date']:name==='recurring_expenses'?['next_due']:name==='recurring_occurrences'?['due']:name==='goal_deadlines'?['due_date']:name==='fixed_status'?['due','paid_date']:name==='income_receipts'?['received_date']:name==='annual_summaries'?['created_at']:[])) { const value=record[column]; if(value!==null && (typeof value!=='string' || !validDate(value))) throw new Error('Data inválida no backup.'); }
    if(name==='investments' && record.reminder_at!==null){const value=record.reminder_at;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(value)||!validDate(value.slice(0,10)))throw new Error('Data de lembrete inválida no backup.');}
    if(name==='months' && (typeof record.id!=='string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.id))) throw new Error('Mês inválido no backup.');
  }
  return rows as Dump;
}

export async function restoreBackup(db:SQLiteDatabase,dump:Dump) {
  const checked=validateDump({version:1,tables:dump});
  await db.withTransactionAsync(async()=>{
    const triggers=await db.getAllAsync<{name:string}>("SELECT name FROM sqlite_master WHERE type='trigger'");
    for (const trigger of triggers) {
      if (!/^[a-z_]+$/.test(trigger.name)) throw new Error('Estrutura de banco inválida.');
      await db.execAsync(`DROP TRIGGER "${trigger.name}"`);
    }
    for (const table of [...names].reverse()) await db.runAsync(`DELETE FROM ${table}`);
    for (const table of names) {
      const columns=tables[table] as readonly string[];
      for (const row of checked[table]) await db.runAsync(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,...columns.map(column=>row[column]));
    }
    await db.execAsync(SCHEMA);
    const failures=await db.getAllAsync('PRAGMA foreign_key_check');
    if (failures.length) throw new Error('Referências inválidas no backup.');
    const setup=await db.getFirstAsync<{value:string}>("SELECT value FROM settings WHERE key='setup_complete'");
    if (setup?.value!=='1') throw new Error('Planejamento ausente no backup.');
  });
}




