import { test } from 'node:test';
import assert from 'node:assert/strict';
import { margin, money, validateExpense, debtNotificationDate, nextMonth, rollEnvelopes, summarizeYear } from '../src/finance.ts';

test('valores inteiros e margem do plano', () => {
  const boxes = [25000,25000,18000,12000].map(monthly => ({name:'',monthly,rollover:false,balance:0}));
  assert.equal(margin(155130,[57805],boxes),17325);
  assert.throws(() => money(1.5));
});
test('gasto exige todos os campos e data válida sem futuro', () => {
  assert.equal(validateExpense({amount:0,date:'2026-02-30',location:' ',payment:'',category:''}, '2026-03-01').length,5);
  assert.equal(validateExpense({amount:100,date:'2026-03-02',location:'Loja',payment:'Pix',category:'Outros'}, '2026-03-01').length,1);
  assert.equal(validateExpense({amount:100,date:'2026-03-01',location:'Loja',payment:'Pix',category:'Outros'}, '2026-03-01').length,0);
});
test('aviso de dívida e virada entre anos', () => {
  assert.equal(debtNotificationDate({name:'Ana',amount:100,due:'2027-01-02',noticeDays:3}),'2026-12-30');
  assert.throws(() => debtNotificationDate({name:'',amount:1,due:'2026-01-01',noticeDays:3}));
  assert.equal(nextMonth('2026-12'),'2027-01');
});
test('rolagem só das caixinhas configuradas', () => {
  assert.deepEqual(rollEnvelopes([{name:'Lazer',monthly:18000,balance:3000,rollover:true},{name:'Compras',monthly:12000,balance:4000,rollover:false}]).map(e=>e.balance),[21000,12000]);
});
test('resumo anual agrega meses e identifica extremos', () => {
  const year = summarizeYear(2026,[{month:'2026-01',clt:10000,extra:100,expenses:400,categories:{Comida:400},saved:{Reserva:1000}},{month:'2026-02',clt:10000,extra:0,expenses:200,categories:{Comida:200},saved:{Reserva:1000}},{month:'2027-01',clt:1,extra:0,expenses:1,categories:{},saved:{}}]);
  assert.equal(year.income,20100); assert.equal(year.categories.Comida,600); assert.equal(year.saved.Reserva,2000); assert.equal(year.leastSpent,'2026-02'); assert.equal(year.mostSpent,'2026-01');
});

test('datas de aviso válidas incluem dia do vencimento e ano bissexto',()=>{
 assert.equal(debtNotificationDate({name:'Pessoa',amount:100,due:'2028-03-01',noticeDays:1}),'2028-02-29');
 assert.equal(debtNotificationDate({name:'Pessoa',amount:100,due:'2026-11-06',noticeDays:0}),'2026-11-06');
 assert.equal(debtNotificationDate({name:'Pessoa',amount:100,due:'2026-01-03',noticeDays:7}),'2025-12-27');
 assert.throws(()=>debtNotificationDate({name:'Pessoa',amount:100,due:'2026-02-29',noticeDays:1}));
});
test('entradas livres aumentam a margem em centavos',async()=>{
 const {budgetMargin}=await import('../src/finance.ts');assert.equal(budgetMargin(155130,57805,80000,1500),18825);assert.throws(()=>budgetMargin(1,0,0,0.5));
});
