import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardCycle} from '../src/cards.ts';
test('ciclo respeita fechamento, vencimento e dia do fechamento',()=>{
 assert.deepEqual(cardCycle('2026-11-10',15,25,false),{closing:'2026-11-15',due:'2026-11-25'});
 assert.deepEqual(cardCycle('2026-11-15',15,25,true),{closing:'2026-11-15',due:'2026-11-25'});
 assert.deepEqual(cardCycle('2026-11-15',15,25,false),{closing:'2026-12-15',due:'2026-12-25'});
 assert.deepEqual(cardCycle('2026-12-21',20,10,false),{closing:'2027-01-20',due:'2027-02-10'});
 assert.deepEqual(cardCycle('2028-02-28',31,10,true),{closing:'2028-02-29',due:'2028-03-10'});
 assert.deepEqual(cardCycle('2027-02-28',30,31,true),{closing:'2027-02-28',due:'2027-03-31'});
 assert.throws(()=>cardCycle('2026-02-30',15,25,true));assert.throws(()=>cardCycle('2026-02-10',0,25,true));
});
