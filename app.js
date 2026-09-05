const STORAGE_KEY = 'agenda-financeira-v5';
const PREVIOUS_STORAGE_KEY = 'agenda-financeira-v4';
const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const COLORS = ['#ff7a00','#ffb15c','#f0f0f0','#ff9650','#d78b55','#c7c7c7','#ffca8a','#9e6a3a'];
const CATEGORIES = ['iFood','Cinema','Comida fora','Transporte','Assinaturas','Academia','Cuidados pessoais','Compras','Outros'];
const BRAND_LOGOS = {ifood:'https://www.ifood.com.br/favicon.ico',cinemark:'https://www.cinemark.com/favicon.ico',chatgpt:'https://openai.com/favicon.svg',openai:'https://openai.com/favicon.svg',netflix:'https://www.netflix.com/favicon.ico','banco do brasil':'https://www.bb.com.br/favicon.ico',bb:'https://www.bb.com.br/favicon.ico',renner:'https://www.lojasrenner.com.br/favicon.ico'};
const FILTER_ICONS = {'Todos':'apps','Comida fora':'restaurant','Transporte':'directions_car','Assinaturas':'subscriptions','Academia':'fitness_center','Cuidados pessoais':'content_cut','Compras':'shopping_bag','Outros':'more_horiz'};
const emptyState=()=>({version:5,base:{cash:0,reserved:0},incomes:[],bills:[],schedules:[],transactions:[]});
let state=loadState();
let activeFilter='Todos';
let deferredPrompt=null;

