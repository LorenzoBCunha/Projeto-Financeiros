import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../src/schema.ts';

test('esquema conserva mês fechado e resumo anual', () => {
 const db = new DatabaseSync(':memory:'); db.exec(SCHEMA);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fixed_templates').get().n, 0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM envelopes').get().n, 0);
 db.exec("INSERT INTO months VALUES ('2026-01',155130,NULL,NULL); INSERT INTO transactions(month_id,type,amount,date) VALUES ('2026-01','expense',100,'2026-01-01'); UPDATE months SET closed_at='2026-02-01' WHERE id='2026-01';");
 assert.throws(() => db.exec('DELETE FROM transactions'));
 db.exec("INSERT INTO annual_summaries VALUES (2026,'{}','2027-01-01')");
 assert.throws(() => db.exec('UPDATE annual_summaries SET data=\'x\''));
 db.close();
});
