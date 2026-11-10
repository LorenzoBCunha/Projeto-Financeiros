import React,{useState} from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from './ui';
import type {SQLiteDatabase} from 'expo-sqlite';
import {saveCards,type CardInput,type CardRow} from './cards';

type Draft={id?:number;name:string;closing:string;due:string;includeClosingDay:boolean};
const fg='#f2f2f2',secondary='#8a8a8a',border='#1f1f1f',font='HankenGrotesk_400Regular';
function Button({title,onPress,selected=false}:{title:string;onPress:()=>void;selected?:boolean}) {return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={{paddingVertical:14,paddingRight:20}}><Text style={{fontFamily:font,color:selected?fg:secondary,fontSize:16}}>{title}</Text></Pressable>;}
function Field({label,value,onChangeText,numeric=false}:{label:string;value:string;onChangeText:(text:string)=>void;numeric?:boolean}) {return <View style={{marginTop:14}}><Text style={{fontFamily:font,color:secondary,fontSize:13}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric?'number-pad':'default'} maxLength={numeric?2:80} style={{fontFamily:font,color:fg,fontSize:16,borderBottomWidth:1,borderBottomColor:border,paddingVertical:10}}/></View>;}
const blank=():Draft=>({name:'',closing:'',due:'',includeClosingDay:false});
export default function CardSetup({db,existing,onComplete,onCancel}:{db:SQLiteDatabase;existing?:CardRow[];onComplete:()=>void;onCancel?:()=>void}) {
 const [choice,setChoice]=useState<boolean|null>(existing?existing.length>0:null);
 const [cards,setCards]=useState<Draft[]>(existing?.map(c=>({id:c.id,name:c.name,closing:String(c.closing_day),due:String(c.due_day),includeClosingDay:!!c.include_closing_day}))??[]);
 const [busy,setBusy]=useState(false);
 function update(index:number,changes:Partial<Draft>){setCards(items=>items.map((item,i)=>i===index?{...item,...changes}:item));}
 async function save(){
   if(busy)return;if(choice===null){Alert.alert('Escolha uma opção','Informe se usa cartão de crédito.');return;}
   if(choice&&cards.length===0){Alert.alert('Adicione um cartão','Cadastre os dados do cartão ou escolha que não usa cartão agora.');return;}
   const list:CardInput[]=choice?cards.map(c=>({id:c.id,name:c.name,closingDay:Number(c.closing),dueDay:Number(c.due),includeClosingDay:c.includeClosingDay})):[];
   if(choice&&cards.some(c=>!/^\d{1,2}$/.test(c.closing)||!/^\d{1,2}$/.test(c.due))){Alert.alert('Confira as datas','Informe os dias de fechamento e vencimento de cada cartão.');return;}
   setBusy(true);try{await saveCards(db,list);onComplete();}catch(error){Alert.alert('Não foi possível salvar',error instanceof Error?error.message:'Tente novamente.');}finally{setBusy(false);}
 }
 return <ScrollView style={{flex:1,backgroundColor:'#000'}} contentContainerStyle={{padding:24,paddingTop:16,paddingBottom:45}} keyboardShouldPersistTaps="handled">
   <Text style={{fontFamily:font,color:fg,fontSize:28}}>Seus cartões</Text><Text style={{fontFamily:font,color:secondary,marginTop:10,lineHeight:21}}>Você usa cartão de crédito? Cadastre um ou mais para acompanhar as faturas. Você pode configurar isso depois.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap'}}><Button title="Não uso agora" selected={choice===false} onPress={()=>{if(existing?.length)Alert.alert('Desativar cartões?','As faturas existentes e o histórico serão mantidos.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>setChoice(false)}]);else setChoice(false)}}/><Button title="Sim, uso cartão" selected={choice===true} onPress={()=>{setChoice(true);if(!cards.length)setCards([blank()])}}/></View>
   {choice&&cards.map((card,index)=><View key={card.id??`novo-${index}`} style={{borderBottomWidth:1,borderBottomColor:border,paddingBottom:12}}>
     <Text style={{fontFamily:font,color:fg,fontSize:19,marginTop:15}}>Cartão {index+1}</Text><Field label="Nome do cartão" value={card.name} onChangeText={value=>update(index,{name:value})}/><Field label="Dia de fechamento (1 a 31)" value={card.closing} onChangeText={value=>update(index,{closing:value})} numeric/><Field label="Dia de vencimento (1 a 31)" value={card.due} onChangeText={value=>update(index,{due:value})} numeric/>
     <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:18,gap:8}}><View style={{flex:1}}><Text style={{fontFamily:font,color:fg}}>Compra no dia do fechamento</Text><Text style={{fontFamily:font,color:secondary,fontSize:13,marginTop:4}}>{card.includeClosingDay?'Entra nesta fatura':'Entra na próxima fatura'}</Text></View><Switch accessibilityLabel="Compra no dia do fechamento entra nesta fatura" trackColor={{false:border,true:secondary}} thumbColor={fg} value={card.includeClosingDay} onValueChange={value=>update(index,{includeClosingDay:value})}/></View>
     <Button title="Remover cartão" onPress={()=>{const remove=()=>setCards(items=>items.filter((_,i)=>i!==index));if(card.id)Alert.alert('Remover cartão ativo?','As faturas existentes e o histórico serão mantidos.',[{text:'Cancelar',style:'cancel'},{text:'Remover',onPress:remove}]);else remove()}}/>
   </View>)}
   {choice&&<Button title="+ Adicionar outro cartão" onPress={()=>setCards(items=>[...items,blank()])}/>}
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()} style={{marginTop:26,borderWidth:1,borderColor:fg,padding:16,alignItems:'center'}}><Text style={{fontFamily:font,color:fg}}>{busy?'Salvando…':'Continuar'}</Text></Pressable>
   {onCancel&&<Button title="Cancelar" onPress={onCancel}/>}
 </ScrollView>;
}
