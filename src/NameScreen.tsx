import React,{useState} from 'react';
import { Alert } from 'react-native';
import { Pressable, Text, TextInput, View } from './ui';
import type {SQLiteDatabase} from 'expo-sqlite';
import {saveUserName} from './profile';

export default function NameScreen({db,initialName,onComplete,onCancel}:{db:SQLiteDatabase;initialName?:string;onComplete:(name:string)=>void;onCancel?:()=>void}) {
  const [name,setName]=useState(initialName??'');
  const [busy,setBusy]=useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    try {onComplete(await saveUserName(db,name));}
    catch(error) {Alert.alert('Confira seu nome',error instanceof Error?error.message:'Não foi possível salvar.');}
    finally {setBusy(false);}
  }
  return <View style={{flex:1,backgroundColor:'#000',padding:24,paddingTop:58}}>
    <Text style={{color:'#f2f2f2',fontFamily:'HankenGrotesk_400Regular',fontSize:28}}>Como podemos chamar você?</Text>
    <Text style={{color:'#8a8a8a',fontFamily:'HankenGrotesk_400Regular',marginTop:10}}>Seu nome fica somente neste aparelho.</Text>
    <TextInput accessibilityLabel="Seu nome" maxLength={80} autoCapitalize="words" value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor="#8a8a8a" style={{color:'#f2f2f2',fontFamily:'HankenGrotesk_400Regular',fontSize:16,borderBottomWidth:1,borderBottomColor:'#1f1f1f',marginTop:24,paddingVertical:12}}/>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()} style={{borderWidth:1,borderColor:'#f2f2f2',marginTop:28,padding:16,alignItems:'center'}}><Text style={{color:'#f2f2f2',fontFamily:'HankenGrotesk_400Regular'}}>{busy?'Salvando…':'Continuar'}</Text></Pressable>
    {onCancel && <Pressable accessibilityRole="button" onPress={onCancel} style={{paddingVertical:20}}><Text style={{color:'#8a8a8a',fontFamily:'HankenGrotesk_400Regular'}}>Cancelar</Text></Pressable>}
  </View>;
}
