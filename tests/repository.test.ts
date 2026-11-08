import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../src/schema.ts';
import { createMonth, addDebt, addExpense, addExtra } from '../src/repository.ts';
import { saveInitialPlan as saveInitialPlanWithName, parseMoney } from '../src/onboarding.ts';
const saveInitialPlan=(db,plan)=>saveInitialPlanWithName(db,plan,'Pessoa');
function createDb() {
 const sql = new DatabaseSync(':memory:'); sql.exec(SCHEMA);
 return { sql, async getFirstAsync(q,...p){return sql.prepare(q).get(...p) ?? null}, async getAllAsync(q,...p){return sql.prepare(q).all(...p)}, async runAsync(q,...p){const r=sql.prepare(q).run(...p); return {lastInsertRowId:Number(r.lastInsertRowid),changes:Number(r.changes)}}, async withTransactionAsync(fn){sql.exec('BEGIN');try{await fn();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}} };
}
test('mês exige configuração, gera lançamentos uma vez e respeita fechamento',async()=>{
 const db=createDb(); await assert.rejects(createMonth(db,'2026-11'),/configuração inicial/);
 await saveInitialPlan(db,{income:155130,fixed:Array.from({length:6},(_,i)=>({name:`Despesa ${i}`,amount:1000})),goals:[{name:'Lazer',monthly:18000,target:null,rollover:true}]});
 await createMonth(db,'2026-11'); await createMonth(db,'2026-11');
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM transactions').get().n,6);
 await assert.rejects(createMonth(db,'2026-12'),/Feche/);
 await addExtra(db,1000,'2026-11-06','2026-11-06','goal-1');
 db.sql.exec("UPDATE months SET closed_at='2026-12-01' WHERE id='2026-11'");
 await assert.rejects(addExtra(db,1,'2026-11-06','2026-11-06',null),/Mês fechado/);
 await createMonth(db,'2026-12');
 assert.equal(db.sql.prepare("SELECT carried FROM month_envelopes WHERE month_id='2026-12' AND envelope_id='goal-1'").get().carried,19000);
 db.sql.close();
});
test('pagamento da dívida cria gasto e impede duplicação',async()=>{
 const db=createDb(); await saveInitialPlan(db,{income:155130,fixed:[],goals:[]}); await createMonth(db,'2026-11');
 const debt=await addDebt(db,{name:'Ana',amount:5000,due:'2026-11-08',noticeDays:3});
 const expense={amount:5000,date:'2026-11-06',location:'Ana',payment:'Pix',category:'Pessoal'};
 await addExpense(db,expense,'2026-11-06',debt.lastInsertRowId);
 await assert.rejects(addExpense(db,expense,'2026-11-06',debt.lastInsertRowId),/já foi paga/);
 assert.ok(db.sql.prepare('SELECT paid_transaction_id FROM debts').get().paid_transaction_id);
 db.sql.close();
});
test('fechamento grava resumo e impede alteração dos lançamentos',async()=>{
 const {closeMonth}=await import('../src/repository.ts'); const db=createDb();
 await saveInitialPlan(db,{income:155130,fixed:[],goals:[]}); await createMonth(db,'2026-11');
 await addExtra(db,1000,'2026-11-06','2026-11-06',null);
 await closeMonth(db,'2026-11','2026-11-30');
 assert.match(db.sql.prepare('SELECT summary FROM months').get().summary,/10,00/);
 await assert.rejects(addExtra(db,1000,'2026-11-06','2026-11-06',null),/Mês fechado/);
 db.sql.close();
});
test('resumo anual exige meses fechados e não muda depois de criado',async()=>{
 const {closeMonth,freezeYear}=await import('../src/repository.ts'); const db=createDb();
 await saveInitialPlan(db,{income:155130,fixed:[],goals:[]}); await createMonth(db,'2026-11');
 await assert.rejects(freezeYear(db,2026,'2027-01-01'),/Feche/);
 await closeMonth(db,'2026-11','2026-11-30'); await freezeYear(db,2026,'2027-01-01');
 assert.equal(JSON.parse(db.sql.prepare('SELECT data FROM annual_summaries').get().data).clt,155130);
 assert.throws(()=>db.sql.exec('DELETE FROM annual_summaries'),/imutável/); db.sql.close();
});

