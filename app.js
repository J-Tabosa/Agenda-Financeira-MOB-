const STORAGE_KEY = 'agenda-financeira-v1';
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const defaults = {
  version: 1,
  base: {
    cash: 400,
    savingsGoal: 1000,
    senaiMin: 1600,
    senaiMax: 1800,
    bbCurrent: 389,
    rennerCurrent: 343,
    nextSalary: 3600
  },
  plannedBB: [
    { name: 'ChatGPT Plus', value: 100, date: '17/09' },
    { name: 'Corte de cabelo', value: 40, date: '08/09' },
    { name: 'Recarga', value: 25, date: '16/09' },
    { name: 'Academia', value: 130, date: 'setembro' },
    { name: 'Netflix', value: 60, date: '09/09' }
  ],
  transactions: []
};

let state = loadState();
let deferredPrompt = null;

function cloneDefaults() { return JSON.parse(JSON.stringify(defaults)); }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return cloneDefaults();
    return { ...cloneDefaults(), ...saved, base: { ...defaults.base, ...(saved.base || {}) } };
  } catch { return cloneDefaults(); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function el(id) { return document.getElementById(id); }
function sum(arr, getter = x => x) { return arr.reduce((a, x) => a + Number(getter(x) || 0), 0); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }

function monthTx() {
  const now = new Date();
  return state.transactions.filter(tx => {
    const d = new Date(tx.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
}
function txImpact(account, type) {
  return state.transactions
    .filter(tx => tx.account === account && tx.type === type)
    .reduce((a, tx) => a + tx.amount, 0);
}
function grossCash() { return state.base.cash + txImpact('cash', 'income'); }
function currentCash() { return grossCash() - txImpact('cash', 'expense'); }
function bbCurrent() { return state.base.bbCurrent + txImpact('bb', 'expense') - txImpact('bb', 'income'); }
function rennerCurrent() { return state.base.rennerCurrent + txImpact('renner', 'expense') - txImpact('renner', 'income'); }
function bbPlanned() { return sum(state.plannedBB, x => x.value); }
function bbProjected() { return bbCurrent() + bbPlanned(); }

function render() {
  const gross = grossCash();
  const net = currentCash();
  const low = net + state.base.senaiMin - state.base.savingsGoal - rennerCurrent();
  const high = net + state.base.senaiMax - state.base.savingsGoal - rennerCurrent();

  el('grossBalance').textContent = money.format(gross);
  el('netBalance').textContent = money.format(net);
  el('reservedTotal').textContent = money.format(state.base.savingsGoal);
  el('bbHome').textContent = money.format(bbCurrent());
  el('rennerHome').textContent = money.format(rennerCurrent());
  el('freeAfterSenai').textContent = money.format(low);
  el('freeRange').textContent = `${money.format(low)} a ${money.format(high)} considerando a faixa prevista do SENAI.`;

  const pill = el('statusPill');
  pill.className = 'status-pill';
  if (low >= 600) pill.textContent = 'Tranquilo';
  else if (low >= 250) { pill.textContent = 'Atenção'; pill.classList.add('warn'); }
  else { pill.textContent = 'Freia aí'; pill.classList.add('bad'); }

  renderSpending();
  renderHistory();
  fillSettings();
}

function renderSpending() {
  const month = monthTx().filter(tx => tx.type === 'expense');
  const ifood = month.filter(tx => tx.category === 'iFood');
  const leisure = month.filter(tx => ['Cinema', 'Comida fora'].includes(tx.category));
  const ifoodSum = sum(ifood, x => x.amount);
  const leisureSum = sum(leisure, x => x.amount);

  el('ifoodMonth').textContent = money.format(ifoodSum);
  el('ifoodCount').textContent = `${ifood.length} ${ifood.length === 1 ? 'pedido' : 'pedidos'}`;
  el('leisureMonth').textContent = money.format(leisureSum);
  el('leisureCount').textContent = `${leisure.length} ${leisure.length === 1 ? 'registro' : 'registros'}`;

  const now = new Date();
  const day = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedIfood = ifoodSum > 0 ? (ifoodSum / day) * daysInMonth : 0;
  el('projectionText').textContent = ifoodSum > 0
    ? `No ritmo atual, o iFood pode chegar a cerca de ${money.format(projectedIfood)} neste mês. É um alerta de ritmo, não uma previsão exata.`
    : 'Quando você registrar pedidos do iFood, a projeção mensal aparecerá aqui.';

  const groups = new Map();
  month.forEach(tx => {
    const item = groups.get(tx.category) || { total: 0, count: 0 };
    item.total += tx.amount;
    item.count += 1;
    groups.set(tx.category, item);
  });
  const rows = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  el('categorySummary').innerHTML = rows.length
    ? rows.map(([name, data]) => `<div class="category-row"><span>${escapeHtml(name)}</span><small>${data.count} ${data.count === 1 ? 'lançamento' : 'lançamentos'}</small><strong>${money.format(data.total)}</strong></div>`).join('')
    : '<div class="empty">Nenhum gasto registrado neste mês.</div>';
}

function renderHistory() {
  const box = el('history');
  if (!state.transactions.length) {
    box.innerHTML = '<div class="empty">Nenhum movimento registrado ainda.</div>';
    return;
  }
  box.innerHTML = [...state.transactions].reverse().slice(0, 60).map(tx => {
    const sign = tx.type === 'income' ? '+' : '-';
    const accountLabel = ({ cash:'Débito/dinheiro', bb:'Crédito BB', renner:'Crédito Renner' })[tx.account];
    const date = new Date(tx.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `<div class="tx"><div><strong>${escapeHtml(tx.description || tx.category)}</strong><div class="meta">${escapeHtml(tx.category)} · ${accountLabel} · ${date}</div></div><div class="amount ${tx.type}">${sign}${money.format(tx.amount)}</div></div>`;
  }).join('');
}

function switchPage(target) {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.dataset.page === target));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.target === target));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (target === 'add') setTimeout(() => el('amount').focus(), 220);
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.target)));

