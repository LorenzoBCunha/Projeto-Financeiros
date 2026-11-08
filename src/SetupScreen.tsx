import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from './ui';
import type { SQLiteDatabase } from 'expo-sqlite';
import { parseMoney, saveInitialPlan } from './onboarding';
import { saveNextPlan, type EditablePlan } from './plan';
import {validateUserName} from './profile';

type Fixed = {name:string; amount:string};
type Goal = {id?:string;name:string; monthly:string; target:string; rollover:boolean};
const text = {color:'#f2f2f2',fontSize:16,fontFamily:'HankenGrotesk_400Regular'} as const;
const field = {color:'#f2f2f2',borderBottomWidth:1,borderBottomColor:'#1f1f1f',paddingVertical:12,fontSize:16,fontFamily:'HankenGrotesk_400Regular',fontVariant:['tabular-nums']} as const;
function Input({label,value,onChangeText,money=false}:{label:string;value:string;onChangeText:(value:string)=>void;money?:boolean}) {
  return <View style={{marginVertical:8}}><Text style={{color:'#8a8a8a',fontSize:13,fontFamily:'HankenGrotesk_400Regular'}}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#8a8a8a" style={field} value={value} onChangeText={onChangeText} keyboardType={money?'decimal-pad':'default'} /></View>;
}
function Action({label,onPress}:{label:string;onPress:()=>void}) { return <Pressable accessibilityRole="button" onPress={onPress} style={{paddingVertical:14}}><Text style={text}>{label}</Text></Pressable>; }
const moneyInput=(value:number)=>(value/100).toFixed(2).replace('.',',');
export default function Onboarding({db,onComplete,existing}:{db:SQLiteDatabase;onComplete:()=>void;existing?:EditablePlan}) {
  const [userName,setUserName]=useState('');
  const [income,setIncome]=useState(existing?moneyInput(existing.income):'');
  const [fixed,setFixed]=useState<Fixed[]>(existing?.fixed.map(item=>({name:item.name,amount:moneyInput(item.amount)}))??[]);
  const [goals,setGoals]=useState<Goal[]>(existing?.goals.map(item=>({id:item.id,name:item.name,monthly:moneyInput(item.monthly),target:item.target===null?'':moneyInput(item.target),rollover:item.rollover}))??[]);
  const [busy,setBusy]=useState(false);
  async function save() {
    if (busy) return;
    if (!existing) { try { validateUserName(userName); } catch(error) { Alert.alert('Confira seu nome',error instanceof Error?error.message:'Informe seu nome.'); return; } }
    const salary=parseMoney(income);
    if (salary===null) { Alert.alert('Confira o salário','Informe um valor válido, por exemplo 1551,30.'); return; }
    const expenses=fixed.map(item=>({name:item.name,amount:parseMoney(item.amount)}));
    const boxes=goals.map(item=>({id:item.id,name:item.name,monthly:parseMoney(item.monthly),target:item.target.trim() ? parseMoney(item.target) : null,rollover:item.rollover,invalidTarget:!!item.target.trim() && parseMoney(item.target)===null}));
    if (expenses.some(item=>item.amount===null) || boxes.some(item=>item.monthly===null || item.invalidTarget)) { Alert.alert('Confira os valores','Preencha os valores das despesas e metas adicionadas.'); return; }
    const plan={income:salary,fixed:expenses.map(item=>({name:item.name,amount:item.amount!})),goals:boxes.map(item=>({id:item.id,name:item.name,monthly:item.monthly!,target:item.target,rollover:item.rollover}))};
    const margin=salary-plan.fixed.reduce((sum,item)=>sum+item.amount,0)-plan.goals.reduce((sum,item)=>sum+item.monthly,0);
    const commit=async()=>{ setBusy(true); try { if (existing) await saveNextPlan(db,plan); else await saveInitialPlan(db,plan,userName); onComplete(); } catch(error) { Alert.alert('Não foi possível salvar',error instanceof Error?error.message:'Tente novamente.'); } finally {setBusy(false);} };
    if (margin<0) Alert.alert('Planejamento acima da renda',`As despesas e metas passam o salário em R$ ${(Math.abs(margin)/100).toFixed(2).replace('.',',')}. Você pode ajustar agora ou continuar.`,[{text:'Ajustar',style:'cancel'},{text:'Continuar',onPress:()=>void commit()}]); else await commit();
  }
  return <ScrollView style={{flex:1,backgroundColor:'#000'}} contentContainerStyle={{padding:24,paddingTop:58,paddingBottom:48}} keyboardShouldPersistTaps="handled">
    <Text style={{color:'#8a8a8a',fontSize:13,fontFamily:'HankenGrotesk_400Regular'}}>FINANCEIROS</Text><Text style={{color:'#f2f2f2',fontSize:30,fontFamily:'HankenGrotesk_400Regular',marginTop:16}}>{existing?'Planejamento futuro':'Seu ponto de partida'}</Text>
    <Text style={{color:'#8a8a8a',fontFamily:'HankenGrotesk_400Regular',marginTop:8,lineHeight:21}}>{existing?'As alterações valem a partir do próximo mês.':'Informe seu nome e salário. Você pode incluir despesas fixas e metas agora ou continuar sem elas.'}</Text>
    {!existing && <Input label="Seu nome" value={userName} onChangeText={setUserName} />}
    <Input label="Salário líquido mensal (R$)" value={income} onChangeText={setIncome} money />
    <Text style={{...text,marginTop:28}}>Despesas fixas</Text>
    {fixed.map((item,index)=><View key={index} style={{borderBottomColor:'#1f1f1f',borderBottomWidth:1,paddingBottom:8}}><Input label="Nome da despesa" value={item.name} onChangeText={v=>setFixed(fixed.map((x,i)=>i===index?{...x,name:v}:x))}/><Input label="Valor mensal (R$)" value={item.amount} onChangeText={v=>setFixed(fixed.map((x,i)=>i===index?{...x,amount:v}:x))} money/><Action label="Remover despesa" onPress={()=>setFixed(fixed.filter((_,i)=>i!==index))}/></View>)}
    <Action label="+ Adicionar despesa fixa" onPress={()=>setFixed([...fixed,{name:'',amount:''}])}/>
    <Text style={{...text,marginTop:28}}>Metas e caixinhas</Text>
    {goals.map((item,index)=><View key={index} style={{borderBottomColor:'#1f1f1f',borderBottomWidth:1,paddingBottom:8}}><Input label="Nome da meta" value={item.name} onChangeText={v=>setGoals(goals.map((x,i)=>i===index?{...x,name:v}:x))}/><Input label="Valor reservado por mês (R$)" value={item.monthly} onChangeText={v=>setGoals(goals.map((x,i)=>i===index?{...x,monthly:v}:x))} money/><Input label="Valor total da meta (R$), opcional" value={item.target} onChangeText={v=>setGoals(goals.map((x,i)=>i===index?{...x,target:v}:x))} money/><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={text}>Acumula para o próximo mês</Text><Switch trackColor={{false:"#1f1f1f",true:"#8a8a8a"}} thumbColor="#f2f2f2" accessibilityLabel="Acumula para o próximo mês" value={item.rollover} onValueChange={v=>setGoals(goals.map((x,i)=>i===index?{...x,rollover:v}:x))}/></View><Action label="Remover meta" onPress={()=>{if(existing&&item.id) Alert.alert('Remover caixinha?','Ela não aparecerá nos próximos meses e o saldo não será transferido automaticamente. O histórico será mantido.',[{text:'Cancelar',style:'cancel'},{text:'Remover',onPress:()=>setGoals(goals.filter((_,i)=>i!==index))}]);else setGoals(goals.filter((_,i)=>i!==index));}}/></View>)}
    <Action label="+ Adicionar meta ou caixinha" onPress={()=>setGoals([...goals,{name:'',monthly:'',target:'',rollover:true}])}/>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()} style={{marginTop:30,borderWidth:1,borderColor:'#f2f2f2',padding:16,alignItems:'center'}}><Text style={text}>{busy?'Salvando…':existing?'Salvar planejamento':'Começar'}</Text></Pressable>
    {existing && <Action label="Cancelar" onPress={onComplete}/>}
  </ScrollView>;
}