test('primeiro acesso permite planejamento pessoal vazio e valida entrada',async()=>{
 const db=createDb();
 assert.equal(parseMoney('1,5'),150); assert.equal(parseMoney('1.551,30'),155130); assert.equal(parseMoney('1.000'),100000); assert.equal(parseMoney('1.05'),105); assert.equal(parseMoney('1,234'),null); assert.equal(parseMoney(''),null);
 await assert.rejects(saveInitialPlan(db,{income:10000,fixed:[{name:'Conta',amount:100},{name:'conta',amount:50}],goals:[]}),/nomes diferentes/);
 assert.equal(db.sql.prepare("SELECT count(*) n FROM settings WHERE key='setup_complete'").get().n,0);
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Viagem',monthly:2000,target:50000,rollover:true}]});
 await assert.rejects(saveInitialPlan(db,{income:0,fixed:[],goals:[]}),/já foi concluída/);
 await createMonth(db,'2026-11');
 await addExtra(db,500,'2026-11-06','2026-11-06','goal-1');
 assert.equal(db.sql.prepare('SELECT name FROM envelopes').get().name,'Viagem');
 assert.equal(db.sql.prepare('SELECT income FROM months').get().income,10000); db.sql.close();
});
test('virada cria meses faltantes e guarda resumo anual',async()=>{
 const {ensureCurrentMonth}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[{name:'Conta',amount:1000}],goals:[]});
 await ensureCurrentMonth(db,'2026-12-15'); await ensureCurrentMonth(db,'2027-02-02');
 assert.equal(db.sql.prepare('SELECT count(*) n FROM months').get().n,3);
 assert.equal(db.sql.prepare("SELECT value FROM settings WHERE key='pending_month_summary'").get().value,'2027-01');
 assert.equal(JSON.parse(db.sql.prepare('SELECT data FROM annual_summaries WHERE year=2026').get().data).expenses,1000);
 await ensureCurrentMonth(db,'2027-02-02');assert.equal(db.sql.prepare('SELECT count(*) n FROM transactions').get().n,3);db.sql.close();
});
test('alterações do modelo valem para o mês seguinte e salário é individual',async()=>{
 const {saveNextPlan,setMonthIncome}=await import('../src/plan.ts');const {closeMonth}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[{name:'Conta',amount:1000}],goals:[{name:'Viagem',monthly:2000,target:10000,rollover:true}]});
 await createMonth(db,'2026-11');
 await saveNextPlan(db,{income:12000,fixed:[{name:'Conta nova',amount:1500}],goals:[{id:'goal-1',name:'Viagem',monthly:3000,target:10000,rollover:true}]});
 assert.equal(db.sql.prepare("SELECT amount FROM transactions WHERE month_id='2026-11'").get().amount,1000);
 assert.equal(db.sql.prepare("SELECT allocated FROM month_envelopes WHERE month_id='2026-11'").get().allocated,2000);
 await setMonthIncome(db,'2026-11',11000); await closeMonth(db,'2026-11','2026-11-30');
 await assert.rejects(setMonthIncome(db,'2026-11',1),/fechado/); await createMonth(db,'2026-12');
 assert.equal(db.sql.prepare("SELECT income FROM months WHERE id='2026-12'").get().income,12000);
 assert.equal(db.sql.prepare("SELECT allocated FROM month_envelopes WHERE month_id='2026-12'").get().allocated,3000);db.sql.close();
});
test('restauração inválida desfaz todas as alterações e preserva dados',async()=>{
 const {restoreBackup,names,tables,validateDump}=await import('../src/backupData.ts'); const db=createDb();db.execAsync=async q=>db.sql.exec(q);
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]}); await createMonth(db,'2026-11');
 const dump={}; for(const table of names) dump[table]=db.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(row=>({...row}));
 assert.throws(()=>validateDump({version:1,tables:{}}));
 const corrupt=structuredClone(dump);corrupt.months[0].income=-1;
 await assert.rejects(restoreBackup(db,corrupt));
 assert.equal(db.sql.prepare('SELECT income FROM months').get().income,10000);
 assert.ok(db.sql.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='closed_month_update'").get());
 dump.months[0].income=20000;await restoreBackup(db,dump);
 assert.equal(db.sql.prepare('SELECT income FROM months').get().income,20000);db.sql.close();
});
test('rolagem usa a configuração do mês que está terminando',async()=>{
 const {saveNextPlan}=await import('../src/plan.ts');const {closeMonth}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:1000,target:null,rollover:true}]});await createMonth(db,'2026-11');
 await saveNextPlan(db,{income:10000,fixed:[],goals:[{id:'goal-1',name:'Lazer',monthly:1000,target:null,rollover:false}]});await closeMonth(db,'2026-11','2026-11-30');await createMonth(db,'2026-12');
 assert.equal(db.sql.prepare("SELECT carried FROM month_envelopes WHERE month_id='2026-12'").get().carried,1000);await closeMonth(db,'2026-12','2026-12-31');await createMonth(db,'2027-01');
 assert.equal(db.sql.prepare("SELECT carried FROM month_envelopes WHERE month_id='2027-01'").get().carried,0);db.sql.close();
});
test('sobra não desconta duas vezes o gasto feito com caixinha',async()=>{
 const {closeMonth}=await import('../src/repository.ts'); const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:2000,target:null,rollover:true}]});await createMonth(db,'2026-11');
 await addExtra(db,500,'2026-11-06','2026-11-06','goal-1');
 await addExpense(db,{amount:1000,date:'2026-11-06',location:'Cinema',payment:'Pix',category:'Lazer'},'2026-11-06',null,'goal-1');
 await closeMonth(db,'2026-11','2026-11-30');assert.match(db.sql.prepare('SELECT summary FROM months').get().summary,/Sobra estimada: R\$ 80,00/);db.sql.close();
});
test('backup rejeita tipo de valor inválido antes de restaurar',async()=>{
 const {names,tables,validateDump}=await import('../src/backupData.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');
 const dump={};for(const table of names)dump[table]=db.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(row=>({...row}));
 dump.months[0].income='valor inválido';assert.throws(()=>validateDump({version:1,tables:dump}),/Valor inválido/);db.sql.close();
});
test('sobra inclui caixinha que não acumula',async()=>{
 const {closeMonth}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:2000,target:null,rollover:false}]});await createMonth(db,'2026-11');
 await closeMonth(db,'2026-11','2026-11-30');assert.match(db.sql.prepare('SELECT summary FROM months').get().summary,/Sobra estimada: R\$ 100,00/);db.sql.close();
});
test('retirada de saldo acumulado reduz o total guardado no ano',async()=>{
 const {closeMonth,readYearSummary}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Reserva',monthly:1000,target:null,rollover:true}]});await createMonth(db,'2026-11');await closeMonth(db,'2026-11','2026-11-30');await createMonth(db,'2026-12');
 await addExpense(db,{amount:1500,date:'2026-12-01',location:'Loja',payment:'Pix',category:'Outros'},'2026-12-01',null,'goal-1');
 const result=await readYearSummary(db,2026);assert.equal(result.summary.saved.Reserva,500);db.sql.close();
});
test('lançamento não pode apontar para caixinha ausente no mês',async()=>{
 const {saveNextPlan,closeMonth}=await import('../src/repository.ts').then(async repo=>({...repo,...await import('../src/plan.ts')}));const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Meta',monthly:1000,target:null,rollover:true}]});await createMonth(db,'2026-11');
 await saveNextPlan(db,{income:10000,fixed:[],goals:[]});await closeMonth(db,'2026-11','2026-11-30');await createMonth(db,'2026-12');
 await assert.rejects(addExtra(db,100,'2026-12-01','2026-12-01','goal-1'),/não está disponível/);
 await assert.rejects(addExpense(db,{amount:100,date:'2026-12-01',location:'Loja',payment:'Pix',category:'Outros'},'2026-12-01',null,'goal-1'),/não está disponível/);db.sql.close();
});
test('nome é obrigatório no primeiro acesso e salvo junto ao plano',async()=>{
 const {validateUserName}=await import('../src/profile.ts');const db=createDb();
 const plan={income:10000,fixed:[],goals:[]};
 await assert.rejects(saveInitialPlanWithName(db,plan,'   '),/nome/i);
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM settings WHERE key=\'setup_complete\'').get().n,0);
 assert.throws(()=>validateUserName('a'.repeat(81)),/80/);
 await saveInitialPlanWithName(db,plan,'  Ana  ');
 assert.equal(db.sql.prepare('SELECT value FROM settings WHERE key=\'user_name\'').get().value,'Ana');
 assert.equal(db.sql.prepare('SELECT value FROM settings WHERE key=\'monthly_income\'').get().value,'10000');
 db.sql.close();
});
test('adicionar nome em instalação existente preserva meses e lançamentos',async()=>{
 const {saveUserName}=await import('../src/profile.ts');const db=createDb();
 await saveInitialPlan(db,{income:12000,fixed:[{name:'Conta',amount:1000}],goals:[]});await createMonth(db,'2026-11');
 db.sql.prepare("DELETE FROM settings WHERE key='user_name'").run();
 assert.equal(await saveUserName(db,'  Lorenzo  '),'Lorenzo');
 assert.equal(db.sql.prepare("SELECT value FROM settings WHERE key='user_name'").get().value,'Lorenzo');
 assert.equal(db.sql.prepare("SELECT income FROM months WHERE id='2026-11'").get().income,12000);
 assert.equal(db.sql.prepare("SELECT amount FROM transactions WHERE month_id='2026-11'").get().amount,1000);
 await assert.rejects(saveUserName(db,'  '),/nome/i);
 assert.equal(db.sql.prepare("SELECT value FROM settings WHERE key='user_name'").get().value,'Lorenzo');db.sql.close();
});
test('fechamento oferece backup de forma persistente e não altera em falha',async()=>{
 const {closeMonth}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');
 await closeMonth(db,'2026-11','2026-11-30');
 assert.equal(db.sql.prepare("SELECT value FROM settings WHERE key='pending_backup_month'").get().value,'2026-11');
 await assert.rejects(closeMonth(db,'2026-11','2026-11-30'));
 assert.equal(db.sql.prepare("SELECT value FROM settings WHERE key='pending_backup_month'").get().value,'2026-11');db.sql.close();
});
test('backup antigo continua importável com tabelas novas vazias',async()=>{
 const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const db=createDb();db.execAsync=async q=>db.sql.exec(q);
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');
 const old={};for(const table of names.filter(n=>!['cards','card_statements','credit_charges','bill_payments'].includes(n)))old[table]=db.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(row=>({...row}));
 const migrated=validateDump({version:1,tables:old});assert.deepEqual(migrated.cards,[]);assert.throws(()=>validateDump({version:1,tables:{...old,cards:[]}}));await restoreBackup(db,migrated);
 assert.equal(db.sql.prepare("SELECT income FROM months WHERE id='2026-11'").get().income,10000);db.sql.close();
});
test('compras no crédito formam faturas e o pagamento não as duplica',async()=>{
 const {saveCards}=await import('../src/cards.ts');const db=createDb();
 await saveInitialPlan(db,{income:100000,fixed:[],goals:[]});await saveCards(db,[{name:'Azul',closingDay:15,dueDay:25,includeClosingDay:true},{name:'Outro',closingDay:10,dueDay:5,includeClosingDay:false}]);await createMonth(db,'2026-11');
 const a={amount:1000,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'};
 await assert.rejects(addExpense(db,a,'2026-11-20'),/cartão/);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
 await addExpense(db,a,'2026-11-20',null,null,1);await addExpense(db,{...a,amount:500,date:'2026-11-15'},'2026-11-20',null,null,1);
 await addExpense(db,{...a,amount:700,date:'2026-11-16'},'2026-11-20',null,null,1);
 assert.deepEqual(db.sql.prepare('SELECT amount,due FROM debts ORDER BY due').all().map(x=>({...x})),[{amount:1500,due:'2026-11-25'},{amount:700,due:'2026-12-25'}]);
 const debt=db.sql.prepare("SELECT id,name,amount FROM debts WHERE due='2026-11-25'").get();
 await assert.rejects(addExpense(db,{amount:1500,date:'2026-11-20',location:debt.name,payment:'Crédito',category:'Fatura'},'2026-11-20',debt.id,null,2),/Pague a fatura/);
 await addExpense(db,{amount:1500,date:'2026-11-20',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-20',debt.id);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM bill_payments').get().n,1);
 await assert.rejects(addExpense(db,a,'2026-11-20',null,null,1),/já foi paga/);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM credit_charges').get().n,3);db.sql.close();
});
test('compras antigas só entram na fatura após escolha explícita',async()=>{
 const {saveCards,resolveLegacyCredit}=await import('../src/cards.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');
 db.sql.exec("INSERT INTO transactions(month_id,type,amount,date,name,payment,category) VALUES ('2026-11','expense',400,'2026-11-02','Loja','Crédito','Compras'),('2026-11','expense',600,'2026-11-03','Outra','Crédito','Compras')");
 assert.equal(db.sql.prepare('SELECT count(*) n FROM debts').get().n,0);
 await resolveLegacyCredit(db,1,{kind:'paid'});await resolveLegacyCredit(db,2,{kind:'unpaid',cardId:1,due:'2026-12-25'});
 assert.equal(db.sql.prepare('SELECT amount FROM debts').get().amount,600);
 await assert.rejects(resolveLegacyCredit(db,2,{kind:'paid'}),/já foi revisada/);db.sql.close();
});
test('compra no crédito só reduz livre ao pagar, sem duplicar gastos',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {cashSpend}=await import('../src/accounting.ts');const {freeToSpend}=await import('../src/finance.ts');const {readYearSummary}=await import('../src/repository.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');
 await addExpense(db,{amount:1000,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-20',null,null,1);
 let cash=await cashSpend(db,'2026-11');assert.equal(freeToSpend(10000,0,0,0,cash.direct,cash.bills,cash.billGoals,0),10000);
 let year=await readYearSummary(db,2026);assert.equal(year.summary.expenses,1000);assert.equal(year.summary.categories.Compras,1000);
 const debt=db.sql.prepare('SELECT id,name FROM debts').get();await addExpense(db,{amount:1000,date:'2026-11-20',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-20',debt.id);
 cash=await cashSpend(db,'2026-11');assert.equal(freeToSpend(10000,0,0,0,cash.direct,cash.bills,cash.billGoals,0),9000);
 year=await readYearSummary(db,2026);assert.equal(year.summary.expenses,1000);assert.equal(year.summary.categories.Fatura,undefined);db.sql.close();
});
test('pagamento da fatura respeita a caixinha original',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {cashSpend,goalSpentSql}=await import('../src/accounting.ts');const {freeToSpend}=await import('../src/finance.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:2000,target:null,rollover:true}]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');
 await addExpense(db,{amount:1000,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Lazer'},'2026-11-20',null,'goal-1',1);
 assert.equal(db.sql.prepare(`SELECT ${goalSpentSql} amount FROM month_envelopes me`).get().amount,0);
 const debt=db.sql.prepare('SELECT id,name FROM debts').get();await addExpense(db,{amount:1000,date:'2026-11-20',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-20',debt.id);
 assert.equal(db.sql.prepare(`SELECT ${goalSpentSql} amount FROM month_envelopes me`).get().amount,1000);
 const cash=await cashSpend(db,'2026-11');assert.equal(freeToSpend(10000,0,2000,0,cash.direct,cash.bills,cash.billGoals,0),8000);db.sql.close();
});
test('não fecha mês com compras antigas de crédito sem revisão',async()=>{
 const {closeMonth}=await import('../src/repository.ts');const {resolveLegacyCredit}=await import('../src/cards.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');
 db.sql.exec("INSERT INTO transactions(month_id,type,amount,date,name,payment,category) VALUES('2026-11','expense',100,'2026-11-01','Loja','Crédito','Outros')");
 await assert.rejects(closeMonth(db,'2026-11','2026-11-30'),/Revise/);assert.equal(db.sql.prepare("SELECT closed_at FROM months").get().closed_at,null);
 await resolveLegacyCredit(db,1,{kind:'paid'});await closeMonth(db,'2026-11','2026-11-30');assert.ok(db.sql.prepare('SELECT closed_at FROM months').get().closed_at);db.sql.close();
});
test('vencimento ajustado mantém novas compras na mesma fatura',async()=>{
 const {saveCards,setStatementDue}=await import('../src/cards.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');
 const expense={amount:500,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'};
 await addExpense(db,expense,'2026-11-15',null,null,1);await setStatementDue(db,1,'2026-11-26');await addExpense(db,{...expense,date:'2026-11-11'},'2026-11-15',null,null,1);
 assert.deepEqual({...db.sql.prepare('SELECT amount,due FROM debts').get()},{amount:1000,due:'2026-11-26'});assert.equal(db.sql.prepare('SELECT count(*) n FROM card_statements').get().n,1);
 await assert.rejects(setStatementDue(db,1,'2026-11-01'),/anterior/);db.sql.close();
});

test('backup preserva cartões, compras e pagamento da fatura',async()=>{
 const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const {saveCards}=await import('../src/cards.ts');const source=createDb();const target=createDb();target.execAsync=async q=>target.sql.exec(q);
 await saveInitialPlan(source,{income:10000,fixed:[],goals:[]});await saveCards(source,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(source,'2026-11');
 await addExpense(source,{amount:1000,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-20',null,null,1);
 const debt=source.sql.prepare('SELECT id,name FROM debts').get();await addExpense(source,{amount:1000,date:'2026-11-20',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-20',debt.id);
 const dump={};for(const table of names)dump[table]=source.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(row=>({...row}));
 await restoreBackup(target,validateDump({version:1,tables:dump}));
 for(const table of ['cards','card_statements','credit_charges','bill_payments'])assert.equal(target.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n,1);
 assert.equal(target.sql.prepare('SELECT amount FROM debts').get().amount,1000);source.sql.close();target.sql.close();
});

test('correções preservam vínculos de dívidas, crédito e mês fechado',async()=>{
 const {editTransaction,removeTransaction}=await import('../src/editTransaction.ts');const {saveCards}=await import('../src/cards.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');await addExpense(db,{amount:1000,date:'2026-11-02',location:'Loja',payment:'Pix',category:'Compras'},'2026-11-10');await editTransaction(db,1,{amount:2000,date:'2026-11-03',name:'Loja',category:'Compras'},'2026-11-10');assert.equal(db.sql.prepare('SELECT amount FROM transactions').get().amount,2000);await assert.rejects(editTransaction(db,1,{amount:100,date:'2026-12-01',name:'Loja',category:'Compras'},'2026-12-01'),/mesmo mês/);await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await addExpense(db,{amount:100,date:'2026-11-04',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1);await assert.rejects(removeTransaction(db,2),/cartão/);await removeTransaction(db,1);assert.equal(db.sql.prepare('SELECT count(*) n FROM transactions').get().n,1);db.sql.close();
});

test('pagamentos parciais deixam saldo correto e não duplicam categoria nem caixa',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {cashSpend}=await import('../src/accounting.ts');const {readYearSummary}=await import('../src/repository.ts');const {removeTransaction,editTransaction}=await import('../src/editTransaction.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');await addExpense(db,{amount:1000,date:'2026-11-02',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1);const debt=db.sql.prepare('SELECT id,name FROM debts').get();
 const pay={amount:400,date:'2026-11-03',location:debt.name,payment:'Pix',category:'Fatura'};await addExpense(db,pay,'2026-11-10',debt.id);assert.equal(db.sql.prepare('SELECT paid_transaction_id FROM debts').get().paid_transaction_id,null);assert.equal((await cashSpend(db,'2026-11')).bills,400);assert.equal((await readYearSummary(db,2026)).summary.expenses,1000);await assert.rejects(removeTransaction(db,2),/vinculado/);await assert.rejects(editTransaction(db,2,{amount:100,date:'2026-11-03',name:debt.name,category:'Fatura'},'2026-11-10'),/vinculado/);await assert.rejects(addExpense(db,{...pay,amount:601},'2026-11-10',debt.id),/maior/);await addExpense(db,{...pay,amount:600},'2026-11-10',debt.id);assert.ok(db.sql.prepare('SELECT paid_transaction_id FROM debts').get().paid_transaction_id);assert.equal((await cashSpend(db,'2026-11')).bills,1000);assert.equal((await readYearSummary(db,2026)).summary.expenses,1000);db.sql.close();
});
test('pagamentos parciais dividem fatura com caixinha sem duplicar',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {cashSpend,goalSpentSql}=await import('../src/accounting.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:2000,target:null,rollover:true}]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');await addExpense(db,{amount:600,date:'2026-11-02',location:'Loja',payment:'Crédito',category:'Lazer'},'2026-11-10',null,'goal-1',1);await addExpense(db,{amount:400,date:'2026-11-02',location:'Outro',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1);const debt=db.sql.prepare('SELECT id,name FROM debts').get();const pay={amount:500,date:'2026-11-03',location:debt.name,payment:'Pix',category:'Fatura'};await addExpense(db,pay,'2026-11-10',debt.id);assert.equal(db.sql.prepare(`SELECT ${goalSpentSql} amount FROM month_envelopes me`).get().amount,300);assert.equal((await cashSpend(db,'2026-11')).billGoals,300);await addExpense(db,pay,'2026-11-10',debt.id);assert.equal(db.sql.prepare(`SELECT ${goalSpentSql} amount FROM month_envelopes me`).get().amount,600);const totals=await cashSpend(db,'2026-11');assert.equal(totals.billGoals,600);assert.equal(totals.bills,1000);db.sql.close();
});

test('saldo informado deduz compromissos e fica desatualizado após mudanças',async()=>{
 const {saveCashSnapshot,cashOverview}=await import('../src/cashSnapshot.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');await addDebt(db,{name:'Conta',amount:2000,due:'2026-11-15',noticeDays:3});await saveCashSnapshot(db,{balance:10000,reserved:3000,date:'2026-11-06'});let state=await cashOverview(db);assert.equal(state.available,5000);assert.equal(state.stale,false);await addExpense(db,{amount:100,date:'2026-11-06',location:'Loja',payment:'Pix',category:'Compras'},'2026-11-06');state=await cashOverview(db);assert.equal(state.stale,true);db.sql.close();
});

test('backup com pagamento parcial restaura saldo e backup anterior continua aceito',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const source=createDb(),target=createDb();target.execAsync=async q=>target.sql.exec(q);await saveInitialPlan(source,{income:10000,fixed:[],goals:[]});await saveCards(source,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(source,'2026-11');await addExpense(source,{amount:1000,date:'2026-11-02',location:'Loja',payment:'Crédito',category:'Compra'},'2026-11-10',null,null,1);const debt=source.sql.prepare('SELECT id,name FROM debts').get();await addExpense(source,{amount:300,date:'2026-11-03',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-10',debt.id);
 const dump={};for(const table of names)dump[table]=source.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(row=>({...row}));await restoreBackup(target,validateDump({version:1,tables:dump}));assert.equal(target.sql.prepare('SELECT SUM(t.amount) n FROM bill_partial_payments p JOIN transactions t ON t.id=p.transaction_id').get().n,300);const old={...dump};delete old.bill_partial_payments;assert.deepEqual(validateDump({version:1,tables:old}).bill_partial_payments,[]);source.sql.close();target.sql.close();
});

test('conta prevista reduz saldo até ser paga e salário recebido não altera salário previsto',async()=>{
 const {setFixedStatus,setIncomeReceipt}=await import('../src/commitments.ts');const {cashOverview,saveCashSnapshot}=await import('../src/cashSnapshot.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[{name:'Aluguel',amount:2000}],goals:[]});await createMonth(db,'2026-11');const fixed=db.sql.prepare("SELECT id FROM transactions WHERE type='fixed'").get();await setFixedStatus(db,fixed.id,'prevista','2026-11-05',null,'2026-11-06');await saveCashSnapshot(db,{balance:10000,reserved:1000,date:'2026-11-06'});let view=await cashOverview(db);assert.equal(view.fixedTotal,2000);assert.equal(view.available,7000);await setFixedStatus(db,fixed.id,'paga','2026-11-05','2026-11-06','2026-11-06');view=await cashOverview(db);assert.equal(view.fixedTotal,0);assert.equal(view.stale,true);await setIncomeReceipt(db,'2026-11',9000,'2026-11-06','2026-11-06');assert.equal(db.sql.prepare('SELECT income FROM months').get().income,10000);assert.equal(db.sql.prepare('SELECT amount FROM income_receipts').get().amount,9000);await assert.rejects(setFixedStatus(db,fixed.id,'paga','2026-11-05','2026-12-01','2026-12-01'),/mês/);db.sql.close();
});

test('compra parcelada cria faturas futuras sem duplicar compra ou perder centavos',async()=>{
 const {saveCards,setStatementDue}=await import('../src/cards.ts');const {readYearSummary}=await import('../src/repository.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');await addExpense(db,{amount:1001,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1,3);assert.deepEqual(db.sql.prepare('SELECT amount,due FROM debts ORDER BY due').all().map(x=>({...x})),[{amount:334,due:'2026-11-25'},{amount:334,due:'2026-12-25'},{amount:333,due:'2027-01-25'}]);assert.equal(db.sql.prepare('SELECT SUM(amount) n FROM installment_charges').get().n,1001);assert.equal((await readYearSummary(db,2026)).summary.expenses,1001);await assert.rejects(setStatementDue(db,3,'2026-11-01'),/anterior/);await assert.rejects(addExpense(db,{amount:1,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1,2),/centavo/);assert.equal(db.sql.prepare('SELECT count(*) n FROM transactions').get().n,1);db.sql.close();
});

test('corrigir compra no crédito atualiza fatura e impede alteração após pagamento',async()=>{
 const {editTransaction}=await import('../src/editTransaction.ts');const {saveCards}=await import('../src/cards.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');await addExpense(db,{amount:1000,date:'2026-11-02',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-20',null,null,1);await editTransaction(db,1,{amount:1200,date:'2026-11-03',name:'Loja',category:'Compras'},'2026-11-20');assert.equal(db.sql.prepare('SELECT amount FROM debts').get().amount,1200);await assert.rejects(editTransaction(db,1,{amount:1200,date:'2026-11-16',name:'Loja',category:'Compras'},'2026-11-20'),/mesma fatura/);const debt=db.sql.prepare('SELECT id,name FROM debts').get();await addExpense(db,{amount:100,date:'2026-11-05',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-20',debt.id);await assert.rejects(editTransaction(db,1,{amount:1100,date:'2026-11-03',name:'Loja',category:'Compras'},'2026-11-20'),/pagamento/);db.sql.close();
});

test('backup conserva parcelas, rateios e situação de conta e salário',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {setFixedStatus,setIncomeReceipt}=await import('../src/commitments.ts');const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const source=createDb(),target=createDb();target.execAsync=async q=>target.sql.exec(q);await saveInitialPlan(source,{income:10000,fixed:[{name:'Conta',amount:500}],goals:[]});await saveCards(source,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(source,'2026-11');await setFixedStatus(source,1,'prevista','2026-11-12',null,'2026-11-10');await setIncomeReceipt(source,'2026-11',9000,'2026-11-10','2026-11-10');await addExpense(source,{amount:1001,date:'2026-11-10',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1,3);const dump={};for(const table of names)dump[table]=source.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(row=>({...row}));await restoreBackup(target,validateDump({version:1,tables:dump}));assert.equal(target.sql.prepare('SELECT count(*) n FROM installment_charges').get().n,3);assert.equal(target.sql.prepare('SELECT amount FROM income_receipts').get().amount,9000);assert.equal(target.sql.prepare('SELECT status FROM fixed_status').get().status,'prevista');source.sql.close();target.sql.close();
});

test('rateio parcial e quitação em outro mês não duplicam gasto na caixinha',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {cashSpend,goalSpentSql}=await import('../src/accounting.ts');const {closeMonth}=await import('../src/repository.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:1000,target:null,rollover:true}]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');await addExpense(db,{amount:600,date:'2026-11-02',location:'Loja',payment:'Crédito',category:'Lazer'},'2026-11-10',null,'goal-1',1);await addExpense(db,{amount:400,date:'2026-11-03',location:'Outro',payment:'Crédito',category:'Compras'},'2026-11-10',null,null,1);const debt=db.sql.prepare('SELECT id,name FROM debts').get();await addExpense(db,{amount:500,date:'2026-11-04',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-10',debt.id);await closeMonth(db,'2026-11','2026-11-30');await createMonth(db,'2026-12');await addExpense(db,{amount:500,date:'2026-12-01',location:debt.name,payment:'Pix',category:'Fatura'},'2026-12-01',debt.id);const rows=db.sql.prepare(`SELECT me.month_id,${goalSpentSql} spent FROM month_envelopes me ORDER BY me.month_id`).all().map(x=>({...x}));assert.deepEqual(rows,[{month_id:'2026-11',spent:300},{month_id:'2026-12',spent:300}]);assert.equal((await cashSpend(db,'2026-12')).billGoals,300);db.sql.close();
});

test('meta criada na aba inclui prazo sem alterar meses fechados',async()=>{const {createGoal}=await import('../src/goals.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2026-11');await createGoal(db,'2026-11',{name:'Monitor',target:30000,monthly:5000,due:'2026-12-01',rollover:true},'2026-11-10');assert.equal(db.sql.prepare('SELECT allocated FROM month_envelopes').get().allocated,5000);assert.equal(db.sql.prepare('SELECT due_date FROM goal_deadlines').get().due_date,'2026-12-01');await assert.rejects(createGoal(db,'2026-11',{name:'Outra',target:500,monthly:0,due:'2026-02-30',rollover:false},'2026-11-10'));assert.equal(db.sql.prepare('SELECT count(*) n FROM envelopes').get().n,1);db.sql.close()});
test('chave Pix da dívida é opcional e preservada no backup',async()=>{const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const source=createDb(),target=createDb();target.execAsync=async q=>target.sql.exec(q);await saveInitialPlan(source,{income:10000,fixed:[],goals:[]});await addDebt(source,{name:'Pessoa',amount:500,due:'2026-11-20',noticeDays:3},'chave@example.com');const dump={};for(const table of names)dump[table]=source.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(x=>({...x}));await restoreBackup(target,validateDump({version:1,tables:dump}));assert.equal(target.sql.prepare('SELECT pix_key FROM debt_pix').get().pix_key,'chave@example.com');source.sql.close();target.sql.close()});

test('backup preserva meta, Pix e investimento',async()=>{const {createGoal}=await import('../src/goals.ts');const {addInvestment}=await import('../src/investments.ts');const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const a=createDb(),b=createDb();b.execAsync=async q=>b.sql.exec(q);await saveInitialPlan(a,{income:10000,fixed:[],goals:[]});await createMonth(a,'2026-11');await createGoal(a,'2026-11',{name:'Meta',target:10000,monthly:100,due:'2026-12-30',rollover:true},'2026-11-01');await addInvestment(a,{name:'Carta',kind:'Colecionável',details:'Edição 1',cost:2000,value:3000,reminderAt:null});await addDebt(a,{name:'Pessoa',amount:200,due:'2026-11-20',noticeDays:3},'pix@exemplo.com');const dump={};for(const table of names)dump[table]=a.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(x=>({...x}));await restoreBackup(b,validateDump({version:1,tables:dump}));assert.equal(b.sql.prepare('SELECT name FROM investments').get().name,'Carta');assert.equal(b.sql.prepare('SELECT due_date FROM goal_deadlines').get().due_date,'2026-12-30');assert.equal(b.sql.prepare('SELECT pix_key FROM debt_pix').get().pix_key,'pix@exemplo.com');a.sql.close();b.sql.close()});


test('meta real começa com saldo informado e não aceita retirada maior',async()=>{const {recordGoalMovement}=await import('../src/goalMovements.ts');const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const db=createDb(),target=createDb();target.execAsync=async q=>target.sql.exec(q);await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Reserva',monthly:1000,target:5000,rollover:true}]});await createMonth(db,'2026-11');await assert.rejects(recordGoalMovement(db,'goal-1','deposit',100,'2026-11-03','2026-11-03'),/saldo inicial/);await recordGoalMovement(db,'goal-1','initial',0,'2026-11-03','2026-11-03');await recordGoalMovement(db,'goal-1','deposit',500,'2026-11-04','2026-11-04');await assert.rejects(recordGoalMovement(db,'goal-1','withdraw',501,'2026-11-04','2026-11-04'),/maior/);await recordGoalMovement(db,'goal-1','withdraw',200,'2026-11-05','2026-11-05');assert.equal(db.sql.prepare("SELECT SUM(CASE WHEN kind='withdraw' THEN -amount ELSE amount END) n FROM goal_movements").get().n,300);assert.equal(db.sql.prepare('SELECT allocated FROM month_envelopes').get().allocated,1000);const dump={};for(const table of names)dump[table]=db.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(r=>({...r}));await restoreBackup(target,validateDump({version:1,tables:dump}));assert.equal(target.sql.prepare('SELECT count(*) n FROM goal_movements').get().n,3);db.sql.close();target.sql.close()});

test('recorrência preserva dia 31, gera dívida uma vez e integra backup',async()=>{const {addRecurring,createRecurringDebt,advanceRecurring}=await import('../src/recurring.ts');const {names,tables,validateDump,restoreBackup}=await import('../src/backupData.ts');const {cashOverview}=await import('../src/cashSnapshot.ts');assert.equal(advanceRecurring('2028-01-31',1,31),'2028-02-29');assert.equal(advanceRecurring('2028-02-29',1,31),'2028-03-31');const db=createDb(),target=createDb();target.execAsync=async q=>target.sql.exec(q);await saveInitialPlan(db,{income:10000,fixed:[],goals:[]});await createMonth(db,'2028-01');await addRecurring(db,{name:'Seguro',amount:1000,due:'2028-01-31',interval:12,notice:3});assert.equal((await cashOverview(db)).recurringTotal,1000);await createRecurringDebt(db,1);assert.equal(db.sql.prepare('SELECT due FROM debts').get().due,'2028-01-31');assert.equal(db.sql.prepare('SELECT next_due FROM recurring_expenses').get().next_due,'2029-01-31');assert.equal(db.sql.prepare('SELECT count(*) n FROM recurring_occurrences').get().n,1);const dump={};for(const table of names)dump[table]=db.sql.prepare(`SELECT ${tables[table].join(',')} FROM ${table}`).all().map(x=>({...x}));await restoreBackup(target,validateDump({version:1,tables:dump}));assert.equal(target.sql.prepare('SELECT next_due FROM recurring_expenses').get().next_due,'2029-01-31');assert.equal(target.sql.prepare('SELECT count(*) n FROM debts').get().n,1);db.sql.close();target.sql.close()});

test('ano confirmado soma salário e pagamentos sem presumir fixas ou crédito',async()=>{const {actualYear}=await import('../src/actualYear.ts');const {setFixedStatus,setIncomeReceipt}=await import('../src/commitments.ts');const {saveCards}=await import('../src/cards.ts');const db=createDb();await saveInitialPlan(db,{income:10000,fixed:[{name:'Conta',amount:1000},{name:'Outra',amount:400}],goals:[]});await createMonth(db,'2026-11');await setFixedStatus(db,1,'paga','2026-11-05','2026-11-06','2026-11-06');await setIncomeReceipt(db,'2026-11',9000,'2026-11-06','2026-11-06');await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await addExpense(db,{amount:500,date:'2026-11-06',location:'Loja',payment:'Crédito',category:'Compras'},'2026-11-06',null,null,1);const debt=db.sql.prepare('SELECT id,name FROM debts').get();await addExpense(db,{amount:500,date:'2026-11-06',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-06',debt.id);const [row]=await actualYear(db,2026);assert.equal(row.salary,9000);assert.equal(row.paid,1500);assert.equal(row.unknown_fixed,1);db.sql.close()});

test('parcelas de caixinha distribuem pagamentos e podem ser corrigidas antes de pagar',async()=>{
 const {saveCards}=await import('../src/cards.ts');const {cashSpend,goalSpentSql}=await import('../src/accounting.ts');const {editTransaction}=await import('../src/editTransaction.ts');const db=createDb();
 await saveInitialPlan(db,{income:10000,fixed:[],goals:[{name:'Lazer',monthly:2000,target:null,rollover:true}]});await saveCards(db,[{name:'Cartão',closingDay:15,dueDay:25,includeClosingDay:true}]);await createMonth(db,'2026-11');
 await addExpense(db,{amount:1001,date:'2026-11-02',location:'Loja',payment:'Crédito',category:'Lazer'},'2026-11-10',null,'goal-1',1,3);
 await editTransaction(db,1,{amount:1004,date:'2026-11-03',name:'Loja',category:'Lazer'},'2026-11-10');assert.deepEqual(db.sql.prepare('SELECT amount FROM installment_charges ORDER BY installment_no').all().map(x=>x.amount),[335,335,334]);
 const debt=db.sql.prepare('SELECT id,name FROM debts ORDER BY due').get();await addExpense(db,{amount:167,date:'2026-11-04',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-10',debt.id);
 assert.equal(db.sql.prepare(`SELECT ${goalSpentSql} amount FROM month_envelopes me`).get().amount,167);assert.equal((await cashSpend(db,'2026-11')).billGoals,167);
 await assert.rejects(editTransaction(db,1,{amount:1100,date:'2026-11-03',name:'Loja',category:'Lazer'},'2026-11-10'),/pagamento/);
 await addExpense(db,{amount:168,date:'2026-11-05',location:debt.name,payment:'Pix',category:'Fatura'},'2026-11-10',debt.id);assert.equal(db.sql.prepare(`SELECT ${goalSpentSql} amount FROM month_envelopes me`).get().amount,335);assert.equal((await cashSpend(db,'2026-11')).billGoals,335);db.sql.close();
});
