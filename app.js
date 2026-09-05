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
function currentCash() {
  return state.base.cash + txImpact('cash', 'income') - txImpact('cash', 'expense');
}
function bbCurrent() { return state.base.bbCurrent + txImpact('bb', 'expense') - txImpact('bb', 'income'); }
function rennerCurrent() { return state.base.rennerCurrent + txImpact('renner', 'expense') - txImpact('renner', 'income'); }
function bbPlanned() { return sum(state.plannedBB, x => x.value); }
function bbProjected() { return bbCurrent() + bbPlanned(); }

function render() {
  const cash = currentCash();
  const low = cash + state.base.senaiMin - state.base.savingsGoal - rennerCurrent();
  const high = cash + state.base.senaiMax - state.base.savingsGoal - rennerCurrent();

  el('cashBalance').textContent = money.format(cash);
  el('savingsGoal').textContent = money.format(state.base.savingsGoal);
  el('rennerBalance').textContent = money.format(rennerCurrent());
  el('bbProjected').textContent = money.format(bbProjected());
  el('freeAfterSenai').textContent = money.format(low);
  el('freeRange').textContent = `${money.format(low)} a ${money.format(high)} considerando SENAI de ${money.format(state.base.senaiMin)}–${money.format(state.base.senaiMax)}`;

  const pill = el('statusPill');
  pill.className = 'status-pill';
  if (low >= 600) pill.textContent = '🟢 Tranquilo';
  else if (low >= 250) { pill.textContent = '🟡 Atenção'; pill.classList.add('warn'); }
  else { pill.textContent = '🔴 Freia aí'; pill.classList.add('bad'); }

  el('bbCurrent').textContent = `${money.format(bbCurrent())} atual · ${money.format(bbProjected())} projetado`;
  el('rennerCurrent').textContent = money.format(rennerCurrent());
  el('bbPlannedList').innerHTML = state.plannedBB.map(item => `• ${item.name} — ${money.format(item.value)} (${item.date})`).join('<br>');

  const month = monthTx().filter(tx => tx.type === 'expense');
  const ifood = month.filter(tx => tx.category === 'iFood');
  const leisure = month.filter(tx => ['Cinema','Comida fora'].includes(tx.category));
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
    ? `No ritmo atual, o iFood pode chegar a cerca de ${money.format(projectedIfood)} neste mês. Use isso como alerta de ritmo, não como previsão exata.`
    : 'Quando você registrar pedidos do iFood, eu projeto automaticamente quanto esse ritmo pode custar até o fim do mês.';

  renderHistory();
  fillSettings();
}

function renderHistory() {
  const box = el('history');
  if (!state.transactions.length) {
    box.innerHTML = '<div class="empty">Nenhum movimento registrado ainda.</div>';
    return;
  }
  box.innerHTML = [...state.transactions].reverse().slice(0, 40).map(tx => {
    const sign = tx.type === 'income' ? '+' : '-';
    const accountLabel = ({ cash:'Débito/dinheiro', bb:'Crédito BB', renner:'Crédito Renner' })[tx.account];
    const date = new Date(tx.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `<div class="tx">
      <div><strong>${escapeHtml(tx.description || tx.category)}</strong><div class="meta">${tx.category} · ${accountLabel} · ${date}</div></div>
      <div class="amount ${tx.type}">${sign}${money.format(tx.amount)}</div>
    </div>`;
  }).join('');
}
function escapeHtml(value='') { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

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
});

document.querySelectorAll('.quick').forEach(btn => btn.addEventListener('click', () => {
  el('type').value = 'expense';
  el('amount').value = btn.dataset.quick;
  el('category').value = btn.dataset.category;
  el('account').value = 'bb';
  el('description').value = btn.dataset.category;
  el('amount').focus();
}));

el('focusAdd').addEventListener('click', () => { el('amount').scrollIntoView({ behavior:'smooth', block:'center' }); setTimeout(() => el('amount').focus(), 350); });

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
  saveState(); render();
});

el('clearBtn').addEventListener('click', () => {
  if (!confirm('Apagar todos os dados locais e voltar aos valores iniciais?')) return;
  state = cloneDefaults(); saveState(); render();
});

el('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `agenda-financeira-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el('importInput').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    state = { ...cloneDefaults(), ...data, base: { ...defaults.base, ...(data.base || {}) } };
    saveState(); render();
  } catch { alert('Backup inválido.'); }
  e.target.value = '';
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e; el('installBtn').hidden = false;
});
el('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el('installBtn').hidden = true;
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
render();