function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`}
function el(id){return document.getElementById(id)}
function sum(arr,getter=x=>x){return arr.reduce((a,x)=>a+Number(getter(x)||0),0)}
function escapeHtml(v=''){return String(v).replace(/[&<>\'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseLocalDate(s){if(!s)return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12,0,0,0)}
function isoFromDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function monthKeyFromDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function monthKeyFromISO(s){const d=parseLocalDate(s);return d?monthKeyFromDate(d):''}
function currentMonthKey(){return monthKeyFromDate(new Date())}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()}
function dateForMonthDay(y,m,day){return new Date(y,m,Math.min(Math.max(1,Number(day)||1),daysInMonth(y,m)),12)}
function endOfCurrentMonth(){const n=new Date();return new Date(n.getFullYear(),n.getMonth()+1,0,12)}
function formatDate(s){const d=parseLocalDate(s);return d?d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}):''}
function shortDate(s){const d=parseLocalDate(s);return d?d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):''}
function brandLogo(name=''){const key=name.trim().toLowerCase();if(BRAND_LOGOS[key])return BRAND_LOGOS[key];if(key.includes('banco do brasil'))return BRAND_LOGOS['banco do brasil'];if(key.includes('renner'))return BRAND_LOGOS.renner;if(key.includes('chatgpt')||key.includes('openai'))return BRAND_LOGOS.openai;if(key.includes('netflix'))return BRAND_LOGOS.netflix;return null}
function iconMarkup(name,material='receipt_long'){const logo=brandLogo(name);return logo?`<img src="${logo}" alt="">`:`<span class="material-symbols-outlined">${material}</span>`}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

function migrateV4(old){
  const nowMonth=currentMonthKey();
  return {
    version:5,
    base:{cash:Number(old?.base?.cash||0),reserved:Number(old?.base?.reserved||0)},
    incomes:(old?.incomes||[]).map(i=>({id:i.id||uid(),name:i.name||'Entrada',value:Number(i.value||0),date:'',recurrence:'once',received:false,receivedPeriods:[]})),
    bills:(old?.bills||[]).map(b=>({id:b.id||uid(),name:b.name||'Fatura',value:Number(b.value||0),baseMonth:nowMonth,dueDay:b.dueDate?Number(b.dueDate.split('-')[2]):null})),
    schedules:[],
    transactions:(old?.transactions||[]).map(t=>({...t,effectiveDate:t.effectiveDate||String(t.createdAt||todayISO()).slice(0,10)}))
  };
}
function normalizeState(saved){const base=emptyState();return {...base,...saved,version:5,base:{...base.base,...(saved.base||{})},incomes:(saved.incomes||[]).map(i=>({...i,receivedPeriods:i.receivedPeriods||[],recurrence:i.recurrence||'once',received:Boolean(i.received)})),bills:saved.bills||[],schedules:saved.schedules||[],transactions:(saved.transactions||[]).map(t=>({...t,effectiveDate:t.effectiveDate||String(t.createdAt||todayISO()).slice(0,10)}))}}
function loadState(){
  try{const current=JSON.parse(localStorage.getItem(STORAGE_KEY));if(current)return normalizeState(current)}catch{}
  try{const old=JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY));if(old){const migrated=migrateV4(old);localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));return migrated}}catch{}
  return emptyState();
}

function monthTransactions(monthKey=currentMonthKey()){return state.transactions.filter(tx=>monthKeyFromISO(tx.effectiveDate)===monthKey)}
function cashIncomeTx(){return sum(state.transactions.filter(tx=>tx.type==='income'&&tx.account==='cash'),x=>x.amount)}
function cashExpenseTx(){return sum(state.transactions.filter(tx=>tx.type==='expense'&&tx.account==='cash'),x=>x.amount)}
function grossCash(){return Number(state.base.cash||0)+cashIncomeTx()}
function currentCash(){return grossCash()-cashExpenseTx()}
function billBaseCurrent(bill){return bill.baseMonth===currentMonthKey()?Number(bill.value||0):0}
function billTxCurrent(id){return sum(monthTransactions().filter(tx=>tx.type==='expense'&&tx.account===`bill:${id}`),x=>x.amount)-sum(monthTransactions().filter(tx=>tx.type==='income'&&tx.account===`bill:${id}`),x=>x.amount)}
function billCurrent(bill){return Math.max(0,billBaseCurrent(bill)+billTxCurrent(bill.id))}

function scheduleOccurrence(schedule,year,month){
  const start=parseLocalDate(schedule.startDate);if(!start)return null;
  if(schedule.recurrence==='once')return start.getFullYear()===year&&start.getMonth()===month?start:null;
  const candidate=dateForMonthDay(year,month,start.getDate());
  return candidate>=new Date(start.getFullYear(),start.getMonth(),1,12)?candidate:null;
}
function occurrenceKey(schedule,date){return schedule.recurrence==='once'?`${schedule.id}:once`:`${schedule.id}:${monthKeyFromDate(date)}`}
function materializeDueSchedules(){
  const today=parseLocalDate(todayISO());let changed=false;
  for(const schedule of state.schedules){
    const start=parseLocalDate(schedule.startDate);if(!start)continue;
    if(schedule.recurrence==='once'){
      if(start<=today){const key=occurrenceKey(schedule,start);if(!state.transactions.some(t=>t.occurrenceKey===key)){state.transactions.push(scheduleToTransaction(schedule,start,key));changed=true}}
      continue;
    }
    let cursor=new Date(start.getFullYear(),start.getMonth(),1,12);const limit=new Date(today.getFullYear(),today.getMonth(),1,12);let guard=0;
    while(cursor<=limit&&guard++<48){const occ=scheduleOccurrence(schedule,cursor.getFullYear(),cursor.getMonth());if(occ&&occ>=start&&occ<=today){const key=occurrenceKey(schedule,occ);if(!state.transactions.some(t=>t.occurrenceKey===key)){state.transactions.push(scheduleToTransaction(schedule,occ,key));changed=true}}cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12)}
  }
  if(changed)saveState();
}
function scheduleToTransaction(schedule,date,key){return{id:uid(),type:'expense',amount:Number(schedule.value||0),category:schedule.category,account:schedule.account,description:schedule.name||schedule.description||schedule.category,effectiveDate:isoFromDate(date),createdAt:new Date().toISOString(),scheduleId:schedule.id,occurrenceKey:key}}
function currentMonthFutureSchedules(){const now=parseLocalDate(todayISO());return state.schedules.map(s=>{const occ=scheduleOccurrence(s,now.getFullYear(),now.getMonth());return occ&&occ>now?{schedule:s,date:occ}:null}).filter(Boolean)}
function billFutureScheduled(bill){return sum(currentMonthFutureSchedules().filter(x=>x.schedule.account===`bill:${bill.id}`),x=>x.schedule.value)}
function billProjected(bill){return billCurrent(bill)+billFutureScheduled(bill)}

function incomeOccurrenceForMonth(income,year,month){
  const start=parseLocalDate(income.date);if(!start)return null;
  if(income.recurrence==='once')return start.getFullYear()===year&&start.getMonth()===month?start:null;
  const candidate=dateForMonthDay(year,month,start.getDate());return candidate>=new Date(start.getFullYear(),start.getMonth(),1,12)?candidate:null;
}
function incomeReceivedForOccurrence(income,date){if(income.recurrence==='once')return Boolean(income.received);return (income.receivedPeriods||[]).includes(monthKeyFromDate(date))}
function pendingIncomeOccurrences(monthsAhead=3){
  const today=parseLocalDate(todayISO()),result=[];
  for(const income of state.incomes){
    const start=parseLocalDate(income.date);if(!start)continue;
    if(income.recurrence==='once'){
      if(start>=today&&!incomeReceivedForOccurrence(income,start))result.push({income,date:start});continue;
    }
    for(let offset=0;offset<=monthsAhead;offset++){const base=new Date(today.getFullYear(),today.getMonth()+offset,1,12);const occ=incomeOccurrenceForMonth(income,base.getFullYear(),base.getMonth());if(occ&&occ>=today&&!incomeReceivedForOccurrence(income,occ)){result.push({income,date:occ});break}}
  }
  return result.sort((a,b)=>a.date-b.date);
}
function nextProjectionHorizon(){const pending=pendingIncomeOccurrences();if(pending.length)return{date:pending[0].date,label:`Até ${pending[0].income.name} · ${shortDate(isoFromDate(pending[0].date))}`,income:pending[0].income};return{date:endOfCurrentMonth(),label:'Até o fim do mês',income:null}}
function futureCashSchedulesUntil(horizon){const today=parseLocalDate(todayISO());let total=0;for(const s of state.schedules){if(s.account!=='cash')continue;const start=parseLocalDate(s.startDate);if(!start)continue;if(s.recurrence==='once'){if(start>today&&start<=horizon)total+=Number(s.value||0);continue}let cursor=new Date(today.getFullYear(),today.getMonth(),1,12),guard=0;while(cursor<=horizon&&guard++<12){const occ=scheduleOccurrence(s,cursor.getFullYear(),cursor.getMonth());if(occ&&occ>today&&occ<=horizon&&occ>=start)total+=Number(s.value||0);cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12)}}return total}
function incomesUntil(horizon){return pendingIncomeOccurrences(6).filter(x=>x.date<=horizon)}
function billDueDateForMonth(bill,baseDate){if(!bill.dueDay)return null;return dateForMonthDay(baseDate.getFullYear(),baseDate.getMonth(),bill.dueDay)}
function billProjectedThrough(bill,horizon){
  let total=billCurrent(bill);
  for(const {schedule,date} of currentMonthFutureSchedules()){if(schedule.account===`bill:${bill.id}`&&date<=horizon)total+=Number(schedule.value||0)}
  return total;
}
function projectionAtHorizon(){
  const horizon=nextProjectionHorizon().date;let value=currentCash()-Number(state.base.reserved||0);
  value+=sum(incomesUntil(horizon),x=>x.income.value);
  value-=futureCashSchedulesUntil(horizon);
  for(const bill of state.bills){const due=billDueDateForMonth(bill,new Date());if(due&&due>=parseLocalDate(todayISO())&&due<=horizon)value-=billProjectedThrough(bill,due)}
  return value;
}

function fillSelects(){el('category').innerHTML=CATEGORIES.map(c=>`<option>${c}</option>`).join('');el('account').innerHTML=[`<option value="cash">Débito / dinheiro</option>`,...state.bills.map(b=>`<option value="bill:${b.id}">${escapeHtml(b.name)}</option>`)].join('')}
function render(){materializeDueSchedules();el('grossBalance').textContent=money.format(grossCash());el('netBalance').textContent=money.format(currentCash());el('reservedTotal').textContent=money.format(state.base.reserved||0);renderStatus();renderHomeBills();renderChart();renderSpending();renderHistory();renderSettings();fillSelects();syncMovementForm()}
function renderStatus(){const p=projectionAtHorizon(),pill=el('statusPill');pill.className='status-pill';if(!state.incomes.length&&!state.bills.length&&!state.schedules.length&&currentCash()===0){pill.textContent='Sem dados';return}if(p>=1000)pill.textContent='Tranquilo';else if(p>=300){pill.textContent='Atenção';pill.classList.add('warn')}else{pill.textContent='Freia aí';pill.classList.add('bad')}}
function renderHomeBills(){const box=el('homeBills');if(!state.bills.length){box.innerHTML='<div class="empty-card">Nenhuma fatura cadastrada. Adicione uma em Ajustes.</div>';return}box.innerHTML=state.bills.map(b=>{const future=billFutureScheduled(b);return`<button class="bill-bubble" type="button" data-bill-id="${b.id}"><span class="bill-brand">${iconMarkup(b.name,'credit_card')}</span><span class="bill-copy"><small>${escapeHtml(b.name)}</small><strong>${money.format(billCurrent(b))}</strong>${future>0?`<em>+ ${money.format(future)} previsto neste mês</em>`:'<em>Sem cobrança futura programada</em>'}</span><span class="chevron">›</span></button>`}).join('');box.querySelectorAll('[data-bill-id]').forEach(btn=>btn.onclick=()=>openBillDetail(btn.dataset.billId))}
function chartData(){const items=[{id:'projection',name:'Disponível no horizonte',value:Math.max(0,projectionAtHorizon()),color:COLORS[0]}];state.bills.forEach((b,i)=>items.push({id:`bill:${b.id}`,name:b.name,value:Math.max(0,billProjected(b)),color:COLORS[(i+1)%COLORS.length]}));return items}
function drawPie(){const canvas=el('financeChart'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),cssSize=Math.max(180,Math.min(rect.width||260,260)),size=Math.round(cssSize*dpr);if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size}ctx.clearRect(0,0,size,size);const items=chartData(),total=sum(items,x=>x.value);if(total<=0){ctx.beginPath();ctx.arc(size/2,size/2,size*.38,0,Math.PI*2);ctx.lineWidth=size*.18;ctx.strokeStyle='#292929';ctx.stroke();return}let start=-Math.PI/2;items.forEach(item=>{if(item.value<=0)return;const angle=item.value/total*Math.PI*2;ctx.beginPath();ctx.moveTo(size/2,size/2);ctx.arc(size/2,size/2,size*.47,start,start+angle);ctx.closePath();ctx.fillStyle=item.color;ctx.fill();start+=angle});ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(size/2,size/2,size*.27,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over'}
function renderChart(){const horizon=nextProjectionHorizon();el('projectionTitle').textContent=horizon.label;el('chartCenter').textContent=money.format(projectionAtHorizon());const items=chartData();el('chartLegend').innerHTML=items.map(item=>`<button class="legend-item" type="button" data-chart-id="${item.id}"><i class="legend-dot" style="background:${item.color}"></i><span>${escapeHtml(item.name)}</span><strong>${money.format(item.value)}</strong></button>`).join('');const incomes=incomesUntil(horizon.date);el('chartCaption').textContent=`Horizonte ${shortDate(isoFromDate(horizon.date))}: ${incomes.length?`${money.format(sum(incomes,x=>x.income.value))} ainda previsto em entradas`:'sem entrada futura antes do horizonte'}, ${money.format(futureCashSchedulesUntil(horizon.date))} em gastos de débito previstos.`;requestAnimationFrame(drawPie);el('chartLegend').querySelectorAll('[data-chart-id]').forEach(btn=>btn.onclick=()=>btn.dataset.chartId==='projection'?openProjectionDetail():openBillDetail(btn.dataset.chartId.replace('bill:','')))}

function actualExpensesThisMonth(){return monthTransactions().filter(tx=>tx.type==='expense')}
function futureExpensesThisMonth(){return currentMonthFutureSchedules().map(x=>({id:`future:${x.schedule.id}`,type:'expense',amount:Number(x.schedule.value||0),category:x.schedule.category,account:x.schedule.account,description:x.schedule.name||x.schedule.description||x.schedule.category,effectiveDate:isoFromDate(x.date),future:true,recurrence:x.schedule.recurrence,scheduleId:x.schedule.id}))}
function renderSpending(){const actual=actualExpensesThisMonth(),future=futureExpensesThisMonth();const fa=activeFilter==='Todos'?actual:actual.filter(x=>x.category===activeFilter),ff=activeFilter==='Todos'?future:future.filter(x=>x.category===activeFilter);el('activeFilterLabel').textContent=activeFilter==='Todos'?'Todos os gastos':activeFilter;el('filterActualTotal').textContent=money.format(sum(fa,x=>x.amount));el('filterActualCount').textContent=`${fa.length} ${fa.length===1?'lançamento':'lançamentos'}`;el('filterFutureTotal').textContent=money.format(sum(ff,x=>x.amount));el('filterFutureCount').textContent=`${ff.length} ${ff.length===1?'previsto':'previstos'}`;const combined=[...fa.map(x=>({...x,sortDate:parseLocalDate(x.effectiveDate)})),...ff.map(x=>({...x,sortDate:parseLocalDate(x.effectiveDate)}))].sort((a,b)=>b.sortDate-a.sortDate);el('filteredSpending').innerHTML=combined.length?combined.map(spendingHtml).join(''):'<div class="empty">Nenhum gasto nesse filtro neste mês.</div>';const groups=new Map();[...actual,...future].forEach(tx=>{const v=groups.get(tx.category)||{actual:0,future:0,count:0};if(tx.future)v.future+=tx.amount;else v.actual+=tx.amount;v.count++;groups.set(tx.category,v)});const rows=[...groups.entries()].sort((a,b)=>(b[1].actual+b[1].future)-(a[1].actual+a[1].future));el('categorySummary').innerHTML=rows.length?rows.map(([name,d])=>`<div class="category-row"><span>${escapeHtml(name)}</span><small>${money.format(d.actual)} cobrado · ${money.format(d.future)} previsto</small><strong>${money.format(d.actual+d.future)}</strong></div>`).join(''):'<div class="empty">Nenhum gasto registrado neste mês.</div>'}
function accountLabel(account){if(account==='cash')return'Débito/dinheiro';if(account.startsWith('bill:')){const b=state.bills.find(x=>x.id===account.slice(5));return b?.name||'Fatura removida'}return account}
function spendingHtml(tx){if(tx.future)return`<div class="tx future-tx"><div><strong>${escapeHtml(tx.description||tx.category)}</strong><div class="meta">${escapeHtml(tx.category)} · ${escapeHtml(accountLabel(tx.account))} · previsto ${shortDate(tx.effectiveDate)}${tx.recurrence==='monthly'?' · mensal':''}</div></div><div class="amount future">${money.format(tx.amount)}</div></div>`;return transactionHtml(tx)}
function transactionHtml(tx){const sign=tx.type==='income'?'+':'-';const date=formatDate(tx.effectiveDate);return`<div class="tx"><div><strong>${escapeHtml(tx.description||tx.category)}</strong><div class="meta">${escapeHtml(tx.category)} · ${escapeHtml(accountLabel(tx.account))} · ${date}</div></div><div class="amount ${tx.type}">${sign}${money.format(tx.amount)}</div></div>`}
function renderHistory(){el('history').innerHTML=state.transactions.length?[...state.transactions].sort((a,b)=>parseLocalDate(b.effectiveDate)-parseLocalDate(a.effectiveDate)).slice(0,100).map(transactionHtml).join(''):'<div class="empty">Nenhum movimento realizado ainda.</div>'}

function incomeCurrentOccurrence(income){const now=new Date(),start=parseLocalDate(income.date);if(!start)return null;if(income.recurrence==='once')return start;return incomeOccurrenceForMonth(income,now.getFullYear(),now.getMonth())}
function incomeStatus(income){const occ=incomeCurrentOccurrence(income);if(!occ)return{label:'Defina uma data',cls:'neutral'};const received=incomeReceivedForOccurrence(income,occ);if(received)return{label:'Recebido',cls:'received'};const today=parseLocalDate(todayISO());if(occ<today)return{label:`Atrasado · ${shortDate(isoFromDate(occ))}`,cls:'late'};return{label:`Previsto · ${shortDate(isoFromDate(occ))}`,cls:'pending'}}
function renderSettings(){if(document.activeElement!==el('setCash'))el('setCash').value=state.base.cash||0;if(document.activeElement!==el('setReserved'))el('setReserved').value=state.base.reserved||0;el('incomeList').innerHTML=state.incomes.length?state.incomes.map(i=>{const st=incomeStatus(i);return`<div class="settings-item"><span class="settings-icon"><span class="material-symbols-outlined">payments</span></span><span class="settings-copy"><strong>${escapeHtml(i.name)}</strong><small>${money.format(i.value)}${i.recurrence==='monthly'?' · mensal':''}</small><em class="status-tag ${st.cls}">${st.label}</em></span><span class="settings-actions"><button class="mini-icon-button" data-edit-income="${i.id}" type="button"><span class="material-symbols-outlined">edit</span></button><button class="mini-icon-button danger" data-remove-income="${i.id}" type="button"><span class="material-symbols-outlined">delete</span></button></span></div>`}).join(''):'<div class="empty-list">Nenhuma entrada cadastrada.<br>Adicione salário, SENAI ou outro recurso e informe quando recebe.</div>';el('billList').innerHTML=state.bills.length?state.bills.map(b=>`<div class="settings-item"><span class="settings-icon">${iconMarkup(b.name,'credit_card')}</span><span class="settings-copy"><strong>${escapeHtml(b.name)}</strong><small>${money.format(billCurrent(b))} atual · ${money.format(billProjected(b))} projetado${b.dueDay?` · vence dia ${b.dueDay}`:''}</small></span><span class="settings-actions"><button class="mini-icon-button" data-edit-bill="${b.id}" type="button"><span class="material-symbols-outlined">edit</span></button><button class="mini-icon-button danger" data-remove-bill="${b.id}" type="button"><span class="material-symbols-outlined">delete</span></button></span></div>`).join(''):'<div class="empty-list">Nenhuma fatura cadastrada.</div>';el('scheduleList').innerHTML=state.schedules.length?state.schedules.map(s=>`<div class="settings-item"><span class="settings-icon">${iconMarkup(s.name||s.category,s.category==='Cinema'?'movie':'schedule')}</span><span class="settings-copy"><strong>${escapeHtml(s.name||s.category)}</strong><small>${money.format(s.value)} · ${escapeHtml(accountLabel(s.account))} · ${s.recurrence==='monthly'?`todo mês dia ${parseLocalDate(s.startDate)?.getDate()}`:`${formatDate(s.startDate)}`}</small></span><span class="settings-actions"><button class="mini-icon-button danger" data-remove-schedule="${s.id}" type="button" title="Cancelar próximos lançamentos"><span class="material-symbols-outlined">event_busy</span></button></span></div>`).join(''):'<div class="empty-list">Nenhum gasto futuro ou recorrente programado.</div>';bindSettingsActions()}
function bindSettingsActions(){document.querySelectorAll('[data-edit-income]').forEach(b=>b.onclick=()=>openEditor('income',b.dataset.editIncome));document.querySelectorAll('[data-remove-income]').forEach(b=>b.onclick=()=>removeIncome(b.dataset.removeIncome));document.querySelectorAll('[data-edit-bill]').forEach(b=>b.onclick=()=>openEditor('bill',b.dataset.editBill));document.querySelectorAll('[data-remove-bill]').forEach(b=>b.onclick=()=>removeBill(b.dataset.removeBill));document.querySelectorAll('[data-remove-schedule]').forEach(b=>b.onclick=()=>removeSchedule(b.dataset.removeSchedule))}

function switchPage(target){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===target));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.target===target));window.scrollTo({top:0,behavior:'smooth'});if(target==='add')setTimeout(()=>el('amount').focus(),180)}
document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>switchPage(btn.dataset.target));

function syncMovementForm(){const expense=el('type').value==='expense';el('movementDateLabel').firstChild.textContent=expense?'Data da cobrança ':'Data do recebimento ';el('recurrenceLabel').style.display=expense?'flex':'none';el('movementHint').textContent=expense?'Data futura = apenas previsto. No dia da cobrança ele passa automaticamente para gasto realizado.':'Para entradas futuras recorrentes, prefira cadastrar em Ajustes para controlar “já recebi / ainda vou receber”.'}
el('type').addEventListener('change',syncMovementForm);
el('transactionForm').addEventListener('submit',e=>{e.preventDefault();const amount=Number(el('amount').value),type=el('type').value,date=el('movementDate').value||todayISO();if(!amount||amount<=0)return;if(type==='expense'){const recurring=el('movementRecurring').checked;if(recurring||parseLocalDate(date)>parseLocalDate(todayISO())){state.schedules.push({id:uid(),name:el('description').value.trim()||el('category').value,value:amount,category:el('category').value,account:el('account').value,startDate:date,recurrence:recurring?'monthly':'once',createdAt:new Date().toISOString()})}else state.transactions.push({id:uid(),type:'expense',amount,category:el('category').value,account:el('account').value,description:el('description').value.trim(),effectiveDate:date,createdAt:new Date().toISOString()})}else state.transactions.push({id:uid(),type:'income',amount,category:'Outros',account:'cash',description:el('description').value.trim()||'Entrada recebida',effectiveDate:date,createdAt:new Date().toISOString()});saveState();e.target.reset();el('type').value='expense';el('movementDate').value=todayISO();render();switchPage('home')});
document.querySelectorAll('.quick').forEach(btn=>btn.onclick=()=>{switchPage('add');el('type').value='expense';el('amount').value=btn.dataset.quick;el('category').value=btn.dataset.category;el('account').value='cash';el('description').value=btn.dataset.category;el('movementDate').value=todayISO();setTimeout(()=>el('amount').focus(),100)});
el('baseForm').addEventListener('submit',e=>{e.preventDefault();state.base.cash=Number(el('setCash').value||0);state.base.reserved=Number(el('setReserved').value||0);saveState();render()});

el('addIncomeBtn').onclick=()=>openEditor('income');el('addBillBtn').onclick=()=>openEditor('bill');
function openEditor(kind,id=''){const isIncome=kind==='income',item=isIncome?state.incomes.find(x=>x.id===id):state.bills.find(x=>x.id===id);el('editorKind').value=kind;el('editorId').value=id;el('editorEyebrow').textContent=item?'EDITAR':'NOVO';el('editorTitle').textContent=isIncome?'Entrada':'Fatura';el('editorName').value=item?.name||'';el('editorValue').value=isIncome?(item?.value??0):(item?.baseMonth===currentMonthKey()?item?.value??0:0);el('editorDate').value=isIncome?(item?.date||''):'';el('editorDueDay').value=isIncome?'':(item?.dueDay||'');el('editorRecurrence').value=isIncome?(item?.recurrence||'once'):'monthly';const occ=isIncome&&item?incomeCurrentOccurrence(item):null;el('editorStatus').value=isIncome&&item&&occ&&incomeReceivedForOccurrence(item,occ)?'received':'pending';el('editorDateLabel').style.display=isIncome?'grid':'none';el('editorDueDayLabel').style.display=isIncome?'none':'grid';el('editorRecurrenceLabel').style.display=isIncome?'grid':'none';el('editorStatusLabel').style.display=isIncome?'grid':'none';el('editorValueLabel').firstChild.textContent=isIncome?'Valor ':'Valor atual da fatura ';el('editorHelp').textContent=isIncome?'“Já recebi” tira essa entrada da projeção deste ciclo. Se for mensal, no próximo mês ela volta automaticamente como pendente.':'O valor atual vale somente para o mês atual. No próximo mês a base da fatura começa em zero e recebe os novos lançamentos.';openModal('editorModal');setTimeout(()=>el('editorName').focus(),120)}
el('editorForm').addEventListener('submit',e=>{e.preventDefault();const kind=el('editorKind').value,id=el('editorId').value,name=el('editorName').value.trim(),value=Number(el('editorValue').value||0);if(!name)return;if(kind==='income'){const date=el('editorDate').value,recurrence=el('editorRecurrence').value,status=el('editorStatus').value;let item=id?state.incomes.find(x=>x.id===id):null;if(!item){item={id:uid(),name,value,date,recurrence,received:false,receivedPeriods:[]};state.incomes.push(item)}Object.assign(item,{name,value,date,recurrence,receivedPeriods:item.receivedPeriods||[]});if(recurrence==='once')item.received=status==='received';else{item.received=false;const occ=incomeCurrentOccurrence(item);if(occ){const mk=monthKeyFromDate(occ);item.receivedPeriods=item.receivedPeriods.filter(x=>x!==mk);if(status==='received')item.receivedPeriods.push(mk)}}}else{const dueDay=Math.min(31,Math.max(1,Number(el('editorDueDay').value||1)));let item=id?state.bills.find(x=>x.id===id):null;if(!item){item={id:uid(),name,value,baseMonth:currentMonthKey(),dueDay};state.bills.push(item)}else Object.assign(item,{name,value,baseMonth:currentMonthKey(),dueDay})}saveState();closeModal('editorModal');render()});
function removeIncome(id){if(!confirm('Remover esta entrada?'))return;state.incomes=state.incomes.filter(x=>x.id!==id);saveState();render()}
function removeBill(id){const bill=state.bills.find(x=>x.id===id);if(!bill||!confirm(`Remover a fatura ${bill.name}?`))return;state.bills=state.bills.filter(x=>x.id!==id);saveState();render()}
function removeSchedule(id){const s=state.schedules.find(x=>x.id===id);if(!s||!confirm(`Cancelar os próximos lançamentos de ${s.name||s.category}? O que já foi cobrado permanece no histórico.`))return;state.schedules=state.schedules.filter(x=>x.id!==id);saveState();render()}

function openBillDetail(id){const b=state.bills.find(x=>x.id===id);if(!b)return;const current=billCurrent(b),futureItems=currentMonthFutureSchedules().filter(x=>x.schedule.account===`bill:${b.id}`);el('detailTitle').textContent=b.name;el('detailValue').textContent=money.format(current);el('detailSubtitle').textContent=`Atual agora${b.dueDay?` · vence dia ${b.dueDay}`:''}`;el('detailRows').innerHTML=`<div class="detail-row"><span>Fatura atual</span><strong>${money.format(current)}</strong></div>${futureItems.length?`<div class="detail-heading">AINDA NÃO COBRADO</div>${futureItems.map(x=>`<div class="detail-row"><span>${escapeHtml(x.schedule.name||x.schedule.category)} · ${shortDate(isoFromDate(x.date))}${x.schedule.recurrence==='monthly'?' · mensal':''}</span><strong>+ ${money.format(x.schedule.value)}</strong></div>`).join('')}`:'<div class="detail-row"><span>Nenhuma cobrança futura neste mês</span><strong>—</strong></div>'}<div class="detail-row total-row"><span>Projeção da fatura</span><strong>${money.format(billProjected(b))}</strong></div>`;openModal('detailModal')}
function openProjectionDetail(){const h=nextProjectionHorizon(),inc=incomesUntil(h.date),cashFuture=futureCashSchedulesUntil(h.date);const rows=[`<div class="detail-row"><span>Saldo atual</span><strong>${money.format(currentCash())}</strong></div>`,`<div class="detail-row"><span>Reservado</span><strong>- ${money.format(state.base.reserved||0)}</strong></div>`,...inc.map(x=>`<div class="detail-row"><span>${escapeHtml(x.income.name)} · ${shortDate(isoFromDate(x.date))}</span><strong>+ ${money.format(x.income.value)}</strong></div>`),cashFuture?`<div class="detail-row"><span>Débito previsto até a data</span><strong>- ${money.format(cashFuture)}</strong></div>`:'',...state.bills.map(b=>{const due=billDueDateForMonth(b,new Date());return due&&due>=parseLocalDate(todayISO())&&due<=h.date?`<div class="detail-row"><span>${escapeHtml(b.name)} · vence ${shortDate(isoFromDate(due))}</span><strong>- ${money.format(billProjectedThrough(b,due))}</strong></div>`:''})].filter(Boolean);el('detailTitle').textContent=h.label;el('detailValue').textContent=money.format(projectionAtHorizon());el('detailSubtitle').textContent='Somente eventos com data dentro desse horizonte entram no cálculo.';el('detailRows').innerHTML=rows.join('');openModal('detailModal')}
el('financeChartButton').onclick=openProjectionDetail;

function renderFilterOptions(){el('filterOptions').innerHTML=['Todos',...CATEGORIES].map(cat=>{const logo=cat==='iFood'?BRAND_LOGOS.ifood:cat==='Cinema'?BRAND_LOGOS.cinemark:null;const visual=logo?`<img src="${logo}" alt="">`:`<span class="material-symbols-outlined">${FILTER_ICONS[cat]||'sell'}</span>`;return`<button type="button" data-filter="${cat}" class="filter-option${activeFilter===cat?' active':''}">${visual}<span>${cat}</span></button>`}).join('');el('filterOptions').querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{activeFilter=btn.dataset.filter;closeModal('filterModal');renderSpending()})}
el('openFilterBtn').onclick=()=>{renderFilterOptions();openModal('filterModal')};

function openModal(id){el(id).hidden=false;document.body.classList.add('modal-open')}
function closeModal(id){el(id).hidden=true;if([...document.querySelectorAll('.modal')].every(m=>m.hidden))document.body.classList.remove('modal-open')}
document.querySelectorAll('[data-close-detail]').forEach(n=>n.onclick=()=>closeModal('detailModal'));document.querySelectorAll('[data-close-filter]').forEach(n=>n.onclick=()=>closeModal('filterModal'));document.querySelectorAll('[data-close-editor]').forEach(n=>n.onclick=()=>closeModal('editorModal'));document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal:not([hidden])').forEach(m=>closeModal(m.id))});

el('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`agenda-financeira-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
el('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{state=normalizeState(JSON.parse(await file.text()));saveState();render();switchPage('home')}catch{alert('Backup inválido.')}e.target.value=''});
el('clearBtn').onclick=()=>{if(!confirm('Apagar todos os dados locais e começar do zero?'))return;state=emptyState();saveState();render();switchPage('home')};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;el('installBtn').hidden=false});el('installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;el('installBtn').hidden=true};
window.addEventListener('resize',()=>requestAnimationFrame(drawPie));if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js'));
el('movementDate').value=todayISO();render();
