import React,{useState} from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, TextInput, View } from './ui';
import type {SQLiteDatabase} from 'expo-sqlite';
import {resolveLegacyCredit,type CardRow} from './cards';

export type LegacyCredit={id:number;name:string;amount:number;date:string};
const font='HankenGrotesk_400Regular',fg='#f2f2f2',muted='#8a8a8a';
const cash=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
function Button({title,onPress,selected=false}:{title:string;onPress:()=>void;selected?:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={{paddingVertical:14,paddingRight:16}}><Text style={{color:selected?fg:muted,fontFamily:font,fontSize:16}}>{title}</Text></Pressable>;}
export default function LegacyCreditScreen({db,items,cards,onChanged,onCards,onLater}:{db:SQLiteDatabase;items:LegacyCredit[];cards:CardRow[];onChanged:()=>void;onCards:()=>void;onLater:()=>void}){
 const [selected,setSelected]=useState<number|null>(null);const [card,setCard]=useState<number|null>(null);const [due,setDue]=useState('');const [busy,setBusy]=useState(false);
 async function resolve(id:number,choice:{kind:'paid'}|{kind:'unpaid';cardId:number;due:string}){if(busy)return;setBusy(true);try{await resolveLegacyCredit(db,id,choice);setSelected(null);setCard(null);setDue('');onChanged();}catch(error){Alert.alert('Não foi possível revisar',error instanceof Error?error.message:'Tente novamente.');}finally{setBusy(false);}}
 return <ScrollView style={{flex:1,backgroundColor:'#000'}} contentContainerStyle={{padding:24,paddingTop:16,paddingBottom:45}} keyboardShouldPersistTaps="handled">
  <Text style={{fontFamily:font,color:fg,fontSize:27}}>Compras antigas no crédito</Text>
  <Text style={{fontFamily:font,color:muted,lineHeight:22,marginTop:12}}>Essas compras foram registradas antes das faturas. Escolha se já estavam quitadas ou informe o cartão e o vencimento correto. Nada será atribuído automaticamente. Resumos já fechados não serão reescritos.</Text>
  {items.map(item=><View key={item.id} style={{borderBottomWidth:1,borderBottomColor:'#1f1f1f',paddingVertical:18}}><Text style={{fontFamily:font,color:fg,fontSize:17}}>{item.name} · {cash(item.amount)}</Text><Text style={{fontFamily:font,color:muted,marginTop:4}}>{item.date}</Text><View style={{flexDirection:'row',flexWrap:'wrap'}}><Button title="Já estava paga" onPress={()=>Alert.alert('Compra já quitada?','Não criaremos uma nova fatura nem um novo pagamento para esta compra. Confirme apenas se ela já foi paga.',[{text:'Cancelar',style:'cancel'},{text:'Confirmar',onPress:()=>void resolve(item.id,{kind:'paid'})}])}/><Button title="Ainda falta pagar" selected={selected===item.id} onPress={()=>{setSelected(item.id);setCard(null);setDue('')}}/></View>{selected===item.id&&<View><Text style={{fontFamily:font,color:muted,marginTop:5}}>Escolha o cartão da compra</Text><View style={{flexDirection:'row',flexWrap:'wrap'}}>{cards.map(c=><Button key={c.id} title={c.name} selected={card===c.id} onPress={()=>setCard(c.id)}/>)}</View>{cards.length===0&&<Button title="Configurar cartão" onPress={onCards}/>}<Text style={{fontFamily:font,color:muted,marginTop:8}}>Vencimento real da fatura (AAAA-MM-DD)</Text><TextInput accessibilityLabel="Vencimento real da fatura" value={due} onChangeText={setDue} style={{fontFamily:font,color:fg,borderBottomWidth:1,borderBottomColor:'#1f1f1f',paddingVertical:10}}/><Button title={busy?'Salvando…':'Adicionar à fatura'} onPress={()=>{if(card===null){Alert.alert('Escolha o cartão.');return;}void resolve(item.id,{kind:'unpaid',cardId:card,due})}}/></View>}</View>)}
  <Button title="Revisar depois" onPress={onLater}/>
 </ScrollView>;
}
