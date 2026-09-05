(() => {
  const OFFICIAL_LOGOS = {
    ifood: 'https://www.ifood.com.br/favicon.ico',
    cinemark: 'https://www.cinemark.com/favicon.ico',
    openai: 'https://openai.com/favicon.svg',
    netflix: 'https://www.netflix.com/favicon.ico',
    bb: 'https://www.bb.com.br/favicon.ico',
    renner: 'https://www.lojasrenner.com.br/favicon.ico'
  };
  const FILTERS = ['Todos','iFood','Cinema','Comida fora','Transporte','Assinaturas','Academia','Cuidados pessoais','Compras','Outros'];
  const FILTER_ICONS = {
    'Comida fora':'restaurant','Transporte':'directions_car','Assinaturas':'subscriptions',
    'Academia':'fitness_center','Cuidados pessoais':'content_cut','Compras':'shopping_bag','Outros':'more_horiz'
  };
  let activeFilter = 'Todos';

  function injectResources() {
    if (!document.querySelector('link[data-v3-style]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'refine-v3.css'; css.dataset.v3Style = '1';
      document.head.appendChild(css);
    }
    if (!document.querySelector('link[data-material-symbols]')) {
      const icons = document.createElement('link');
      icons.rel = 'stylesheet';
      icons.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0';
      icons.dataset.materialSymbols = '1';
      document.head.appendChild(icons);
    }
  }

  function logo(url, alt, cls='v3-brand-logo') {
    return `<img class="${cls}" src="${url}" alt="${escapeHtml(alt)}" />`;
  }
  function material(name) { return `<span class="material-symbols-outlined">${name}</span>`; }
  function avgSenai() { return (Number(state.base.senaiMin || 0) + Number(state.base.senaiMax || 0)) / 2; }
  function projectedAvailableV3() {
    return currentCash() + avgSenai() + Number(state.base.nextSalary || 0) - Number(state.base.savingsGoal || 0) - bbProjected() - rennerCurrent();
  }

  function prepareHomeChart() {
    const panel = document.querySelector('[data-page="home"] .compact-panel');
    if (!panel || panel.dataset.v3Ready) return;
    panel.dataset.v3Ready = '1';
    panel.classList.add('v3-finance-panel');
    panel.innerHTML = `
      <span id="freeAfterSenai" class="v3-hidden"></span><span id="freeRange" class="v3-hidden"></span>
      <div class="section-title"><div><p class="eyebrow">VISÃO FINANCEIRA</p><h2>Projeção e faturas</h2></div><small>Toque para expandir</small></div>
      <div class="v3-chart-layout">
        <button id="v3FinanceChart" class="v3-chart" type="button" data-v3-detail="projection" aria-label="Detalhar projeção financeira">
          <span class="v3-chart-hole"><small>Projetado</small><strong id="v3ChartCenter">R$ 0,00</strong></span>
        </button>
        <div class="v3-chart-legend">
          <button type="button" class="v3-legend" data-v3-detail="projection"><i class="v3-dot projection"></i><span>Disponível projetado</span><strong id="v3LegendProjection"></strong></button>
          <button type="button" class="v3-legend" data-v3-detail="bb"><i class="v3-dot bb"></i><span>Fatura BB</span><strong id="v3LegendBB"></strong></button>
          <button type="button" class="v3-legend" data-v3-detail="renner"><i class="v3-dot renner"></i><span>Fatura Renner</span><strong id="v3LegendRenner"></strong></button>
        </div>
      </div>
      <small id="v3ChartCaption" class="v3-chart-caption"></small>`;
    panel.addEventListener('click', e => {
      const trigger = e.target.closest('[data-v3-detail]');
      if (!trigger) return;
      const type = trigger.dataset.v3Detail;
      if (type === 'projection') openProjectionModal(); else openBillModal(type);
    });
  }

  function prepareBillLogos() {
    const bb = document.querySelector('.bill-bubble[data-bill="bb"] .bill-brand');
    const renner = document.querySelector('.bill-bubble[data-bill="renner"] .bill-brand');
    if (bb) bb.innerHTML = logo(OFFICIAL_LOGOS.bb, 'Banco do Brasil');
    if (renner) renner.innerHTML = logo(OFFICIAL_LOGOS.renner, 'Renner');
  }

  function prepareQuickButtons() {
    document.querySelectorAll('.quick').forEach(btn => {
      if (btn.dataset.v3Ready) return;
      btn.dataset.v3Ready = '1';
      const isIfood = btn.dataset.category === 'iFood';
      const url = isIfood ? OFFICIAL_LOGOS.ifood : OFFICIAL_LOGOS.cinemark;
      const alt = isIfood ? 'iFood' : 'Cinemark';
      btn.classList.add('v3-quick');
      btn.innerHTML = `<span class="v3-logo-shell">${logo(url, alt)}</span><strong>R$ ${Number(btn.dataset.quick).toLocaleString('pt-BR')}</strong>`;
      btn.title = `${alt} · R$ ${Number(btn.dataset.quick).toLocaleString('pt-BR')}`;
      btn.setAttribute('aria-label', btn.title);
    });
  }

  function prepareNavIcons() {
    const mapping = {home:'home',add:'add_circle',spending:'donut_large',history:'receipt_long',settings:'settings'};
    document.querySelectorAll('.nav-item').forEach(btn => {
      const span = btn.querySelector('span');
      if (!span) return;
      span.className = 'material-symbols-outlined';
      span.textContent = mapping[btn.dataset.target] || 'circle';
    });
  }

  function prepareSettings() {
    const heading = document.getElementById('settingsTitle');
    if (heading) heading.textContent = 'Ajustes';
    const form = document.getElementById('settingsForm');
    if (!form || document.getElementById('setSalary')) return;
    const rennerLabel = document.getElementById('setRenner')?.closest('label');
    const salary = document.createElement('label');
    salary.innerHTML = 'Entrada do salário <input id="setSalary" type="number" step="0.01" />';
    form.insertBefore(salary, rennerLabel || form.querySelector('button'));
    form.addEventListener('submit', () => {
      state.base.nextSalary = Number(document.getElementById('setSalary').value || 0);
      saveState();
      renderRefinement();
    });
  }

  function prepareSpendingPage() {
    const page = document.querySelector('[data-page="spending"]');
    if (!page || page.dataset.v3Ready) return;
    page.dataset.v3Ready = '1';
    const oldOverview = page.querySelector('.overview-grid');
    const oldProjectionPanel = oldOverview?.nextElementSibling;
    if (oldOverview) oldOverview.classList.add('v3-hidden');
    if (oldProjectionPanel?.querySelector('#projectionText')) oldProjectionPanel.classList.add('v3-hidden');
    const summaryPanel = page.querySelector('#categorySummary')?.closest('.panel');
    const filterPanel = document.createElement('section');
    filterPanel.className = 'panel v3-filter-panel';
    filterPanel.innerHTML = `
      <div class="section-title"><div><p class="eyebrow">FILTROS</p><h2>Tipo de gasto</h2></div><button id="v3ResetFilter" class="v3-text-button" type="button">Todos</button></div>
      <div id="v3FilterRow" class="v3-filter-row"></div>`;
    const totalPanel = document.createElement('section');
    totalPanel.className = 'panel v3-spending-total';
    totalPanel.innerHTML = `<span id="v3FilterLabel">Todos os gastos</span><strong id="v3FilterTotal">R$ 0,00</strong><small id="v3FilterCount">0 lançamentos</small>`;
    const listPanel = document.createElement('section');
    listPanel.className = 'panel';
    listPanel.innerHTML = `<div class="section-title"><div><p class="eyebrow">LANÇAMENTOS</p><h2>Gastos filtrados</h2></div></div><div id="v3FilteredSpending" class="history v3-list-space"></div>`;
    page.insertBefore(filterPanel, oldOverview || summaryPanel);
    page.insertBefore(totalPanel, oldOverview || summaryPanel);
    page.insertBefore(listPanel, summaryPanel);
    filterPanel.addEventListener('click', e => {
      const chip = e.target.closest('[data-v3-filter]');
      if (chip) { activeFilter = chip.dataset.v3Filter; renderSpendingV3(); }
      if (e.target.closest('#v3ResetFilter')) { activeFilter = 'Todos'; renderSpendingV3(); }
    });
  }

  function filterVisual(category) {
    if (category === 'Todos') return material('apps');
    if (category === 'iFood') return logo(OFFICIAL_LOGOS.ifood, '');
    if (category === 'Cinema') return logo(OFFICIAL_LOGOS.cinemark, '');
    return material(FILTER_ICONS[category] || 'sell');
  }

  function renderSpendingV3() {
    const row = document.getElementById('v3FilterRow');
    if (!row) return;
    row.innerHTML = FILTERS.map(cat => `<button type="button" class="v3-filter-chip${activeFilter === cat ? ' active' : ''}" data-v3-filter="${cat}">${filterVisual(cat)}<span>${cat}</span></button>`).join('');
    const expenses = monthTx().filter(tx => tx.type === 'expense');
    const filtered = activeFilter === 'Todos' ? expenses : expenses.filter(tx => tx.category === activeFilter);
    document.getElementById('v3FilterLabel').textContent = activeFilter === 'Todos' ? 'Todos os gastos' : activeFilter;
    document.getElementById('v3FilterTotal').textContent = money.format(sum(filtered, tx => tx.amount));
    document.getElementById('v3FilterCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'lançamento' : 'lançamentos'}`;
    document.getElementById('v3FilteredSpending').innerHTML = filtered.length ? [...filtered].reverse().map(tx => {
      const accountLabel = ({cash:'Débito/dinheiro',bb:'Crédito BB',renner:'Crédito Renner'})[tx.account];
      const date = new Date(tx.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      return `<div class="tx"><div><strong>${escapeHtml(tx.description || tx.category)}</strong><div class="meta">${escapeHtml(tx.category)} · ${accountLabel} · ${date}</div></div><div class="amount expense">-${money.format(tx.amount)}</div></div>`;
    }).join('') : '<div class="empty">Nenhum gasto nesse filtro neste mês.</div>';
  }

  function renderChart() {
    const chart = document.getElementById('v3FinanceChart');
    if (!chart) return;
    const projected = projectedAvailableV3();
    const bb = bbProjected();
    const renner = rennerCurrent();
    const values = [Math.max(0,projected),Math.max(0,bb),Math.max(0,renner)];
    const total = sum(values) || 1;
    const p1 = values[0] / total * 100;
    const p2 = p1 + values[1] / total * 100;
    chart.style.background = `conic-gradient(var(--v3-projection) 0 ${p1}%, var(--v3-bb) ${p1}% ${p2}%, var(--v3-renner) ${p2}% 100%)`;
    document.getElementById('v3ChartCenter').textContent = money.format(projected);
    document.getElementById('v3LegendProjection').textContent = money.format(projected);
    document.getElementById('v3LegendBB').textContent = money.format(bb);
    document.getElementById('v3LegendRenner').textContent = money.format(renner);
    document.getElementById('v3ChartCaption').textContent = `Cenário central: SENAI médio ${money.format(avgSenai())} + salário ${money.format(state.base.nextSalary)} − reserva e faturas.`;
    const pill = document.getElementById('statusPill');
    if (pill) {
      pill.className = 'status-pill';
      if (projected >= 1200) pill.textContent = 'Tranquilo';
      else if (projected >= 500) { pill.textContent = 'Atenção'; pill.classList.add('warn'); }
      else { pill.textContent = 'Freia aí'; pill.classList.add('bad'); }
    }
  }

  function decorateBillModal(type) {
    const title = document.getElementById('modalBillTitle');
    const details = document.getElementById('modalBillDetails');
    if (!title || !details) return;
    const brandUrl = type === 'bb' ? OFFICIAL_LOGOS.bb : OFFICIAL_LOGOS.renner;
    const name = type === 'bb' ? 'Banco do Brasil' : 'Renner';
    title.innerHTML = `<span class="v3-modal-title">${logo(brandUrl,name)}<span>${name}</span></span>`;
    details.querySelectorAll('.detail-row').forEach(row => {
      const label = row.querySelector('span')?.textContent || '';
      let mark = material('receipt_long');
      if (label.includes('ChatGPT')) mark = logo(OFFICIAL_LOGOS.openai,'OpenAI');
      else if (label.includes('Netflix')) mark = logo(OFFICIAL_LOGOS.netflix,'Netflix');
      else if (label.includes('Corte')) mark = material('content_cut');
      else if (label.includes('Recarga')) mark = material('phone_android');
      else if (label.includes('Academia')) mark = material('fitness_center');
      else if (label.includes('Fatura-base')) mark = logo(brandUrl,name);
      if (!row.querySelector('.v3-detail-mark')) row.insertAdjacentHTML('afterbegin', `<span class="v3-detail-mark">${mark}</span>`);
    });
  }

  function openProjectionModal() {
    const modal = document.getElementById('billModal');
    document.getElementById('modalBillTitle').textContent = 'Disponível projetado';
    document.getElementById('modalBillValue').textContent = money.format(projectedAvailableV3());
    document.getElementById('modalBillDue').textContent = 'Cenário central usando a média da entrada do SENAI.';
    const rows = [
      [material('account_balance_wallet'),'Saldo atual após gastos',money.format(currentCash())],
      [material('school'),`SENAI médio (${money.format(state.base.senaiMin)} a ${money.format(state.base.senaiMax)})`,`+${money.format(avgSenai())}`],
      [material('payments'),'Entrada do salário',`+${money.format(state.base.nextSalary)}`],
      [material('savings'),'Valor reservado',`-${money.format(state.base.savingsGoal)}`],
      [logo(OFFICIAL_LOGOS.bb,'Banco do Brasil'),'BB projetado',`-${money.format(bbProjected())}`],
      [logo(OFFICIAL_LOGOS.renner,'Renner'),'Renner atual',`-${money.format(rennerCurrent())}`]
    ];
    document.getElementById('modalBillDetails').innerHTML = rows.map(([mark,label,value]) => `<div class="detail-row"><span class="v3-detail-mark">${mark}</span><span>${label}</span><strong>${value}</strong></div>`).join('');
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function renderRefinement() {
    const salary = document.getElementById('setSalary');
    if (salary && document.activeElement !== salary) salary.value = state.base.nextSalary ?? 0;
    renderChart();
    renderSpendingV3();
  }

  injectResources();
  prepareHomeChart();
  prepareBillLogos();
  prepareQuickButtons();
  prepareNavIcons();
  prepareSettings();
  prepareSpendingPage();

  const originalOpenBillModal = openBillModal;
  openBillModal = function(type) { originalOpenBillModal(type); decorateBillModal(type); };
  const originalRender = render;
  render = function() { originalRender(); renderRefinement(); };

  renderRefinement();
})();
