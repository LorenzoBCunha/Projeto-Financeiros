import React from 'react';

import { Pressable, Text, ScrollView } from './ui';

export default function SettingsScreen({name,showDetails,onName,onPlan,onCards,onDetails,onBackup,onGuide,onAbout,onAccessibility,onSecurity,onBack}:{name:string;showDetails:boolean;onName:()=>void;onPlan:()=>void;onCards:()=>void;onDetails:()=>void;onBackup:()=>void;onGuide:()=>void;onAbout:()=>void;onAccessibility:()=>void;onSecurity:()=>void;onBack:()=>void}) {
  const item=(title:string,action:()=>void)=><Pressable accessibilityRole="button" onPress={action} style={{paddingVertical:18,borderBottomWidth:1,borderBottomColor:'#1f1f1f'}}><Text style={{color:'#f2f2f2',fontFamily:'HankenGrotesk_400Regular',fontSize:16}}>{title}</Text></Pressable>;
  return <ScrollView style={{flex:1,backgroundColor:'#000',paddingHorizontal:24,paddingTop:16}}>
    <Text style={{color:'#f2f2f2',fontFamily:'HankenGrotesk_400Regular',fontSize:28,marginBottom:16}}>Configurações</Text>
    {item(`Nome: ${name}`,onName)}
    {item('Planejamento dos próximos meses',onPlan)}
    {item(showDetails?'Avisos: mostrando detalhes':'Avisos: texto discreto',onDetails)}
    {item('Cartões',onCards)}
    {item('Backup',onBackup)}
    {item('Segurança',onSecurity)}
    {item('Acessibilidade',onAccessibility)}
    {item('Guia do aplicativo',onGuide)}
    {item('Sobre',onAbout)}
    {item('Voltar',onBack)}
  </ScrollView>;
}
