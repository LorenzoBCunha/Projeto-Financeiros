import React,{useState} from 'react';
import {Alert} from 'react-native';
import Svg from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import type {SQLiteDatabase} from 'expo-sqlite';
import {Path,Pressable,Text,View} from './ui';
import {prepareNotificationChannel} from './notifications';

const FONT='HankenGrotesk_400Regular',BOLD='HankenGrotesk_600SemiBold';

// Pergunta uma vez, no primeiro acesso, se a pessoa quer lembretes. A resposta fica em settings.
export default function NotificationsPromptScreen({db,onDone}:{db:SQLiteDatabase;onDone:()=>void}) {
  const [busy,setBusy]=useState(false);
  async function answer(allow:boolean) {
    if (busy) return;
    setBusy(true);
    try {
      let result='declined';
      if (allow) {
        try {await prepareNotificationChannel();result=(await Notifications.requestPermissionsAsync()).granted?'granted':'denied';}
        catch {result='unavailable';}
      }
      await db.runAsync("INSERT INTO settings(key,value) VALUES('notifications_prompted',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",result);
      onDone();
    } catch(error) {Alert.alert('Não foi possível salvar',error instanceof Error?error.message:'Tente novamente.');}
    finally {setBusy(false);}
  }
  return <View style={{flex:1,backgroundColor:'#000',justifyContent:'center',paddingHorizontal:28}}>
    <View style={{alignItems:'center',marginBottom:34}}>
      <View style={{width:76,height:76,borderRadius:38,backgroundColor:'#141414',borderWidth:1,borderColor:'#2a2a2a',alignItems:'center',justifyContent:'center',marginBottom:20}}>
        <Svg width={34} height={34} viewBox="0 0 24 24" fill="none"><Path stroke="#f2f2f2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></Svg>
      </View>
      <Text style={{color:'#f2f2f2',fontFamily:BOLD,fontSize:28,textAlign:'center'}}>Receber lembretes?</Text>
      <Text style={{color:'#8a8a8a',fontFamily:FONT,fontSize:15,marginTop:12,textAlign:'center',lineHeight:22}}>O Financeiros pode avisar quando uma dívida ou fatura estiver perto de vencer, sobre prazos de metas e lembretes de backup. Os avisos são criados neste aparelho; nenhuma informação sai dele.</Text>
    </View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void answer(true)} style={{borderRadius:14,paddingVertical:16,alignItems:'center',backgroundColor:'#f2f2f2'}}><Text style={{color:'#000',fontFamily:BOLD,fontSize:16}}>Permitir lembretes</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void answer(false)} style={{borderRadius:14,paddingVertical:16,alignItems:'center',marginTop:10,backgroundColor:'#141414',borderWidth:1,borderColor:'#2a2a2a'}}><Text style={{color:'#f2f2f2',fontFamily:FONT,fontSize:16}}>Agora não</Text></Pressable>
    <Text style={{color:'#8a8a8a',fontFamily:FONT,fontSize:13,marginTop:18,textAlign:'center'}}>Você pode mudar isso depois nas configurações do aparelho.</Text>
  </View>;
}
