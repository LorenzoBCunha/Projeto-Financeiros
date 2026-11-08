import type { SQLiteDatabase } from 'expo-sqlite';
import { debtNotificationDate, validDate, validateExpense, type Debt, type Transaction } from './finance.ts';
import {attachNewCredit,attachInstallments} from './cards.ts';
import {goalExtraSql,goalSpentSql} from './accounting.ts';

export async function createMonth(db: SQLiteDatabase, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  await db.withTransactionAsync(async () => {
    if (await db.getFirstAsync('SELECT id FROM months WHERE id = ?', month)) return;
    const setup = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='setup_complete'");
    if (setup?.value !== '1') throw new Error('Conclua a configuração inicial antes de criar um mês.');
    const previous = await db.getFirstAsync<{ id: string; closed_at: string | null }>('SELECT id, closed_at FROM months WHERE id < ? ORDER BY id DESC LIMIT 1', month);
    if (previous && !previous.closed_at) throw new Error('Feche o mês anterior antes de criar o próximo.');
    const income = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'monthly_income'");
    if (!income || !/^\d+$/.test(income.value) || !Number.isSafeInteger(Number(income.value))) throw new Error('Salário inválido.');
    await db.runAsync('INSERT INTO months(id,income) VALUES(?,?)', month, Number(income.value));
    const envelopes = await db.getAllAsync<{id: string; name: string; monthly: number; rollover: number; target: number | null}>('SELECT id, name, monthly, rollover, target FROM envelopes WHERE active=1');
    for (const envelope of envelopes) {
      let carried = 0;
      if (previous) {
        const balance = await db.getFirstAsync<{ amount: number }>(`SELECT CASE WHEN me.rollover_snapshot=0 THEN 0 ELSE me.allocated + me.carried + ${goalExtraSql} - ${goalSpentSql} END AS amount FROM month_envelopes me WHERE me.month_id=? AND me.envelope_id=?`, previous.id, envelope.id);
        carried = Math.max(0, balance?.amount ?? 0);
      }
      await db.runAsync('INSERT INTO month_envelopes(month_id,envelope_id,name_snapshot,target_snapshot,rollover_snapshot,allocated,carried) VALUES(?,?,?,?,?,?,?)', month, envelope.id, envelope.name, envelope.target, envelope.rollover, envelope.monthly, carried);
    }
    await db.runAsync("INSERT INTO transactions(month_id,type,amount,date,name,category) SELECT ?, 'fixed', amount, ? || '-01', name, name FROM fixed_templates WHERE amount > 0", month, month);
  });
}

export async function addExpense(db: SQLiteDatabase, expense: Transaction, today: string, debtId: number | null = null, envelopeId: string | null = null, cardId:number | null = null, installments=1) {
  const errors = validateExpense(expense, today);
  if (errors.length) throw new Error(errors.join('\n'));
  const month = expense.date.slice(0, 7);
  await db.withTransactionAsync(async () => {
    if (envelopeId !== null && !await db.getFirstAsync('SELECT envelope_id FROM month_envelopes WHERE month_id=? AND envelope_id=?',month,envelopeId)) throw new Error('Esta caixinha não está disponível no mês do gasto.');
    const bill=debtId===null?null:await db.getFirstAsync('SELECT id FROM card_statements WHERE debt_id=?',debtId);
    if (bill && expense.payment==='Crédito') throw new Error('Pague a fatura por Pix, débito, dinheiro ou vale.');
    if (bill && envelopeId!==null) throw new Error('A fatura usa as caixinhas escolhidas em cada compra.');
    if (expense.payment==='Crédito' && cardId===null) throw new Error('Escolha o cartão da compra.');
    if(!Number.isInteger(installments)||installments<1||installments>36||(installments>1&&(expense.payment!=='Crédito'||debtId!==null)))throw new Error('Parcelas só estão disponíveis em compras no crédito sem vínculo com dívida.');
    let partial=false;
    if (debtId !== null) {
      const debt = await db.getFirstAsync<{paid_transaction_id:number|null;amount:number;name:string;paid:number}>(`SELECT d.paid_transaction_id,d.amount,d.name,COALESCE((SELECT SUM(t.amount) FROM bill_partial_payments bp JOIN transactions t ON t.id=bp.transaction_id WHERE bp.debt_id=d.id),0) paid FROM debts d WHERE d.id=?`,debtId);
      if (!debt || debt.paid_transaction_id!==null || debt.name!==expense.location || expense.amount>debt.amount-debt.paid || (!bill && expense.amount!==debt.amount)) throw new Error('A dívida foi alterada, já foi paga ou o valor é maior que o saldo.');
      partial=!!bill && expense.amount<debt.amount-debt.paid;
    }
    const inserted = await db.runAsync("INSERT INTO transactions(month_id,type,amount,date,name,payment,category,envelope_id,debt_id) VALUES(?,'expense',?,?,?,?,?,?,?)", month, expense.amount, expense.date, expense.location.trim(), expense.payment, expense.category.trim(), envelopeId, partial?null:debtId);
    if (expense.payment==='Crédito') {const credit={id:inserted.lastInsertRowId,amount:expense.amount,date:expense.date,payment:expense.payment};if(installments>1)await attachInstallments(db,credit,cardId!,installments);else await attachNewCredit(db,credit,cardId!);}
    if (bill && debtId!==null) await db.runAsync(partial?'INSERT INTO bill_partial_payments(debt_id,transaction_id) VALUES(?,?)':'INSERT INTO bill_payments(debt_id,transaction_id) VALUES(?,?)',debtId,inserted.lastInsertRowId);
    if (partial && debtId!==null) {
      const {allocatePartialGoals}=await import('./partialAllocation.ts');await allocatePartialGoals(db,debtId,inserted.lastInsertRowId,expense.amount);
    }
    if (debtId !== null && !partial) await db.runAsync('UPDATE debts SET paid_transaction_id=? WHERE id=?', inserted.lastInsertRowId, debtId);
  });
}

