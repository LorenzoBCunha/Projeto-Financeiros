import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {NativeModules,Platform} from 'react-native';
import {pbkdf2Async} from '@noble/hashes/pbkdf2';
import {sha256} from '@noble/hashes/sha256';
import {utf8ToBytes} from '@noble/hashes/utils';
import {File} from 'expo-file-system';
import {SCHEMA} from './schema.ts';
import {restoreBackup,type Dump} from './backupData.ts';
import {fileUriForDirectory} from './paths.ts';
export const ALLOW_DEVICE_FALLBACK=false;
const ACTIVE='financeiros.active.v1',DEFAULT_KEY='financeiros.db.key.v1',DEFAULT_NAME='financeiros.db';
const VAULT='financeiros.pin.v1',BIO='financeiros.bio.v1',BIO_ENABLED='financeiros.bio.enabled.v1',BIO_SOURCE='financeiros.bio.source.v1',ATTEMPTS='financeiros.pin.attempts.v1';
const opts={requireAuthentication:true,authenticationPrompt:'Desbloquear seus dados'};
async function writeVerified(key:string,value:string){const native=NativeModules.FinanceirosPinKdf;let previous:string|null=null;if(Platform.OS==='android'){if(!native||typeof native.secureStoreRevision!=='function')throw new Error('A proteção de armazenamento não está disponível.');previous=await native.secureStoreRevision(key);}await SecureStore.setItemAsync(key,value);if(Platform.OS==='android'){const current=await native.secureStoreRevision(key);if(!current||current===previous)throw new Error('Não foi possível confirmar a gravação segura. Tente novamente.');}if(await SecureStore.getItemAsync(key)!==value)throw new Error('Não foi possível confirmar o armazenamento seguro. Tente novamente.');}
type Vault={version:1;id:string|null;salt:string;data:string};
let session:{id:string|null;key:string}|null=null;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function unhex(text:string){if(!/^(?:[a-f0-9]{2})+$/.test(text))throw new Error('Dados de acesso inválidos.');return Uint8Array.from(text.match(/../g)!,part=>parseInt(part,16));}
function checkPin(pin:string){if(!/^\d{6,12}$/.test(pin))throw new Error('Use um PIN de 6 a 12 dígitos.');}
function nameFor(id:string|null){if(id!==null&&!/^[a-f0-9]{32}$/.test(id))throw new Error('Referência do banco inválida. Os dados foram preservados.');return id?`financeiros-${id}.db`:DEFAULT_NAME;}
function keyNameFor(id:string|null){return id?`financeiros.key.${id}`:DEFAULT_KEY;}
async function derive(pin:string,salt:Uint8Array){
  let bytes:Uint8Array;
  if(Platform.OS==='android'){const native=NativeModules.FinanceirosPinKdf;if(!native||typeof native.derive!=='function')throw new Error('A proteção do PIN não está disponível nesta instalação.');let timer:ReturnType<typeof setTimeout>|undefined;let result:unknown;try{result=await Promise.race([native.derive(pin,hex(salt)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('O preparo do PIN demorou demais. Tente novamente ou use a biometria.')),30000)})]);}finally{if(timer)clearTimeout(timer);}if(typeof result!=='string'||!/^[a-f0-9]{64}$/.test(result))throw new Error('Não foi possível preparar o acesso seguro.');bytes=unhex(result);}
  else bytes=await pbkdf2Async(sha256,utf8ToBytes(pin),salt,{c:600000,dkLen:32,asyncTick:10});
  return Crypto.AESEncryptionKey.import(bytes);
}
async function wrap(id:string|null,key:string,pin:string):Promise<string>{checkPin(pin);nameFor(id);if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Chave inválida.');const salt=await Crypto.getRandomBytesAsync(16);const sealed=await Crypto.aesEncryptAsync(utf8ToBytes(key),await derive(pin,salt));return JSON.stringify({version:1,id,salt:hex(salt),data:await sealed.combined('base64')});}
class IncorrectPin extends Error {}
async function unwrap(text:string,pin:string):Promise<{id:string|null;key:string}>{checkPin(pin);let vault:Vault;try{vault=JSON.parse(text)}catch{throw new Error('Dados de acesso inválidos.');}if(!vault||vault.version!==1||!(vault.id===null||typeof vault.id==='string')||typeof vault.salt!=='string'||vault.salt.length!==32||typeof vault.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(vault.data))throw new Error('Dados de acesso inválidos.');nameFor(vault.id);const sealed=Crypto.AESSealedData.fromCombined(vault.data);const derived=await derive(pin,unhex(vault.salt));let bytes:Uint8Array;try{bytes=await Crypto.aesDecryptAsync(sealed,derived)}catch{throw new IncorrectPin('PIN incorreto.');}const key=new TextDecoder().decode(bytes);if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Dados de acesso inválidos.');return {id:vault.id,key};}

async function openEncrypted(name:string,key:string){if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Chave inválida. O banco existente foi preservado.');const db=await SQLite.openDatabaseAsync(name);try{const cipher=await db.getFirstAsync<{cipher_version:string}>('PRAGMA cipher_version');if(!cipher?.cipher_version)throw new Error('Criptografia do banco indisponível nesta versão.');await db.execAsync(`PRAGMA key = "x'${key}'"`);await db.getFirstAsync('SELECT count(*) FROM sqlite_master');return db;}catch(error){await db.closeAsync();throw error;}}
async function randomKey(){return hex(await Crypto.getRandomBytesAsync(32));}
export function clearSecuritySession(){session=null;}
export async function accessState(){const vault=await SecureStore.getItemAsync(VAULT);const enabled=(await SecureStore.getItemAsync(BIO_ENABLED))==='1';if(vault)return {mode:'pin' as const,biometric:enabled};if(enabled)return {mode:'biometric' as const,biometric:true};const id=await SecureStore.getItemAsync(ACTIVE);const name=nameFor(id);const exists=new File(fileUriForDirectory(SQLite.defaultDatabaseDirectory),name).exists;return {mode:exists||id?'legacy' as const:'new' as const,biometric:false};}
export async function initializePin(pin:string){checkPin(pin);if(await SecureStore.getItemAsync(VAULT))throw new Error('O PIN já está configurado.');const state=await accessState();if(state.mode==='biometric')throw new Error('Entre com biometria e cadastre o PIN nas configurações.');const id=await SecureStore.getItemAsync(ACTIVE);nameFor(id);let key:string;if(state.mode==='legacy'){const existing=await SecureStore.getItemAsync(keyNameFor(id),opts);if(!existing)throw new Error('Chave antiga indisponível. O banco foi preservado.');key=existing;const db=await openEncrypted(nameFor(id),key);await db.closeAsync();}else{if(id)throw new Error('Banco existente requer recuperação.');key=await randomKey();}const vault=await wrap(id,key,pin);const checked=await unwrap(vault,pin);if(checked.key!==key||checked.id!==id)throw new Error('Não foi possível verificar o PIN.');await writeVerified(VAULT,vault);}
async function attempts(){const value=await SecureStore.getItemAsync(ATTEMPTS);if(!value)return {count:0,until:0};let obj:{count:unknown;until:unknown};try{obj=JSON.parse(value)}catch{throw new Error('Não foi possível verificar as tentativas de acesso.');}if(!Number.isSafeInteger(obj?.count)||Number(obj.count)<0||!Number.isFinite(obj?.until)||Number(obj.until)<0)throw new Error('Não foi possível verificar as tentativas de acesso.');return {count:Number(obj.count),until:Number(obj.until)};}
export async function unlockDatabase(pin:string){const vault=await SecureStore.getItemAsync(VAULT);if(!vault)throw new Error('Cadastre um PIN para continuar.');const status=await attempts();if(status.until>Date.now())throw new Error(`Aguarde ${Math.ceil((status.until-Date.now())/1000)} segundos antes de tentar novamente.`);let access:{id:string|null;key:string};try{access=await unwrap(vault,pin)}catch(error){if(!(error instanceof IncorrectPin))throw error;const count=status.count+1;const until=count>=5?Date.now()+Math.min(300000,30000*Math.pow(2,Math.min(4,Math.floor((count-5)/5)))):0;await writeVerified(ATTEMPTS,JSON.stringify({count,until}));throw new Error(until?'PIN incorreto. Aguarde antes de tentar novamente.':'PIN incorreto ou dados de acesso indisponíveis.');}const db=await openEncrypted(nameFor(access.id),access.key);try{await SecureStore.deleteItemAsync(ATTEMPTS)}catch(error){await db.closeAsync();throw error;}session=access;return db;}
async function storeBiometricAccess(access:{id:string|null;key:string}){
 const source=`financeiros.bio.${Crypto.randomUUID().replace(/-/g,'').toLowerCase()}`;
 const serialized=JSON.stringify(access);await SecureStore.setItemAsync(source,serialized,opts);
 if(Platform.OS==='android'){const native=NativeModules.FinanceirosPinKdf;if(!native||typeof native.hasProtectedValue!=='function'||!await native.hasProtectedValue(source))throw new Error('Não foi possível confirmar o armazenamento biométrico.');}
 else if(await SecureStore.getItemAsync(source,opts)!==serialized)throw new Error('Não foi possível confirmar o armazenamento biométrico.');
 await writeVerified(BIO_SOURCE,source);await writeVerified(BIO_ENABLED,'1');
}
export async function unlockBiometric(){
 const enabled=(await SecureStore.getItemAsync(BIO_ENABLED))==='1';
 if(enabled){const source=await SecureStore.getItemAsync(BIO_SOURCE);let access:{id:string|null;key:string};
  if(source==='legacy'){const id=await SecureStore.getItemAsync(ACTIVE);nameFor(id);const key=await SecureStore.getItemAsync(keyNameFor(id),opts);if(!key)throw new Error('Biometria indisponível. Use seu PIN ou restaure um backup.');access={id,key};}
  else{if(source!==null&&!/^financeiros\.bio\.[a-f0-9]{32}$/.test(source))throw new Error('Referência biométrica inválida. Use seu PIN.');const value=await SecureStore.getItemAsync(source??BIO,opts);if(!value)throw new Error('Biometria indisponível. Use seu PIN ou restaure um backup.');try{access=JSON.parse(value)}catch{throw new Error('Biometria indisponível. Use seu PIN.');}}
  const db=await openEncrypted(nameFor(access.id),access.key);session=access;return db;
 }
 const vaultText=await SecureStore.getItemAsync(VAULT);let vaultId:string|null=null;
 if(vaultText){try{const vault=JSON.parse(vaultText) as Vault;if(vault.version!==1)throw Error();vaultId=vault.id;nameFor(vaultId)}catch{throw new Error('Dados de acesso inválidos. Use seu PIN.');}}
 const legacyId=await SecureStore.getItemAsync(ACTIVE);nameFor(legacyId);
 if(vaultText&&vaultId!==legacyId)throw new Error('Entre com seu PIN e ative a biometria nas configurações.');
 const name=nameFor(legacyId);const exists=new File(fileUriForDirectory(SQLite.defaultDatabaseDirectory),name).exists;
 if(exists||legacyId){const key=await SecureStore.getItemAsync(keyNameFor(legacyId),opts);if(!key)throw new Error('Entre com seu PIN e ative a biometria nas configurações.');const db=await openEncrypted(name,key);try{await writeVerified(BIO_SOURCE,'legacy');await writeVerified(BIO_ENABLED,'1');}catch(error){await db.closeAsync();throw error;}session={id:legacyId,key};return db;}
 if(vaultText)throw new Error('Entre com seu PIN e ative a biometria nas configurações.');const access={id:legacyId,key:await randomKey()};await storeBiometricAccess(access);const db=await openEncrypted(name,access.key);session=access;return db;
}
export async function pinConfigured(){return !!(await SecureStore.getItemAsync(VAULT));}
export async function configurePinForSession(pin:string){checkPin(pin);if(await pinConfigured())throw new Error('Já existe um PIN cadastrado.');if(!session)throw new Error('Entre no aplicativo para cadastrar um PIN.');const access=session;const vault=await wrap(access.id,access.key,pin);const checked=await unwrap(vault,pin);if(checked.id!==access.id||checked.key!==access.key)throw new Error('Não foi possível verificar o PIN.');await writeVerified(VAULT,vault);}

export async function biometricEnabled(){return (await SecureStore.getItemAsync(BIO_ENABLED))==='1';}
export async function setBiometricEnabled(enabled:boolean){if(!enabled){if(!await pinConfigured())throw new Error('Cadastre um PIN antes de desativar a biometria.');await writeVerified(BIO_ENABLED,'0');return;}if(!session)throw new Error('Desbloqueie o aplicativo com seu PIN primeiro.');await storeBiometricAccess(session);}
export async function recoverFromBackup(dump:Dump,pin:string):Promise<void>{checkPin(pin);const id=Crypto.randomUUID().replace(/-/g,'').toLowerCase();const name=nameFor(id);if(new File(fileUriForDirectory(SQLite.defaultDatabaseDirectory),name).exists)throw new Error('Não foi possível criar um banco separado.');const key=await randomKey();const db=await openEncrypted(name,key);try{await db.execAsync(SCHEMA);await restoreBackup(db,dump);}finally{await db.closeAsync();}const vault=await wrap(id,key,pin);const checked=await unwrap(vault,pin);if(checked.id!==id||checked.key!==key)throw new Error('Não foi possível verificar o novo PIN.');await writeVerified(BIO_ENABLED,'0');await writeVerified(VAULT,vault);await SecureStore.deleteItemAsync(ATTEMPTS);}
