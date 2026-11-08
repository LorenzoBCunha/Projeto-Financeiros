import type {SQLiteDatabase} from 'expo-sqlite';
import type {InitialPlan} from './onboarding';

export type EditablePlan = Omit<InitialPlan, 'goals'> & {goals:(InitialPlan['goals'][number] & {id?:string})[]};
export async function saveNextPlan(db:SQLiteDatabase, plan:EditablePlan) {
  if (!Number.isSafeInteger(plan.income) || plan.income<0) throw new Error('Informe um salário válido.');
  for (const item of plan.fixed) if (!item.name.trim() || !Number.isSafeInteger(item.amount) || item.amount<=0) throw new Error('Informe nome e valor de cada despesa.');
  for (const item of plan.goals) if (!item.name.trim() || !Number.isSafeInteger(item.monthly) || item.monthly<=0 || (item.target!==null && (!Number.isSafeInteger(item.target) || item.target<=0))) throw new Error('Informe os dados válidos de cada meta.');
  const fixedNames=plan.fixed.map(item=>item.name.trim().toLocaleLowerCase('pt-BR'));
  const goalNames=plan.goals.map(item=>item.name.trim().toLocaleLowerCase('pt-BR'));
  if (new Set(fixedNames).size!==fixedNames.length || new Set(goalNames).size!==goalNames.length) throw new Error('Use nomes diferentes para cada despesa e para cada meta.');
  await db.withTransactionAsync(async()=>{
    await db.runAsync("INSERT INTO settings(key,value) VALUES('monthly_income',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(plan.income));
    await db.runAsync('DELETE FROM fixed_templates');
    for (const item of plan.fixed) await db.runAsync('INSERT INTO fixed_templates(name,amount) VALUES(?,?)',item.name.trim(),item.amount);
    await db.runAsync('UPDATE envelopes SET active=0');
    for (const item of plan.goals) {
      if (item.id) {
        const updated=await db.runAsync('UPDATE envelopes SET name=?,monthly=?,target=?,rollover=?,active=1 WHERE id=?',item.name.trim(),item.monthly,item.target,item.rollover?1:0,item.id);
        if (!updated.changes) throw new Error('Meta não encontrada.');
      } else {
        const generated=await db.getFirstAsync<{id:string}>('SELECT lower(hex(randomblob(16))) AS id');
        if (!generated) throw new Error('Não foi possível criar a meta.');
        await db.runAsync('INSERT INTO envelopes(id,name,monthly,target,rollover,active) VALUES(?,?,?,?,?,1)',generated.id,item.name.trim(),item.monthly,item.target,item.rollover?1:0);
      }
    }
  });
}
export async function setMonthIncome(db:SQLiteDatabase,month:string,value:number) {
  if (!Number.isSafeInteger(value) || value<0) throw new Error('Informe um salário válido.');
  const result=await db.runAsync('UPDATE months SET income=? WHERE id=? AND closed_at IS NULL',value,month);
  if (!result.changes) throw new Error('Mês fechado ou inexistente.');
}

