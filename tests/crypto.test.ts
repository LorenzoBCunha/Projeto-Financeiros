import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {pbkdf2Async} from '@noble/hashes/pbkdf2';
import {sha256} from '@noble/hashes/sha256';
import {utf8ToBytes} from '@noble/hashes/utils';
test('derivação de senha é compatível com PBKDF2-SHA256',async()=>{
 const password='senha de teste';const salt=Uint8Array.from({length:16},(_,i)=>i);
 const actual=await pbkdf2Async(sha256,utf8ToBytes(password),salt,{c:600000,dkLen:32,asyncTick:10});
 assert.deepEqual(Buffer.from(actual),pbkdf2Sync(password,salt,600000,32,'sha256'));
});
