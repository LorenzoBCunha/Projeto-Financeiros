import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { debtNotificationDate } from './finance.ts';
import {reminderDate} from './investments';

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})});

type ScheduledDebt = {id:number;name:string;amount:number;due:string;notice_days:number;paid_transaction_id:number|null;notification_id:string|null};
export async function prepareNotificationChannel() { if(Platform.OS==='android') await Notifications.setNotificationChannelAsync('debt-reminders',{name:'Lembretes financeiros',importance:Notifications.AndroidImportance.DEFAULT}); }
export async function syncDebtNotifications(db: SQLiteDatabase) {
  await prepareNotificationChannel();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const details = await db.getFirstAsync<{value:string}>("SELECT value FROM settings WHERE key='notification_details'");
  const rows = await db.getAllAsync<ScheduledDebt>(`SELECT d.id,d.name,d.amount-COALESCE((SELECT SUM(t.amount) FROM bill_partial_payments pp JOIN transactions t ON t.id=pp.transaction_id WHERE pp.debt_id=d.id),0) amount,d.due,d.notice_days,d.paid_transaction_id,d.notification_id FROM debts d`);
  for (const row of rows) {
    if (row.paid_transaction_id !== null) {
      if (row.notification_id) { await Notifications.cancelScheduledNotificationAsync(row.notification_id); await db.runAsync('UPDATE debts SET notification_id=NULL WHERE id=?', row.id); }
      continue;
    }
    const day = debtNotificationDate({name:row.name,amount:row.amount,due:row.due,noticeDays:row.notice_days});
    const [year,month,date] = day.split('-').map(Number);
    let when = new Date(year,month-1,date,9,0,0);
    if (when.getTime() <= Date.now()) {
      const now=new Date(); const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      if (row.notification_id || row.due<today) continue;
      when=new Date(Date.now()+5000);
    }
    const body = details?.value === '1' ? `${row.name} — R$ ${(row.amount/100).toFixed(2).replace('.', ',')}` : 'Você tem um compromisso financeiro para conferir.';
    const next = await Notifications.scheduleNotificationAsync({content:{title:'Financeiros',body},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:when,channelId:'debt-reminders'}});
    try { await db.runAsync('UPDATE debts SET notification_id=? WHERE id=?', next, row.id); }
    catch (error) { await Notifications.cancelScheduledNotificationAsync(next); throw error; }
    if (row.notification_id) await Notifications.cancelScheduledNotificationAsync(row.notification_id);
  }
}


export async function syncGoalNotifications(db:SQLiteDatabase) {
 await prepareNotificationChannel();if(!(await Notifications.getPermissionsAsync()).granted)return;
 const rows=await db.getAllAsync<{envelope_id:string;due_date:string;notification_id:string|null;active:number}>("SELECT g.envelope_id,g.due_date,g.notification_id,e.active FROM goal_deadlines g JOIN envelopes e ON e.id=g.envelope_id");
 for(const row of rows){if(!row.active){if(row.notification_id){await Notifications.cancelScheduledNotificationAsync(row.notification_id);await db.runAsync('UPDATE goal_deadlines SET notification_id=NULL WHERE envelope_id=?',row.envelope_id)}continue;}const [year,month,day]=row.due_date.split('-').map(Number);let when=new Date(year,month-1,day,9,0,0);if(when.getTime()<=Date.now()){const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;if(row.due_date!==today||row.notification_id)continue;when=new Date(Date.now()+5000);}const next=await Notifications.scheduleNotificationAsync({content:{title:'Financeiros',body:'Você tem uma meta para conferir.'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:when,channelId:'debt-reminders'}});try{await db.runAsync('UPDATE goal_deadlines SET notification_id=? WHERE envelope_id=?',next,row.envelope_id)}catch(error){await Notifications.cancelScheduledNotificationAsync(next);throw error;}if(row.notification_id)await Notifications.cancelScheduledNotificationAsync(row.notification_id);}
}

export async function syncInvestmentNotifications(db:SQLiteDatabase) {
 await prepareNotificationChannel();if(!(await Notifications.getPermissionsAsync()).granted)return;const rows=await db.getAllAsync<{id:number;reminder_at:string|null;notification_id:string|null}>('SELECT id,reminder_at,notification_id FROM investments');
 for(const row of rows){const when=row.reminder_at?reminderDate(row.reminder_at):null;if(!when||when.getTime()<=Date.now())continue;const next=await Notifications.scheduleNotificationAsync({content:{title:'Financeiros',body:'Você tem um investimento para conferir.'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:when,channelId:'debt-reminders'}});try{await db.runAsync('UPDATE investments SET notification_id=? WHERE id=?',next,row.id)}catch(error){await Notifications.cancelScheduledNotificationAsync(next);throw error;}if(row.notification_id)await Notifications.cancelScheduledNotificationAsync(row.notification_id);}
}

export async function syncRecurringNotifications(db:SQLiteDatabase){await prepareNotificationChannel();if(!(await Notifications.getPermissionsAsync()).granted)return;const rows=await db.getAllAsync<{id:number;name:string;amount:number;next_due:string;notice_days:number;active:number;notification_id:string|null}>('SELECT * FROM recurring_expenses');for(const row of rows){if(!row.active){if(row.notification_id){await Notifications.cancelScheduledNotificationAsync(row.notification_id);await db.runAsync('UPDATE recurring_expenses SET notification_id=NULL WHERE id=?',row.id)}continue;}const day=debtNotificationDate({name:row.name,amount:row.amount,due:row.next_due,noticeDays:row.notice_days});const [y,m,d]=day.split('-').map(Number);let when=new Date(y,m-1,d,9);if(when.getTime()<=Date.now()){const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;if(row.next_due<today||row.notification_id)continue;when=new Date(Date.now()+5000);}const next=await Notifications.scheduleNotificationAsync({content:{title:'Financeiros',body:'Você tem uma despesa recorrente para conferir.'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:when,channelId:'debt-reminders'}});try{await db.runAsync('UPDATE recurring_expenses SET notification_id=? WHERE id=?',next,row.id)}catch(error){await Notifications.cancelScheduledNotificationAsync(next);throw error}if(row.notification_id)await Notifications.cancelScheduledNotificationAsync(row.notification_id);}}