export async function addExtra(db: SQLiteDatabase, amount: number, date: string, today: string, destination: string | null) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !validDate(date) || date > today) throw new Error('Preencha valor, data e destino válidos.');
  await db.withTransactionAsync(async()=>{
    const month=date.slice(0,7);
    if(destination!==null && !await db.getFirstAsync('SELECT envelope_id FROM month_envelopes WHERE month_id=? AND envelope_id=?',month,destination)) throw new Error('Esta caixinha não está disponível no mês da entrada.');
    await db.runAsync("INSERT INTO transactions(month_id,type,amount,date,envelope_id) VALUES(?,'extra',?,?,?)",month,amount,date,destination);
  });
}

export async function addDebt(db: SQLiteDatabase, debt: Debt, pixKey='') {
  debtNotificationDate(debt);
  if(pixKey.length>200)throw new Error('A chave Pix deve ter até 200 caracteres.');
  let result:{lastInsertRowId:number;changes:number}|null=null;
  await db.withTransactionAsync(async()=>{result=await db.runAsync('INSERT INTO debts(name,amount,due,notice_days) VALUES(?,?,?,?)',debt.name.trim(),debt.amount,debt.due,debt.noticeDays);if(pixKey.trim())await db.runAsync('INSERT INTO debt_pix(debt_id,pix_key) VALUES(?,?)',result.lastInsertRowId,pixKey.trim());});
  return result!;
}


export async function closeMonth(db: SQLiteDatabase, month: string, closedAt: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(closedAt) || closedAt.slice(0,7) < month) throw new Error('Data de fechamento inválida.');
  await db.withTransactionAsync(async () => {
    const record = await db.getFirstAsync<{ income: number; closed_at: string | null }>('SELECT income,closed_at FROM months WHERE id=?', month);
    if (!record || record.closed_at) throw new Error('Mês inexistente ou já fechado.');
    if (await db.getFirstAsync("SELECT t.id FROM transactions t WHERE t.month_id=? AND t.type='expense' AND t.payment='Crédito' AND NOT EXISTS(SELECT 1 FROM credit_charges c WHERE c.transaction_id=t.id) LIMIT 1",month)) throw new Error('Revise as compras antigas no crédito antes de fechar este mês.');
    const totals = await db.getFirstAsync<{extra: number; expenses: number}>("SELECT COALESCE(SUM(CASE WHEN type='extra' THEN amount ELSE 0 END),0) AS extra, COALESCE(SUM(CASE WHEN type='fixed' OR (type='expense' AND COALESCE(payment,'')<>'Crédito') THEN amount ELSE 0 END),0) AS expenses FROM transactions WHERE month_id=?", month);
    const savings = await db.getFirstAsync<{amount:number;carried:number}>(`SELECT COALESCE(SUM(me.rollover_snapshot * MAX(0,me.allocated+me.carried+${goalExtraSql}-${goalSpentSql})),0) AS amount,COALESCE(SUM(me.carried),0) AS carried FROM month_envelopes me WHERE me.month_id=?`,month);
    const available = record.income + (totals?.extra ?? 0) - (totals?.expenses ?? 0) + (savings?.carried ?? 0) - (savings?.amount ?? 0);
    const text = `Resumo de ${month}\nSalário previsto: R$ ${(record.income/100).toFixed(2).replace('.', ',')}\nEntradas extras: R$ ${((totals?.extra ?? 0)/100).toFixed(2).replace('.', ',')}\nDespesas e fixas previstas: R$ ${((totals?.expenses ?? 0)/100).toFixed(2).replace('.', ',')}\nCaixinhas que acumulam: R$ ${((savings?.amount ?? 0)/100).toFixed(2).replace('.', ',')}\nSobra estimada: R$ ${(available/100).toFixed(2).replace('.', ',')}`;
    await db.runAsync('UPDATE months SET closed_at=?, summary=? WHERE id=? AND closed_at IS NULL', closedAt, text, month);
    await db.runAsync("INSERT INTO settings(key,value) VALUES('pending_backup_month',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",month);
  });
}

