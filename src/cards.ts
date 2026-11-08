import type {SQLiteDatabase} from 'expo-sqlite';
import {nextMonth,validDate} from './finance.ts';

export type CardInput={id?:number;name:string;closingDay:number;dueDay:number;includeClosingDay:boolean};
export type CardRow={id:number;name:string;closing_day:number;due_day:number;include_closing_day:number;active:number};
function dateFor(month:string,day:number):string {
  const [year,m]=month.split('-').map(Number);
  const last=new Date(Date.UTC(year,m,0)).getUTCDate();
  return `${month}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function cardCycle(date:string,closingDay:number,dueDay:number,includeClosingDay:boolean) {
  if(!validDate(date)||!Number.isInteger(closingDay)||closingDay<1||closingDay>31||!Number.isInteger(dueDay)||dueDay<1||dueDay>31) throw new Error('Informe datas válidas do cartão.');
  let closingMonth=date.slice(0,7); let closing=dateFor(closingMonth,closingDay);
  if(date>closing||(date===closing&&!includeClosingDay)){closingMonth=nextMonth(closingMonth);closing=dateFor(closingMonth,closingDay);}
  let dueMonth=dueDay>closingDay?closingMonth:nextMonth(closingMonth); let due=dateFor(dueMonth,dueDay);
  if(due<=closing){dueMonth=nextMonth(closingMonth);due=dateFor(dueMonth,dueDay);}
  return {closing,due};
}
export async function saveCards(db:SQLiteDatabase,cards:CardInput[]) {
  const labels=new Set<string>();
  for(const c of cards){const name=c.name.trim();if(!name||name.length>80||labels.has(name.toLocaleLowerCase('pt-BR')))throw new Error('Informe nomes diferentes para os cartões.');labels.add(name.toLocaleLowerCase('pt-BR'));cardCycle('2026-01-15',c.closingDay,c.dueDay,c.includeClosingDay);}
  await db.withTransactionAsync(async()=>{
    for(const c of cards) if(c.id){
      const old=await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id=?',c.id);
      if(!old)throw new Error('Cartão não encontrado.');
      const changed=old.closing_day!==c.closingDay||old.due_day!==c.dueDay||!!old.include_closing_day!==c.includeClosingDay;
      if(changed && await db.getFirstAsync('SELECT s.id FROM card_statements s JOIN debts d ON d.id=s.debt_id WHERE s.card_id=? AND d.paid_transaction_id IS NULL LIMIT 1',c.id))throw new Error('Pague as faturas em aberto antes de alterar os dias deste cartão.');
    }
    await db.runAsync('UPDATE cards SET active=0');
    for(const c of cards){
      if(c.id) await db.runAsync('UPDATE cards SET name=?,closing_day=?,due_day=?,include_closing_day=?,active=1 WHERE id=?',c.name.trim(),c.closingDay,c.dueDay,c.includeClosingDay?1:0,c.id);
      else await db.runAsync('INSERT INTO cards(name,closing_day,due_day,include_closing_day,active) VALUES(?,?,?,?,1)',c.name.trim(),c.closingDay,c.dueDay,c.includeClosingDay?1:0);
    }
    await db.runAsync("INSERT INTO settings(key,value) VALUES('card_setup_complete','1') ON CONFLICT(key) DO UPDATE SET value='1'");
  });
}

type CreditTransaction={id:number;amount:number;date:string;payment:string|null};
async function attachCreditInTransaction(db:SQLiteDatabase,transaction:CreditTransaction,card:CardRow,due:string,closing:string|null) {
  if(!validDate(due)||due<transaction.date)throw new Error('Informe um vencimento válido para a fatura.');
  const current=await db.getFirstAsync<{id:number;debt_id:number;closing_date:string|null;due_date:string;paid_transaction_id:number|null}>(`SELECT s.id,s.debt_id,s.closing_date,s.due_date,d.paid_transaction_id FROM card_statements s JOIN debts d ON d.id=s.debt_id WHERE s.card_id=? AND ((? IS NOT NULL AND s.closing_date=?) OR s.due_date=?) ORDER BY CASE WHEN s.closing_date=? THEN 0 ELSE 1 END LIMIT 1`,card.id,closing,closing,due,closing);
  let statementId:number;
  if(current){
    if(current.paid_transaction_id!==null)throw new Error('Esta fatura já foi paga. Confira o vencimento antes de continuar.');
    if(current.closing_date && closing && current.closing_date!==closing)throw new Error('As datas configuradas conflitam com uma fatura existente.');
    if(current.due_date<transaction.date)throw new Error('O vencimento ajustado é anterior a esta compra.');
    if(!current.closing_date && closing)await db.runAsync('UPDATE card_statements SET closing_date=? WHERE id=?',closing,current.id);
    statementId=current.id;
    await db.runAsync('UPDATE debts SET amount=amount+? WHERE id=?',transaction.amount,current.debt_id);
  }else{
    const debt=await db.runAsync('INSERT INTO debts(name,amount,due,notice_days) VALUES(?,?,?,3)',`Fatura · ${card.name}`,transaction.amount,due);
    const statement=await db.runAsync('INSERT INTO card_statements(card_id,closing_date,due_date,debt_id) VALUES(?,?,?,?)',card.id,closing,due,debt.lastInsertRowId);
    statementId=statement.lastInsertRowId;
  }
  await db.runAsync('INSERT INTO credit_charges(transaction_id,statement_id,previously_paid) VALUES(?,?,0)',transaction.id,statementId);
}
export async function attachNewCredit(db:SQLiteDatabase,transaction:CreditTransaction,cardId:number) {
  const card=await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id=? AND active=1',cardId);
  if(!card)throw new Error('Escolha um cartão cadastrado.');
  const cycle=cardCycle(transaction.date,card.closing_day,card.due_day,!!card.include_closing_day);
  await attachCreditInTransaction(db,transaction,card,cycle.due,cycle.closing);
}
export async function attachInstallments(db:SQLiteDatabase,transaction:CreditTransaction,cardId:number,count:number) {
 if(!Number.isInteger(count)||count<2||count>36||count>transaction.amount)throw new Error('Informe de 2 a 36 parcelas, com valor de pelo menos um centavo cada.');
 const card=await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id=? AND active=1',cardId);if(!card)throw new Error('Escolha um cartão cadastrado.');
 const base=Math.floor(transaction.amount/count),extra=transaction.amount%count;let cycle=cardCycle(transaction.date,card.closing_day,card.due_day,!!card.include_closing_day);
 for(let number=1;number<=count;number++){
  const value=base+(number<=extra?1:0);let statementId:number;
  if(number===1){await attachCreditInTransaction(db,{...transaction,amount:value},card,cycle.due,cycle.closing);const first=await db.getFirstAsync<{statement_id:number}>('SELECT statement_id FROM credit_charges WHERE transaction_id=?',transaction.id);if(!first)throw new Error('Fatura não encontrada.');statementId=first.statement_id;}
  else {const current=await db.getFirstAsync<{id:number;debt_id:number;paid_transaction_id:number|null;due_date:string;closing_date:string|null}>(`SELECT s.id,s.debt_id,d.paid_transaction_id,s.due_date,s.closing_date FROM card_statements s JOIN debts d ON d.id=s.debt_id WHERE s.card_id=? AND (s.closing_date=? OR s.due_date=?) ORDER BY CASE WHEN s.closing_date=? THEN 0 ELSE 1 END LIMIT 1`,card.id,cycle.closing,cycle.due,cycle.closing);
   if(current){if(current.closing_date&&current.closing_date!==cycle.closing)throw new Error('As datas configuradas conflitam com uma fatura existente.');if(current.paid_transaction_id!==null)throw new Error('Uma fatura futura já está paga. Confira as datas.');if(current.due_date<transaction.date)throw new Error('O vencimento da fatura é anterior à compra.');statementId=current.id;await db.runAsync('UPDATE debts SET amount=amount+? WHERE id=?',value,current.debt_id);}
   else{const debt=await db.runAsync('INSERT INTO debts(name,amount,due,notice_days) VALUES(?,?,?,3)',`Fatura · ${card.name}`,value,cycle.due);const statement=await db.runAsync('INSERT INTO card_statements(card_id,closing_date,due_date,debt_id) VALUES(?,?,?,?)',card.id,cycle.closing,cycle.due,debt.lastInsertRowId);statementId=statement.lastInsertRowId;}}
  await db.runAsync('INSERT INTO installment_charges(transaction_id,statement_id,installment_no,amount) VALUES(?,?,?,?)',transaction.id,statementId,number,value);
  const next=new Date(`${cycle.closing}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);cycle=cardCycle(next.toISOString().slice(0,10),card.closing_day,card.due_day,!!card.include_closing_day);
 }
}
export async function resolveLegacyCredit(db:SQLiteDatabase,transactionId:number,choice:{kind:'paid'}|{kind:'unpaid';cardId:number;due:string}) {
  await db.withTransactionAsync(async()=>{
    const transaction=await db.getFirstAsync<CreditTransaction>('SELECT id,amount,date,payment FROM transactions WHERE id=?',transactionId);
    if(!transaction||transaction.payment!=='Crédito')throw new Error('Compra no crédito não encontrada.');
    if(await db.getFirstAsync('SELECT transaction_id FROM credit_charges WHERE transaction_id=?',transactionId))throw new Error('Esta compra já foi revisada.');
    if(choice.kind==='paid')await db.runAsync('INSERT INTO credit_charges(transaction_id,statement_id,previously_paid) VALUES(?,NULL,1)',transactionId);
    else {const card=await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id=? AND active=1',choice.cardId);if(!card)throw new Error('Escolha um cartão cadastrado.');await attachCreditInTransaction(db,transaction,card,choice.due,null);}
  });
}

export async function setStatementDue(db:SQLiteDatabase,statementId:number,due:string) {
  if(!validDate(due))throw new Error('Informe uma data de vencimento válida.');
  let oldNotificationId:string|null=null;
  await db.withTransactionAsync(async()=>{
    const statement=await db.getFirstAsync<{debt_id:number;paid_transaction_id:number|null;notification_id:string|null}>('SELECT s.debt_id,d.paid_transaction_id,d.notification_id FROM card_statements s JOIN debts d ON d.id=s.debt_id WHERE s.id=?',statementId);
    if(!statement||statement.paid_transaction_id!==null)throw new Error('Fatura inexistente ou já paga.');
    const last=await db.getFirstAsync<{date:string}>("SELECT MAX(date) AS date FROM (SELECT t.date FROM credit_charges c JOIN transactions t ON t.id=c.transaction_id WHERE c.statement_id=? UNION ALL SELECT t.date FROM installment_charges i JOIN transactions t ON t.id=i.transaction_id WHERE i.statement_id=?)",statementId,statementId);
    if(last?.date&&due<last.date)throw new Error('O vencimento não pode ser anterior às compras da fatura.');
    await db.runAsync('UPDATE card_statements SET due_date=? WHERE id=?',due,statementId);
    oldNotificationId=statement.notification_id;
    await db.runAsync('UPDATE debts SET due=?,notification_id=NULL WHERE id=?',due,statement.debt_id);
  });
  return oldNotificationId;
}
