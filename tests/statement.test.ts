import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatStatement} from '../src/statement.ts';
test('extrato ordena datas e formata apenas os lançamentos recebidos',()=>{
 assert.equal(formatStatement([{id:2,type:'extra',amount:123456,date:'2026-11-09',name:''},{id:1,type:'expense',amount:999,date:'2026-11-03',name:'Padaria'}]),'💵 Extrato Bancário 💵\n\nData: 03/11/2026\nLocal: Padaria\nValor: - R$ 9,99\n\nData: 09/11/2026\nLocal: Entrada fora do CLT\nValor: + R$ 1.234,56');
 assert.equal(formatStatement([{id:3,type:'extra',amount:1,date:'2026-11-02',name:'Freela'}]),'💵 Extrato Bancário 💵\n\nData: 02/11/2026\nLocal: Freela\nValor: + R$ 0,01');
});
