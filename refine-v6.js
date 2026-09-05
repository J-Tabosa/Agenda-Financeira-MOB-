(() => {
  let editingMovement = null;
  const oldRender = render;
  const oldRenderSettings = renderSettings;
  const oldBindSettingsActions = bindSettingsActions;

  const style = document.createElement('style');
  style.textContent = `
    .chart-center small{color:var(--muted)}
    .chart-center strong{color:#fff!important;text-shadow:0 1px 2px rgba(0,0,0,.6)}
    .edit-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 13px;border:1px solid #5b3512;border-radius:15px;background:var(--accent-soft)}
    .edit-banner[hidden]{display:none}.edit-banner>div{display:grid;gap:3px}.edit-banner small{font-size:.74rem}
    .tx-side{display:grid;justify-items:end;align-content:center;gap:6px}.tx-edit{width:32px;height:32px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);border-radius:10px;display:grid;place-items:center;padding:0}.tx-edit .material-symbols-outlined{font-size:18px}.tx-edit:active{color:var(--accent);border-color:#5b3512}
    .projection-explain{padding:13px 14px;border:1px solid #4b2a0d;border-radius:15px;background:#1a1008;color:#d8c6b6;line-height:1.5;font-size:.83rem;margin-bottom:4px}.detail-row.informational strong{color:var(--accent-2)}
  `;
  document.head.appendChild(style);

  const reservedCard = document.getElementById('reservedTotal')?.closest('.mini-card');
  if (reservedCard) {
    const note = reservedCard.querySelector('small');
    if (note) note.textContent = 'Valor que você já tem guardado';
  }
  const reservedInput = document.getElementById('setReserved')?.closest('label');
  if (reservedInput?.firstChild) reservedInput.firstChild.textContent = 'Valor já reservado ';

  function ensureEditBanner() {
    if (document.getElementById('movementEditBanner')) return;
    const form = document.getElementById('transactionForm');
    if (!form) return;
    const banner = document.createElement('div');
    banner.id = 'movementEditBanner';
    banner.className = 'edit-banner';
    banner.hidden = true;
    banner.innerHTML = '<div><strong>Editando gasto</strong><small>Altere os dados abaixo e salve.</small></div><button id="cancelMovementEdit" class="ghost compact" type="button">Cancelar</button>';
    form.parentElement.insertBefore(banner, form);
    const submit = form.querySelector('button[type="submit"]');
    if (submit && !submit.id) submit.id = 'movementSubmitBtn';
    document.getElementById('cancelMovementEdit').onclick = () => { clearMovementEdit(); switchPage('spending'); };
  }
  ensureEditBanner();

  nextProjectionHorizon = function() {
    const pending = pendingIncomeOccurrences();
    if (pending.length) return { date: pending[0].date, label: `Até receber ${pending[0].income.name} · ${shortDate(isoFromDate(pending[0].date))}`, income: pending[0].income };
    return { date: endOfCurrentMonth(), label: 'Até o fim do mês', income: null };
  };

  projectionAtHorizon = function() {
    const horizon = nextProjectionHorizon().date;
    let value = currentCash();
    value += sum(incomesUntil(horizon), x => x.income.value);
    value -= futureCashSchedulesUntil(horizon);
    for (const bill of state.bills) {
      const due = billDueDateForMonth(bill, new Date());
      if (due && due >= parseLocalDate(todayISO()) && due <= horizon) value -= billProjectedThrough(bill, due);
    }
    return value;
  };

  renderChart = function() {
    const horizon = nextProjectionHorizon();
    el('projectionTitle').textContent = horizon.label;
    el('chartCenter').textContent = money.format(projectionAtHorizon());
    const items = chartData();
    el('chartLegend').innerHTML = items.map(item => `<button class="legend-item" type="button" data-chart-id="${item.id}"><i class="legend-dot" style="background:${item.color}"></i><span>${escapeHtml(item.name)}</span><strong>${money.format(item.value)}</strong></button>`).join('');
    const cutoff = shortDate(isoFromDate(horizon.date));
    el('chartCaption').textContent = horizon.income
      ? `Até ${cutoff}, a projeção inclui o recebimento de ${horizon.income.name} e somente cobranças com data até esse dia. O valor já reservado fica separado e não é descontado.`
      : `Sem entrada pendente neste ciclo: a projeção vai até ${cutoff}. O valor já reservado fica separado e não é descontado.`;
    requestAnimationFrame(drawPie);
    el('chartLegend').querySelectorAll('[data-chart-id]').forEach(btn => btn.onclick = () => btn.dataset.chartId === 'projection' ? openProjectionDetail() : openBillDetail(btn.dataset.chartId.replace('bill:', '')));
  };

  openProjectionDetail = function() {
    const h = nextProjectionHorizon();
    const inc = incomesUntil(h.date);
    const cashFuture = futureCashSchedulesUntil(h.date);
    const cutoff = shortDate(isoFromDate(h.date));
    const explanation = h.income
      ? `Esta projeção responde quanto você deve ter disponível ao chegar em ${cutoff}, data em que está previsto receber ${escapeHtml(h.income.name)}. A própria entrada de ${escapeHtml(h.income.name)} entra no cálculo. Só entram gastos, cobranças e vencimentos com data até ${cutoff}; tudo que acontecer depois continua como previsto para o próximo trecho do ciclo. O valor reservado é dinheiro que você já possui separado e não é abatido desta conta.`
      : `Como não há outra entrada pendente cadastrada neste mês, esta projeção vai até ${cutoff}. Ela considera apenas eventos datados até o fim do mês. O valor reservado é dinheiro que você já possui separado e não é abatido desta conta.`;
    const rows = [
      `<div class="projection-explain">${explanation}</div>`,
      `<div class="detail-row"><span>Saldo disponível agora</span><strong>${money.format(currentCash())}</strong></div>`,
      `<div class="detail-row informational"><span>Reservado já existente · fora do cálculo</span><strong>${money.format(state.base.reserved || 0)}</strong></div>`,
      ...inc.map(x => `<div class="detail-row"><span>${escapeHtml(x.income.name)} · recebe ${shortDate(isoFromDate(x.date))}</span><strong>+ ${money.format(x.income.value)}</strong></div>`),
      cashFuture ? `<div class="detail-row"><span>Débito previsto até ${cutoff}</span><strong>- ${money.format(cashFuture)}</strong></div>` : '',
      ...state.bills.map(b => {
        const due = billDueDateForMonth(b, new Date());
        return due && due >= parseLocalDate(todayISO()) && due <= h.date
          ? `<div class="detail-row"><span>${escapeHtml(b.name)} · vence ${shortDate(isoFromDate(due))}</span><strong>- ${money.format(billProjectedThrough(b, due))}</strong></div>`
          : '';
      })
    ].filter(Boolean);
    el('detailTitle').textContent = h.income ? `Projeção até receber ${h.income.name}` : 'Projeção até o fim do mês';
    el('detailValue').textContent = money.format(projectionAtHorizon());
    el('detailSubtitle').textContent = h.income ? `Ciclo atual: hoje → ${cutoff}. Depois do recebimento, o horizonte avança automaticamente.` : `Ciclo atual: hoje → ${cutoff}.`;
    el('detailRows').innerHTML = rows.join('');
    openModal('detailModal');
  };
  el('financeChartButton').onclick = openProjectionDetail;

  transactionHtml = function(tx) {
    const sign = tx.type === 'income' ? '+' : '-';
    const date = formatDate(tx.effectiveDate);
    const edit = tx.type === 'expense' ? `<button class="tx-edit" type="button" data-edit-transaction="${tx.id}" aria-label="Editar gasto"><span class="material-symbols-outlined">edit</span></button>` : '';
    return `<div class="tx"><div><strong>${escapeHtml(tx.description || tx.category)}</strong><div class="meta">${escapeHtml(tx.category)} · ${escapeHtml(accountLabel(tx.account))} · ${date}</div></div><div class="tx-side"><div class="amount ${tx.type}">${sign}${money.format(tx.amount)}</div>${edit}</div></div>`;
  };

  spendingHtml = function(tx) {
    if (tx.future) return `<div class="tx future-tx"><div><strong>${escapeHtml(tx.description || tx.category)}</strong><div class="meta">${escapeHtml(tx.category)} · ${escapeHtml(accountLabel(tx.account))} · previsto ${shortDate(tx.effectiveDate)}${tx.recurrence === 'monthly' ? ' · mensal' : ''}</div></div><div class="tx-side"><div class="amount future">${money.format(tx.amount)}</div><button class="tx-edit" type="button" data-edit-schedule="${tx.scheduleId}" aria-label="Editar gasto previsto"><span class="material-symbols-outlined">edit</span></button></div></div>`;
    return transactionHtml(tx);
  };

  renderSettings = function() {
    oldRenderSettings();
    document.querySelectorAll('[data-remove-schedule]').forEach(removeBtn => {
      const wrap = removeBtn.parentElement;
      if (!wrap || wrap.querySelector('[data-edit-schedule]')) return;
      const edit = document.createElement('button');
      edit.className = 'mini-icon-button';
      edit.type = 'button';
      edit.dataset.editSchedule = removeBtn.dataset.removeSchedule;
      edit.title = 'Editar gasto programado';
      edit.innerHTML = '<span class="material-symbols-outlined">edit</span>';
      wrap.insertBefore(edit, removeBtn);
    });
    bindMovementEditButtons();
  };

  bindSettingsActions = function() {
    oldBindSettingsActions();
    document.querySelectorAll('[data-edit-schedule]').forEach(b => b.onclick = () => startEditSchedule(b.dataset.editSchedule));
  };

  function bindMovementEditButtons() {
    document.querySelectorAll('[data-edit-transaction]').forEach(b => b.onclick = () => startEditTransaction(b.dataset.editTransaction));
    document.querySelectorAll('[data-edit-schedule]').forEach(b => b.onclick = () => startEditSchedule(b.dataset.editSchedule));
  }

  function fillMovementForm(data, recurring = false) {
    ensureEditBanner();
    el('type').value = 'expense';
    el('type').disabled = true;
    el('amount').value = data.amount ?? data.value ?? 0;
    el('category').value = data.category || 'Outros';
    el('account').value = data.account || 'cash';
    el('description').value = data.description || data.name || '';
    el('movementDate').value = data.effectiveDate || data.startDate || todayISO();
    el('movementRecurring').checked = recurring;
    el('movementEditBanner').hidden = false;
    const submit = el('movementSubmitBtn') || el('transactionForm').querySelector('button[type="submit"]');
    submit.textContent = 'Salvar alterações';
    syncMovementForm();
    switchPage('add');
    setTimeout(() => el('amount').focus(), 150);
  }

  function startEditTransaction(id) {
    const tx = state.transactions.find(x => x.id === id && x.type === 'expense');
    if (!tx) return;
    const linked = tx.scheduleId ? state.schedules.find(s => s.id === tx.scheduleId) : null;
    if (linked) { startEditSchedule(linked.id); return; }
    editingMovement = { kind: 'transaction', id };
    fillMovementForm(tx, false);
  }

  function startEditSchedule(id) {
    const schedule = state.schedules.find(x => x.id === id);
    if (!schedule) return;
    editingMovement = { kind: 'schedule', id };
    fillMovementForm(schedule, schedule.recurrence === 'monthly');
  }

  function clearMovementEdit(reset = true) {
    editingMovement = null;
    el('type').disabled = false;
    if (el('movementEditBanner')) el('movementEditBanner').hidden = true;
    const submit = el('movementSubmitBtn') || el('transactionForm').querySelector('button[type="submit"]');
    submit.textContent = 'Salvar movimento';
    if (reset) {
      el('transactionForm').reset();
      el('type').value = 'expense';
      el('movementDate').value = todayISO();
    }
    syncMovementForm();
  }

  function movementPayload() {
    return {
      amount: Number(el('amount').value || 0), category: el('category').value,
      account: el('account').value, description: el('description').value.trim(),
      date: el('movementDate').value || todayISO(), recurring: el('movementRecurring').checked
    };
  }

  function saveEditedMovement() {
    const data = movementPayload();
    if (!data.amount || data.amount <= 0) return false;
    const today = parseLocalDate(todayISO());
    const dateObj = parseLocalDate(data.date);
    if (editingMovement.kind === 'transaction') {
      const tx = state.transactions.find(x => x.id === editingMovement.id);
      if (!tx) return false;
      if (data.recurring) {
        const scheduleId = uid();
        state.schedules.push({ id: scheduleId, name: data.description || data.category, value: data.amount, category: data.category, account: data.account, startDate: data.date, recurrence: 'monthly', createdAt: new Date().toISOString() });
        if (dateObj <= today) Object.assign(tx, { amount: data.amount, category: data.category, account: data.account, description: data.description, effectiveDate: data.date, scheduleId, occurrenceKey: `${scheduleId}:${monthKeyFromISO(data.date)}` });
        else state.transactions = state.transactions.filter(x => x.id !== tx.id);
      } else if (dateObj > today) {
        state.transactions = state.transactions.filter(x => x.id !== tx.id);
        state.schedules.push({ id: uid(), name: data.description || data.category, value: data.amount, category: data.category, account: data.account, startDate: data.date, recurrence: 'once', createdAt: new Date().toISOString() });
      } else {
        Object.assign(tx, { amount: data.amount, category: data.category, account: data.account, description: data.description, effectiveDate: data.date });
        delete tx.scheduleId; delete tx.occurrenceKey;
      }
    } else {
      const schedule = state.schedules.find(x => x.id === editingMovement.id);
      if (!schedule) return false;
      Object.assign(schedule, { name: data.description || data.category, value: data.amount, category: data.category, account: data.account, startDate: data.date, recurrence: data.recurring ? 'monthly' : 'once' });
      if (schedule.recurrence === 'once' && dateObj <= today) {
        const linked = state.transactions.find(t => t.scheduleId === schedule.id);
        if (linked) linked.occurrenceKey = `${schedule.id}:once`;
      }
    }
    saveState();
    clearMovementEdit();
    render();
    return true;
  }

  document.getElementById('transactionForm').addEventListener('submit', e => {
    if (!editingMovement) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (saveEditedMovement()) switchPage('spending');
  }, true);

  document.querySelectorAll('.quick').forEach(btn => btn.addEventListener('click', () => clearMovementEdit(), true));

  render = function() {
    oldRender();
    bindMovementEditButtons();
  };

  render();
})();
