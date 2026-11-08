export function reserveMonths(balance:number,monthlyExpenses:number):number|null {
 if(!Number.isSafeInteger(balance)||balance<0||!Number.isSafeInteger(monthlyExpenses)||monthlyExpenses<0)throw new Error('Informe valores válidos.');
 return monthlyExpenses===0?null:balance/monthlyExpenses;
}
export function budgetState(spent:number,limit:number):'normal'|'warning'|'exceeded' {
 if(!Number.isSafeInteger(spent)||spent<0||!Number.isSafeInteger(limit)||limit<=0)throw new Error('Informe valores válidos.');
 return spent>=limit?'exceeded':spent*5>=limit*4?'warning':'normal';
}
