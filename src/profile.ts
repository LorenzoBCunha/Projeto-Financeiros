import type {SQLiteDatabase} from 'expo-sqlite';

export function validateUserName(value:string):string {
  const name=value.trim();
  if (!name || name.length>80) throw new Error('Informe seu nome com até 80 caracteres.');
  return name;
}
export async function saveUserName(db:SQLiteDatabase,value:string) {
  const name=validateUserName(value);
  await db.runAsync("INSERT INTO settings(key,value) VALUES('user_name',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",name);
  return name;
}
