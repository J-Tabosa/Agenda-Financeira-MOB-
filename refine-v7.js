(() => {
  const SPECIAL = {
    BILL_CASH: 'bill_payment_cash',
    BILL_CREDIT: 'bill_payment_credit',
    RESERVE_IN: 'reserve_transfer',
    RESERVE_OUT: 'reserve_withdrawal'
  };
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  let selectedCalendarDay = new Date().getDate();
  let paymentBillId = null;
  let reserveDirection = 'in';

  const oldRender = render;
  const oldRenderSettings = renderSettings;
  const oldOpenBillDetail = openBillDetail;
  const oldTransactionHtml = transactionHtml;

  const style = document.createElement('style');
  style.textContent = `
    .v7-action-card{display:grid;gap:12px}.v7-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    .v7-action{border:1px solid var(--line);background:#0e0e0e;color:var(--text);border-radius:16px;padding:13px;display:flex;align-items:center;gap:10px;text-align:left}.v7-action .material-symbols-outlined{color:var(--accent);font-size:25px}.v7-action span:last-child{display:grid;gap:2px}.v7-action small{font-size:.7rem}
    .calendar-launch{display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:12px}.calendar-launch-icon{width:44px;height:44px;border-radius:14px;background:var(--accent-soft);display:grid;place-items:center;color:var(--accent)}.calendar-launch strong{display:block}.calendar-launch-copy{display:grid;gap:3px}
    .calendar-modal-card{max-height:92vh}.calendar-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0}.calendar-month{font-weight:900;text-transform:capitalize}.calendar-nav{width:38px;height:38px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);border-radius:12px;display:grid;place-items:center}
    .calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.calendar-weekdays{margin-bottom:6px}.calendar-weekdays span{text-align:center;color:var(--muted);font-size:.65rem;font-weight:800}.calendar-day{aspect-ratio:1;border:1px solid var(--line);background:#0d0d0d;color:var(--text);border-radius:12px;padding:5px;display:grid;grid-template-rows:auto 1fr;align-items:start;justify-items:start;min-width:0}.calendar-day.empty{visibility:hidden}.calendar-day.today{border-color:#754318}.calendar-day.selected{background:var(--accent-soft);border-color:var(--accent)}.calendar-day-number{font-size:.72rem;font-weight:850}.calendar-dots{display:flex;flex-wrap:wrap;gap:2px;align-self:end}.calendar-dot{width:5px;height:5px;border-radius:50%;background:var(--accent)}.calendar-dot.income{background:#f0f0f0}.calendar-dot.bill{background:#ffb15c}.calendar-dot.reserve{background:#c7c7c7}.calendar-day-events{display:grid;gap:8px;margin-top:14px}.calendar-event{display:grid;grid-template-columns:8px 1fr auto;gap:9px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:14px;background:#0e0e0e}.calendar-event i{width:8px;height:8px;border-radius:50%;background:var(--accent)}.calendar-event.income i{background:#f0f0f0}.calendar-event.bill i{background:#ffb15c}.calendar-event.reserve i{background:#c7c7c7}.calendar-event small{display:block;margin-top:2px}.calendar-empty{color:var(--muted);text-align:center;padding:16px}
    .pay-button{width:100%;margin-top:14px;border:0;border-radius:15px;padding:13px;background:var(--accent);color:#130b05;font-weight:900}.paid-note{margin-top:12px;padding:11px;border-radius:14px;background:#17120d;border:1px solid #43301e;color:#d8c6b6;font-size:.8rem}
    .v7-modal-form{display:grid;gap:11px;margin-top:14px}.v7-modal-form label{display:grid;gap:7px}.v7-help{color:var(--muted);font-size:.78rem;line-height:1.45}.v7-total-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
    .month-archive-list{display:grid;gap:8px;margin-top:13px}.month-archive{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:11px;border:1px solid var(--line);border-radius:15px;background:#0e0e0e}.month-archive strong{font-size:.9rem}.month-archive .archive-values{text-align:right}.month-archive small{grid-column:1/-1}
    .internal-tx .amount{color:#c7c7c7!important}.bill-payment-tx .amount{color:var(--accent-2)!important}.tx.special .tx-edit{display:none}
    @media(max-width:390px){.v7-action-row{grid-template-columns:1fr}.calendar-grid,.calendar-weekdays{gap:3px}.calendar-day{border-radius:9px;padding:4px}.calendar-day-number{font-size:.66rem}}
  `;
  document.head.appendChild(style);

  function ensureExtensions() {
    state.meta = state.meta || { activeMonth: currentMonthKey() };
    if (!state.meta.activeMonth) state.meta.activeMonth = currentMonthKey();
    state.monthArchives = state.monthArchives || [];
  }

  function monthFromKey(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1, 12);
  }
  function nextMonthKey(key) {
    const d = monthFromKey(key);
    return monthKeyFromDate(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  }
  function endDateForMonth(key) {
    const d = monthFromKey(key);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  function txDate(tx) { return parseLocalDate(tx.effectiveDate || String(tx.createdAt || '').slice(0, 10)); }
  function isInternalKind(tx) { return [SPECIAL.BILL_CASH, SPECIAL.BILL_CREDIT, SPECIAL.RESERVE_IN, SPECIAL.RESERVE_OUT].includes(tx.kind); }
  function isLifestyleExpense(tx) { return tx.type === 'expense' && ![SPECIAL.BILL_CASH, SPECIAL.RESERVE_IN].includes(tx.kind); }

  function archiveMonth(key) {
    if (state.monthArchives.some(a => a.month === key)) return;
    const txs = state.transactions.filter(tx => monthKeyFromISO(tx.effectiveDate) === key);
    const spending = sum(txs.filter(isLifestyleExpense), x => x.amount);
    const cashIncome = sum(txs.filter(tx => tx.type === 'income' && tx.account === 'cash' && ![SPECIAL.RESERVE_OUT].includes(tx.kind)), x => x.amount);
    const cashOut = sum(txs.filter(tx => tx.type === 'expense' && tx.account === 'cash' && tx.kind !== SPECIAL.RESERVE_IN), x => x.amount);
    const end = endDateForMonth(key);
    const cashAtEnd = Number(state.base.cash || 0)
      + sum(state.transactions.filter(tx => tx.account === 'cash' && tx.type === 'income' && txDate(tx) && txDate(tx) <= end), x => x.amount)
      - sum(state.transactions.filter(tx => tx.account === 'cash' && tx.type === 'expense' && txDate(tx) && txDate(tx) <= end), x => x.amount);
    const bills = state.bills.map(b => {
      const base = b.baseMonth === key ? Number(b.value || 0) : 0;
      const btx = txs.filter(tx => tx.account === `bill:${b.id}`);
      const charged = base + sum(btx.filter(tx => tx.type === 'expense'), x => x.amount);
      const paid = sum(btx.filter(tx => tx.type === 'income'), x => x.amount);
      return { id: b.id, name: b.name, charged, paid, ending: Math.max(0, charged - paid) };
    });
    state.monthArchives.push({ month: key, closedAt: new Date().toISOString(), spending, cashIncome, cashOut, cashAtEnd, reservedAtClose: Number(state.base.reserved || 0), bills });
  }

  function closeMissedMonths() {
    ensureExtensions();
    const current = currentMonthKey();
    let cursor = state.meta.activeMonth;
    let guard = 0;
    if (cursor === current) return;
    while (cursor !== current && guard++ < 36) {
      archiveMonth(cursor);
      cursor = nextMonthKey(cursor);
    }
    state.meta.activeMonth = current;
    state.bills.forEach(b => { if (b.baseMonth !== current) { b.value = 0; b.baseMonth = current; } });
    saveState();
  }

  function injectUi() {
    const home = document.querySelector('[data-page="home"]');
    if (home && !document.getElementById('calendarLaunch')) {
      const panel = document.createElement('section');
      panel.className = 'panel';
      panel.id = 'calendarLaunch';
      panel.innerHTML = `<button id="openCalendarBtn" class="calendar-launch" type="button" style="border:0;background:transparent;color:inherit;width:100%;padding:0;text-align:left"><span class="calendar-launch-icon"><span class="material-symbols-outlined">calendar_month</span></span><span class="calendar-launch-copy"><small>CALENDÁRIO FINANCEIRO</small><strong id="calendarLaunchTitle">Este mês</strong><small id="calendarLaunchHint">Veja recebimentos, cobranças e vencimentos</small></span><span class="material-symbols-outlined" style="color:var(--accent)">chevron_right</span></button>`;
      const finance = home.querySelector('.finance-panel');
      finance?.insertAdjacentElement('afterend', panel);
    }

    const settings = document.querySelector('[data-page="settings"]');
    if (settings && !document.getElementById('reserveTransferPanel')) {
      const basePanel = settings.querySelector('#baseForm')?.closest('.panel');
      const reservePanel = document.createElement('section');
      reservePanel.id = 'reserveTransferPanel'; reservePanel.className = 'panel v7-action-card';
      reservePanel.innerHTML = `<div class="section-title"><div><p class="eyebrow">RESERVA</p><h2>Movimentar dinheiro guardado</h2></div><strong id="reservePanelValue">R$ 0,00</strong></div><div class="v7-action-row"><button class="v7-action" id="reserveInBtn" type="button"><span class="material-symbols-outlined">savings</span><span><strong>Guardar dinheiro</strong><small>Saldo → reserva</small></span></button><button class="v7-action" id="reserveOutBtn" type="button"><span class="material-symbols-outlined">account_balance_wallet</span><span><strong>Retirar da reserva</strong><small>Reserva → saldo</small></span></button></div>`;
      basePanel?.insertAdjacentElement('afterend', reservePanel);
    }
    if (settings && !document.getElementById('monthArchivePanel')) {
      const util = settings.querySelector('.utility-panel');
      const archive = document.createElement('section');
      archive.id = 'monthArchivePanel'; archive.className = 'panel';
      archive.innerHTML = `<div class="section-title"><div><p class="eyebrow">CICLOS</p><h2>Fechamentos mensais</h2></div><small id="currentCycleLabel"></small></div><div id="monthArchiveList" class="month-archive-list"></div>`;
      util?.insertAdjacentElement('beforebegin', archive);
    }

    if (!document.getElementById('calendarModal')) {
      document.body.insertAdjacentHTML('beforeend', `<div id="calendarModal" class="modal" hidden><div class="modal-backdrop" data-close-calendar></div><section class="modal-card calendar-modal-card" role="dialog" aria-modal="true"><button class="modal-close" type="button" data-close-calendar aria-label="Fechar">×</button><p class="eyebrow">CALENDÁRIO FINANCEIRO</p><div class="calendar-head"><button id="calendarPrev" class="calendar-nav" type="button"><span class="material-symbols-outlined">chevron_left</span></button><strong id="calendarMonthTitle" class="calendar-month"></strong><button id="calendarNext" class="calendar-nav" type="button"><span class="material-symbols-outlined">chevron_right</span></button></div><div class="calendar-weekdays"><span>SEG</span><span>TER</span><span>QUA</span><span>QUI</span><span>SEX</span><span>SÁB</span><span>DOM</span></div><div id="calendarGrid" class="calendar-grid"></div><div id="calendarDayEvents" class="calendar-day-events"></div></section></div>`);
    }
    if (!document.getElementById('billPaymentModal')) {
      document.body.insertAdjacentHTML('beforeend', `<div id="billPaymentModal" class="modal" hidden><div class="modal-backdrop" data-close-payment></div><section class="modal-card" role="dialog" aria-modal="true"><button class="modal-close" type="button" data-close-payment>×</button><p class="eyebrow">PAGAR FATURA</p><h2 id="paymentBillName">Fatura</h2><form id="billPaymentForm" class="v7-modal-form"><label>Valor do pagamento<input id="billPaymentAmount" type="number" min="0.01" step="0.01" required></label><div class="v7-help">O valor sai do saldo disponível e reduz a fatura. O pagamento não entra novamente nos seus “Gastos do mês”, evitando contagem duplicada.</div><button class="primary" type="submit">Confirmar pagamento</button></form></section></div>`);
    }
    if (!document.getElementById('reserveModal')) {
      document.body.insertAdjacentHTML('beforeend', `<div id="reserveModal" class="modal" hidden><div class="modal-backdrop" data-close-reserve></div><section class="modal-card" role="dialog" aria-modal="true"><button class="modal-close" type="button" data-close-reserve>×</button><p class="eyebrow">RESERVA</p><h2 id="reserveModalTitle">Guardar dinheiro</h2><form id="reserveForm" class="v7-modal-form"><label>Valor<input id="reserveAmount" type="number" min="0.01" step="0.01" required></label><div id="reserveHelp" class="v7-help"></div><button class="primary" type="submit">Confirmar transferência</button></form></section></div>`);
    }
  }

  function eventTypeClass(type) { return ['income','bill','reserve'].includes(type) ? type : 'expense'; }
  function calendarEventsForMonth(date) {
    const y = date.getFullYear(), m = date.getMonth(), key = monthKeyFromDate(date), events = [];
    const txs = state.transactions.filter(tx => monthKeyFromISO(tx.effectiveDate) === key && tx.kind !== SPECIAL.BILL_CREDIT);
    txs.forEach(tx => {
      const d = parseLocalDate(tx.effectiveDate); if (!d) return;
      let type = tx.type === 'income' ? 'income' : 'expense';
      let title = tx.description || tx.category;
      let value = tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount);
      if (tx.kind === SPECIAL.BILL_CASH) { type = 'bill'; title = tx.description || 'Pagamento de fatura'; }
      if (tx.kind === SPECIAL.RESERVE_IN) { type = 'reserve'; title = 'Transferência para reserva'; }
      if (tx.kind === SPECIAL.RESERVE_OUT) { type = 'reserve'; title = 'Retirada da reserva'; value = Number(tx.amount); }
      events.push({ day: d.getDate(), date: d, type, title, subtitle: accountLabel(tx.account), value, actual: true });
    });
    state.schedules.forEach(s => {
      const occ = scheduleOccurrence(s, y, m); if (!occ) return;
      const keyOcc = occurrenceKey(s, occ);
      if (state.transactions.some(tx => tx.occurrenceKey === keyOcc)) return;
      events.push({ day: occ.getDate(), date: occ, type: 'expense', title: s.name || s.category, subtitle: `${accountLabel(s.account)}${s.recurrence === 'monthly' ? ' · recorrente' : ''}`, value: -Number(s.value || 0), future: true });
    });
    state.incomes.forEach(i => {
      const occ = incomeOccurrenceForMonth(i, y, m); if (!occ) return;
      const received = incomeReceivedForOccurrence(i, occ);
      events.push({ day: occ.getDate(), date: occ, type: 'income', title: i.name, subtitle: received ? 'Recebido' : 'Previsto para receber', value: Number(i.value || 0), future: !received });
    });
    state.bills.forEach(b => {
      if (!b.dueDay) return;
      const due = dateForMonthDay(y, m, b.dueDay);
      const amount = key === currentMonthKey() ? billProjected(b) : 0;
      events.push({ day: due.getDate(), date: due, type: 'bill', title: `Vencimento · ${b.name}`, subtitle: amount ? `Fatura projetada ${money.format(amount)}` : 'Vencimento da fatura', value: amount ? -amount : null });
    });
    return events.sort((a,b) => a.date - b.date || a.title.localeCompare(b.title));
  }

  function renderCalendar() {
    const events = calendarEventsForMonth(calendarCursor);
    el('calendarMonthTitle').textContent = calendarCursor.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    const first = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1, 12);
    const days = daysInMonth(calendarCursor.getFullYear(), calendarCursor.getMonth());
    const mondayOffset = (first.getDay() + 6) % 7;
    const today = new Date();
    let html = '';
    for (let i=0;i<mondayOffset;i++) html += '<span class="calendar-day empty"></span>';
    for (let day=1;day<=days;day++) {
      const dayEvents = events.filter(e => e.day === day);
      const isToday = today.getFullYear()===calendarCursor.getFullYear() && today.getMonth()===calendarCursor.getMonth() && today.getDate()===day;
      html += `<button type="button" class="calendar-day${isToday?' today':''}${selectedCalendarDay===day?' selected':''}" data-calendar-day="${day}"><span class="calendar-day-number">${day}</span><span class="calendar-dots">${dayEvents.slice(0,4).map(e=>`<i class="calendar-dot ${eventTypeClass(e.type)}"></i>`).join('')}</span></button>`;
    }
    el('calendarGrid').innerHTML = html;
    el('calendarGrid').querySelectorAll('[data-calendar-day]').forEach(btn => btn.onclick = () => { selectedCalendarDay = Number(btn.dataset.calendarDay); renderCalendar(); });
    const selected = events.filter(e => e.day === selectedCalendarDay);
    const selectedDate = new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),selectedCalendarDay,12);
    el('calendarDayEvents').innerHTML = `<div class="section-title"><div><p class="eyebrow">${selectedDate.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase()}</p><h2>${selectedDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})}</h2></div></div>` + (selected.length ? selected.map(e => `<div class="calendar-event ${eventTypeClass(e.type)}"><i></i><span><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.subtitle || '')}${e.future?' · futuro':''}</small></span><strong>${e.value==null?'—':`${e.value>0?'+':''}${money.format(e.value)}`}</strong></div>`).join('') : '<div class="calendar-empty">Nenhum evento financeiro neste dia.</div>');
  }

  function renderCalendarLaunch() {
    const current = new Date(new Date().getFullYear(),new Date().getMonth(),1,12);
    const events = calendarEventsForMonth(current).filter(e => e.date >= parseLocalDate(todayISO()));
    const next = events.slice(0,3);
    el('calendarLaunchTitle').textContent = current.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    el('calendarLaunchHint').textContent = next.length ? next.map(e => `${e.day} · ${e.title}`).join('  •  ') : 'Nenhum próximo evento cadastrado';
  }

  function openCalendar() {
    const now = new Date(); calendarCursor = new Date(now.getFullYear(),now.getMonth(),1,12); selectedCalendarDay = now.getDate(); renderCalendar(); openModal('calendarModal');
  }

  function openPayment(id) {
    const bill = state.bills.find(b => b.id === id); if (!bill) return;
    const current = billCurrent(bill); if (current <= 0) return;
    paymentBillId = id; el('paymentBillName').textContent = bill.name; el('billPaymentAmount').value = current.toFixed(2); openModal('billPaymentModal'); setTimeout(()=>el('billPaymentAmount').focus(),100);
  }
  function payBill(amount) {
    const bill = state.bills.find(b => b.id === paymentBillId); if (!bill) return false;
    const current = billCurrent(bill), value = Number(amount || 0);
    if (value <= 0 || value > current + .001) { alert('Informe um valor válido, até o total atual da fatura.'); return false; }
    if (value > currentCash() + .001) { alert('Seu saldo disponível é menor que esse pagamento.'); return false; }
    const group = uid(), date = todayISO(), label = `Pagamento da fatura ${bill.name}`;
    state.transactions.push({id:uid(),type:'expense',amount:value,category:'Pagamento de fatura',account:'cash',description:label,effectiveDate:date,createdAt:new Date().toISOString(),kind:SPECIAL.BILL_CASH,paymentGroup:group,billId:bill.id});
    state.transactions.push({id:uid(),type:'income',amount:value,category:'Pagamento de fatura',account:`bill:${bill.id}`,description:label,effectiveDate:date,createdAt:new Date().toISOString(),kind:SPECIAL.BILL_CREDIT,paymentGroup:group,billId:bill.id});
    saveState(); return true;
  }

  function openReserve(direction) {
    reserveDirection = direction; el('reserveAmount').value = '';
    if (direction === 'in') { el('reserveModalTitle').textContent = 'Guardar dinheiro'; el('reserveHelp').textContent = `Disponível agora: ${money.format(currentCash())}. O valor sairá do saldo e passará a compor sua reserva.`; }
    else { el('reserveModalTitle').textContent = 'Retirar da reserva'; el('reserveHelp').textContent = `Reservado agora: ${money.format(state.base.reserved || 0)}. O valor voltará para o saldo disponível.`; }
    openModal('reserveModal'); setTimeout(()=>el('reserveAmount').focus(),100);
  }
  function moveReserve(value) {
    const amount = Number(value || 0); if (amount <= 0) return false;
    if (reserveDirection === 'in') {
      if (amount > currentCash() + .001) { alert('Esse valor é maior que seu saldo disponível.'); return false; }
      state.base.reserved = Number(state.base.reserved || 0) + amount;
      state.transactions.push({id:uid(),type:'expense',amount,category:'Transferência interna',account:'cash',description:'Transferência para reserva',effectiveDate:todayISO(),createdAt:new Date().toISOString(),kind:SPECIAL.RESERVE_IN});
    } else {
      if (amount > Number(state.base.reserved || 0) + .001) { alert('Esse valor é maior que sua reserva atual.'); return false; }
      state.base.reserved = Number(state.base.reserved || 0) - amount;
      state.transactions.push({id:uid(),type:'income',amount,category:'Transferência interna',account:'cash',description:'Retirada da reserva',effectiveDate:todayISO(),createdAt:new Date().toISOString(),kind:SPECIAL.RESERVE_OUT});
    }
    saveState(); return true;
  }

  actualExpensesThisMonth = function() { return monthTransactions().filter(tx => tx.type === 'expense' && ![SPECIAL.BILL_CASH,SPECIAL.RESERVE_IN].includes(tx.kind)); };

  transactionHtml = function(tx) {
    if (tx.kind === SPECIAL.BILL_CREDIT) return '';
    if (tx.kind === SPECIAL.BILL_CASH) return `<div class="tx special bill-payment-tx"><div><strong>${escapeHtml(tx.description || 'Pagamento de fatura')}</strong><div class="meta">Pagamento · ${formatDate(tx.effectiveDate)}</div></div><div class="tx-side"><div class="amount expense">-${money.format(tx.amount)}</div></div></div>`;
    if (tx.kind === SPECIAL.RESERVE_IN) return `<div class="tx special internal-tx"><div><strong>Guardado na reserva</strong><div class="meta">Transferência interna · ${formatDate(tx.effectiveDate)}</div></div><div class="tx-side"><div class="amount expense">-${money.format(tx.amount)}</div></div></div>`;
    if (tx.kind === SPECIAL.RESERVE_OUT) return `<div class="tx special internal-tx"><div><strong>Retirado da reserva</strong><div class="meta">Transferência interna · ${formatDate(tx.effectiveDate)}</div></div><div class="tx-side"><div class="amount income">+${money.format(tx.amount)}</div></div></div>`;
    return oldTransactionHtml(tx);
  };

  renderHistory = function() {
    const visible = state.transactions.filter(tx => tx.kind !== SPECIAL.BILL_CREDIT);
    el('history').innerHTML = visible.length ? [...visible].sort((a,b)=>parseLocalDate(b.effectiveDate)-parseLocalDate(a.effectiveDate)).slice(0,120).map(transactionHtml).join('') : '<div class="empty">Nenhum movimento realizado ainda.</div>';
  };

  openBillDetail = function(id) {
    oldOpenBillDetail(id);
    const bill = state.bills.find(b=>b.id===id); if (!bill) return;
    const current = billCurrent(bill);
    const rows = el('detailRows');
    const paidThisMonth = state.transactions.filter(tx=>tx.kind===SPECIAL.BILL_CREDIT && tx.billId===id && monthKeyFromISO(tx.effectiveDate)===currentMonthKey());
    if (paidThisMonth.length) rows.insertAdjacentHTML('beforeend', `<div class="paid-note">Pagamentos realizados neste ciclo: <strong>${money.format(sum(paidThisMonth,x=>x.amount))}</strong>.</div>`);
    if (current > 0) rows.insertAdjacentHTML('beforeend', `<button class="pay-button" id="payCurrentBill" type="button"><span class="material-symbols-outlined" style="vertical-align:middle;font-size:20px">payments</span> Pagar fatura atual</button>`);
    document.getElementById('payCurrentBill')?.addEventListener('click',()=>{closeModal('detailModal');openPayment(id)});
  };

  function renderReservePanel() { if (el('reservePanelValue')) el('reservePanelValue').textContent = money.format(state.base.reserved || 0); }
  function renderArchives() {
    if (!el('monthArchiveList')) return;
    el('currentCycleLabel').textContent = `Ciclo atual: ${monthFromKey(currentMonthKey()).toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}`;
    const archives = [...state.monthArchives].sort((a,b)=>b.month.localeCompare(a.month)).slice(0,6);
    el('monthArchiveList').innerHTML = archives.length ? archives.map(a=>`<div class="month-archive"><strong>${monthFromKey(a.month).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong><span class="archive-values"><strong>${money.format(a.spending)}</strong></span><small>Gastos realizados · saldo ao fechar ${money.format(a.cashAtEnd)} · reserva ${money.format(a.reservedAtClose)}</small></div>`).join('') : '<div class="empty-list">O primeiro fechamento será criado automaticamente quando o mês virar.</div>';
  }

  renderSettings = function() { oldRenderSettings(); renderReservePanel(); renderArchives(); };

  render = function() {
    ensureExtensions();
    oldRender();
    renderReservePanel(); renderArchives(); renderCalendarLaunch();
  };

  injectUi();
  ensureExtensions();
  materializeDueSchedules();
  closeMissedMonths();

  document.getElementById('openCalendarBtn').onclick = openCalendar;
  document.getElementById('calendarPrev').onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1,12); selectedCalendarDay=1; renderCalendar(); };
  document.getElementById('calendarNext').onclick = () => { calendarCursor = new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1,12); selectedCalendarDay=1; renderCalendar(); };
  document.querySelectorAll('[data-close-calendar]').forEach(n=>n.onclick=()=>closeModal('calendarModal'));
  document.querySelectorAll('[data-close-payment]').forEach(n=>n.onclick=()=>closeModal('billPaymentModal'));
  document.querySelectorAll('[data-close-reserve]').forEach(n=>n.onclick=()=>closeModal('reserveModal'));
  document.getElementById('reserveInBtn').onclick = () => openReserve('in');
  document.getElementById('reserveOutBtn').onclick = () => openReserve('out');
  document.getElementById('billPaymentForm').onsubmit = e => { e.preventDefault(); if (payBill(el('billPaymentAmount').value)) { closeModal('billPaymentModal'); render(); switchPage('home'); } };
  document.getElementById('reserveForm').onsubmit = e => { e.preventDefault(); if (moveReserve(el('reserveAmount').value)) { closeModal('reserveModal'); render(); } };

  render();
})();