export async function readYearSummary(db:SQLiteDatabase,year:number) {
  const rows=await db.getAllAsync<{id:string;income:number;closed_at:string|null}>('SELECT id,income,closed_at FROM months WHERE substr(id,1,4)=? ORDER BY id',String(year));
  const months=[];
  for(const row of rows) {
    const types=await db.getFirstAsync<{extra:number;expenses:number}>("SELECT COALESCE(SUM(CASE WHEN t.type='extra' THEN t.amount ELSE 0 END),0) extra, COALESCE(SUM(CASE WHEN t.type IN ('expense','fixed') AND NOT EXISTS(SELECT 1 FROM bill_payments bp WHERE bp.transaction_id=t.id) AND NOT EXISTS(SELECT 1 FROM bill_partial_payments pp WHERE pp.transaction_id=t.id) THEN t.amount ELSE 0 END),0) expenses FROM transactions t WHERE t.month_id=?",row.id);
    const groups=await db.getAllAsync<{category:string;amount:number}>("SELECT COALESCE(t.category,'Outros') category, SUM(t.amount) amount FROM transactions t WHERE t.month_id=? AND t.type IN ('expense','fixed') AND NOT EXISTS(SELECT 1 FROM bill_payments bp WHERE bp.transaction_id=t.id) AND NOT EXISTS(SELECT 1 FROM bill_partial_payments pp WHERE pp.transaction_id=t.id) GROUP BY COALESCE(t.category,'Outros')",row.id);
    const boxes=await db.getAllAsync<{name:string;amount:number}>(`SELECT me.name_snapshot AS name, (me.allocated + ${goalExtraSql} - ${goalSpentSql}) AS amount FROM month_envelopes me WHERE me.month_id=?`,row.id);
    months.push({month:row.id,clt:row.income,extra:types?.extra??0,expenses:types?.expenses??0,categories:Object.fromEntries(groups.map(g=>[g.category,g.amount])),saved:Object.fromEntries(boxes.map(b=>[b.name,b.amount]))});
  }
  const {summarizeYear}=await import('./finance.ts');
  return {rows,summary:summarizeYear(year,months)};
}
export async function freezeYear(db: SQLiteDatabase, year: number, now: string) {
  if (!Number.isInteger(year) || !validDate(now) || Number(now.slice(0,4)) <= year) throw new Error('O ano ainda não terminou.');
  await db.withTransactionAsync(async () => {
    if (await db.getFirstAsync('SELECT year FROM annual_summaries WHERE year=?', year)) return;
    const {rows,summary}=await readYearSummary(db,year);
    if (!rows.length || rows.some(row=>!row.closed_at)) throw new Error('Feche todos os meses registrados antes de gerar o resumo anual.');
    await db.runAsync('INSERT INTO annual_summaries(year,data,created_at) VALUES(?,?,?)',year,JSON.stringify(summary),now);
  });
}

export async function ensureCurrentMonth(db: SQLiteDatabase, today: string) {
  if (!validDate(today)) throw new Error('Data inválida.');
  const current = today.slice(0,7);
  let latest = await db.getFirstAsync<{id:string;closed_at:string|null}>('SELECT id,closed_at FROM months ORDER BY id DESC LIMIT 1');
  if (!latest) { await createMonth(db,current); return; }
  if (latest.id > current) throw new Error('A data do aparelho é anterior ao último mês registrado.');
  while (latest.id < current) {
    if (!latest.closed_at) await closeMonth(db,latest.id,today);
    if (latest.id.endsWith('-12')) await freezeYear(db,Number(latest.id.slice(0,4)),today);
    const previous = latest.id;
    const { nextMonth } = await import('./finance.ts');
    const next = nextMonth(previous);
    await db.runAsync("INSERT INTO settings(key,value) VALUES('pending_month_summary',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", previous);
    await createMonth(db,next);
    latest = {id:next,closed_at:null};
  }
}

export async function setDebtPix(db:SQLiteDatabase,debtId:number,pixKey:string){if(pixKey.length>200)throw new Error('A chave Pix deve ter até 200 caracteres.');await db.withTransactionAsync(async()=>{if(!await db.getFirstAsync('SELECT id FROM debts WHERE id=? AND paid_transaction_id IS NULL',debtId))throw new Error('Dívida inexistente ou já paga.');if(pixKey.trim())await db.runAsync('INSERT INTO debt_pix(debt_id,pix_key) VALUES(?,?) ON CONFLICT(debt_id) DO UPDATE SET pix_key=excluded.pix_key',debtId,pixKey.trim());else await db.runAsync('DELETE FROM debt_pix WHERE debt_id=?',debtId);});}
