export type DueItem = {name:string; amount:number; due:string; noticeDays:number};

// Monta o evento de vencimento. O nome sempre vai (a pessoa pediu este evento); o valor só se ela permitiu detalhes.
export function dueEvent(item:DueItem, details:boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.due)) throw new Error('Data de vencimento inválida.');
  const [year,month,day] = item.due.split('-').map(Number);
  const alarms = item.noticeDays>0 ? [{relativeOffset:-item.noticeDays*1440},{relativeOffset:0}] : [{relativeOffset:0}];
  return {
    title: `Pagar: ${item.name}`,
    notes: details ? `Valor: R$ ${(item.amount/100).toFixed(2).replace('.',',')}` : undefined,
    startDate: new Date(year,month-1,day,9,0,0),
    endDate: new Date(year,month-1,day,9,30,0),
    alarms,
  };
}

// Abre a tela de novo evento do próprio celular; não pede permissão de agenda.
export async function addDueToCalendar(item:DueItem, details:boolean) {
  const {createEventInCalendarAsync} = await import('expo-calendar/legacy');
  return createEventInCalendarAsync(dueEvent(item,details));
}