document.querySelectorAll('.bill-bubble').forEach(btn => btn.addEventListener('click', () => openBillModal(btn.dataset.bill)));
function openBillModal(type) {
  const modal = el('billModal');
  const title = el('modalBillTitle');
  const value = el('modalBillValue');
  const due = el('modalBillDue');
  const details = el('modalBillDetails');

  if (type === 'bb') {
    const cardExpenses = state.transactions.filter(tx => tx.account === 'bb' && tx.type === 'expense');
    const added = sum(cardExpenses, x => x.amount);
    title.textContent = 'Banco do Brasil';
    value.textContent = money.format(bbCurrent());
    due.textContent = 'Vencimento: 05/10/2026';
    details.innerHTML = `
      <div class="detail-row"><span>Fatura-base informada</span><strong>${money.format(state.base.bbCurrent)}</strong></div>
      <div class="detail-row"><span>Novos gastos registrados</span><strong>${money.format(added)}</strong></div>
      <div class="detail-heading">PRÓXIMOS LANÇAMENTOS PREVISTOS</div>
      ${state.plannedBB.map(item => `<div class="detail-row"><span>${escapeHtml(item.name)} · ${escapeHtml(item.date)}</span><strong>${money.format(item.value)}</strong></div>`).join('')}
      <div class="detail-row"><span>Projeção com previstos</span><strong>${money.format(bbProjected())}</strong></div>`;
  } else {
    const cardExpenses = state.transactions.filter(tx => tx.account === 'renner' && tx.type === 'expense');
    const added = sum(cardExpenses, x => x.amount);
    title.textContent = 'Renner';
    value.textContent = money.format(rennerCurrent());
    due.textContent = 'Vencimento: 30/09/2026';
    details.innerHTML = `
      <div class="detail-row"><span>Fatura-base informada</span><strong>${money.format(state.base.rennerCurrent)}</strong></div>
      <div class="detail-row"><span>Novos gastos registrados</span><strong>${money.format(added)}</strong></div>
      <div class="detail-row"><span>Total atual</span><strong>${money.format(rennerCurrent())}</strong></div>`;
  }

  modal.hidden = false;
  document.body.classList.add('modal-open');
}
function closeBillModal() {
  el('billModal').hidden = true;
  document.body.classList.remove('modal-open');
}
document.querySelectorAll('[data-close-modal]').forEach(node => node.addEventListener('click', closeBillModal));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el('billModal').hidden) closeBillModal(); });

el('transactionForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = Number(el('amount').value);
  if (!amount || amount <= 0) return;
  state.transactions.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: el('type').value,
    amount,
    category: el('category').value,
    account: el('account').value,
    description: el('description').value.trim(),
    createdAt: new Date().toISOString()
  });
  saveState();
  e.target.reset();
  el('type').value = 'expense';
  render();
  switchPage('home');
});

document.querySelectorAll('.quick').forEach(btn => btn.addEventListener('click', () => {
  el('type').value = 'expense';
  el('amount').value = btn.dataset.quick;
  el('category').value = btn.dataset.category;
  el('account').value = 'bb';
  el('description').value = btn.dataset.category;
  el('amount').focus();
}));

function fillSettings() {
  el('setCash').value = state.base.cash;
  el('setGoal').value = state.base.savingsGoal;
  el('setSenaiMin').value = state.base.senaiMin;
  el('setSenaiMax').value = state.base.senaiMax;
  el('setRenner').value = state.base.rennerCurrent;
  el('setBb').value = state.base.bbCurrent;
}
el('settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  state.base.cash = Number(el('setCash').value || 0);
  state.base.savingsGoal = Number(el('setGoal').value || 0);
  state.base.senaiMin = Number(el('setSenaiMin').value || 0);
  state.base.senaiMax = Number(el('setSenaiMax').value || 0);
  state.base.rennerCurrent = Number(el('setRenner').value || 0);
  state.base.bbCurrent = Number(el('setBb').value || 0);
  saveState();
  render();
  switchPage('home');
});

el('clearBtn').addEventListener('click', () => {
  if (!confirm('Apagar todos os dados locais e voltar aos valores iniciais?')) return;
  state = cloneDefaults();
  saveState();
  render();
  switchPage('home');
});

el('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agenda-financeira-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el('importInput').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    state = { ...cloneDefaults(), ...data, base: { ...defaults.base, ...(data.base || {}) } };
    saveState();
    render();
    switchPage('home');
  } catch { alert('Backup inválido.'); }
  e.target.value = '';
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  el('installBtn').hidden = false;
});
el('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  el('installBtn').hidden = true;
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
render();
