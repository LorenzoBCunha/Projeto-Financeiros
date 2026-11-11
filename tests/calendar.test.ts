import test from 'node:test';
import assert from 'node:assert/strict';
import {dueEvent} from '../src/calendar.ts';

test('evento de vencimento com detalhes e aviso antecipado', () => {
  const e = dueEvent({name:'Joao',amount:30000,due:'2026-11-18',noticeDays:3}, true);
  assert.equal(e.title, 'Pagar: Joao');
  assert.equal(e.notes, 'Valor: R$ 300,00');
  assert.equal(e.startDate.getDate(), 18);
  assert.equal(e.startDate.getHours(), 9);
  assert.deepEqual(e.alarms, [{relativeOffset:-4320},{relativeOffset:0}]);
});

test('sem detalhes o valor não vai para o calendário', () => {
  const e = dueEvent({name:'Joao',amount:30000,due:'2026-11-18',noticeDays:0}, false);
  assert.equal(e.title, 'Pagar: Joao');
  assert.equal(e.notes, undefined);
  assert.deepEqual(e.alarms, [{relativeOffset:0}]);
});

test('data inválida é recusada', () => {
  assert.throws(() => dueEvent({name:'x',amount:1,due:'18/11/2026',noticeDays:0}, true));
});
