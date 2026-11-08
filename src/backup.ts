import * as Crypto from 'expo-crypto';
import {pbkdf2Async} from '@noble/hashes/pbkdf2';
import {sha256} from '@noble/hashes/sha256';
import {utf8ToBytes} from '@noble/hashes/utils';
import type {SQLiteDatabase} from 'expo-sqlite';

import {names, tables, validateDump, type Dump, type Cell} from './backupData';
const toHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=(text:string)=>{if(!/^(?:[a-f0-9]{2})+$/.test(text)) throw new Error('Arquivo de backup inválido.');return Uint8Array.from(text.match(/../g)!,pair=>parseInt(pair,16));};
async function keyFor(password:string,salt:Uint8Array) {return Crypto.AESEncryptionKey.import(await pbkdf2Async(sha256,utf8ToBytes(password),salt,{c:600000,dkLen:32,asyncTick:10}));}
export async function exportBackup(db:SQLiteDatabase,password:string):Promise<string> {
  if (password.length<8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
  const dump={} as Dump;
  await db.withTransactionAsync(async()=>{
    for (const table of names) dump[table]=await db.getAllAsync<Record<string,Cell>>(`SELECT ${tables[table].join(',')} FROM ${table}`);
  });
  dump.settings=dump.settings.filter(row=>row.key!=='backup_reminder_id');
  for (const recurring of dump.recurring_expenses) recurring.notification_id=null;
  for (const debt of dump.debts) debt.notification_id=null;
  for (const investment of dump.investments) investment.notification_id=null;
  for (const goal of dump.goal_deadlines) goal.notification_id=null;
  const salt=await Crypto.getRandomBytesAsync(16);
  const sealed=await Crypto.aesEncryptAsync(utf8ToBytes(JSON.stringify({version:1,tables:dump})),await keyFor(password,salt));
  return JSON.stringify({format:'financeiros-backup',version:1,salt:toHex(salt),data:await sealed.combined('base64')});
}
export async function decryptBackup(text:string,password:string):Promise<Dump> {
  if (text.length>10_000_000) throw new Error('Arquivo de backup muito grande.');
  let envelope:{format?:unknown;version?:unknown;salt?:unknown;data?:unknown};
  try {envelope=JSON.parse(text);} catch {throw new Error('Arquivo de backup inválido.');}
  if (!envelope || envelope.format!=='financeiros-backup' || envelope.version!==1 || typeof envelope.salt!=='string' || envelope.salt.length!==32 || typeof envelope.data!=='string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.data)) throw new Error('Arquivo de backup inválido.');
  try {
    const sealed=Crypto.AESSealedData.fromCombined(envelope.data);
    const bytes=await Crypto.aesDecryptAsync(sealed,await keyFor(password,fromHex(envelope.salt)));
    return validateDump(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {throw new Error('Senha incorreta ou arquivo de backup inválido.');}
}


