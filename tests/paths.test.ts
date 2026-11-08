import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileUriForDirectory} from '../src/paths.ts';
test('converte diretório absoluto do SQLite para URI de arquivo',()=>{
 assert.equal(fileUriForDirectory('/data/user/0/br.com.financeiros.pessoal/files/SQLite'),'file:///data/user/0/br.com.financeiros.pessoal/files/SQLite');
 assert.equal(fileUriForDirectory('file:///data/SQLite'),'file:///data/SQLite');
 assert.equal(fileUriForDirectory('/data/my folder/SQLite'),'file:///data/my%20folder/SQLite');
 assert.throws(()=>fileUriForDirectory('relativo/SQLite'));
});
