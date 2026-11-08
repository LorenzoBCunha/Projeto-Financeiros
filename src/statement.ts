export type StatementEntry = {id:number;type:'expense'|'fixed'|'extra';amount:number;date:string;name:string|null};
export function formatStatement(entries:StatementEntry[]):string {
 const blocks=entries.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id).map(entry=>{
  const [year,month,day]=entry.date.split('-');
  const amount=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(entry.amount/100);
  return `Data: ${day}/${month}/${year}\nLocal: ${entry.name?.trim()||(entry.type==='extra'?'Entrada fora do CLT':'Gasto')}\nValor: ${entry.type==='extra'?'+':'-'} R$ ${amount}`;
 });
 return ['💵 Extrato Bancário 💵',...blocks].join('\n\n');
}
