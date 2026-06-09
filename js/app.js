/* ===================================================
   app.js — Application principale, routeur, initialisation
   =================================================== */

let currentPage = 'dashboard';
let pageHistory = [];

/* ===================== INITIALISATION ===================== */

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    await checkAndSeedDefaults();
    hideSplash();
    initGreeting();
    await loadDashboard();
    showPage('dashboard');
    registerServiceWorker();
  } catch (err) {
    console.error('Erreur init:', err);
    hideSplash();
    showToast('Erreur de démarrage', 'error');
  }
});

async function checkAndSeedDefaults() {
  const tarifs = await getAllTarifs();
  if (tarifs.length === 0) {
    await clearAndSaveTarifs(DEFAULT_TARIFS.map(t => ({ ...t })));
  }

  const bName = await getSetting('businessName');
  if (!bName) {
    await setSetting('businessName', 'ST-PRO Jardin & Pots');
    await setSetting('businessAddress', 'Niamey, Niger');
    await setSetting('businessPhone', '+227 76 75 74 68 / 91 99 04 66');
    await setSetting('businessEmail', 'stpro8481@gmail.com');
    await setSetting('businessNIF', '141576 /P');
    await setSetting('businessRCCM', 'NE/NIM/01/2025/A10/02064');
    await setSetting('footerMessage', 'ST-PRO — Un cadre vert, propre et harmonieux valorise votre maison.');
    await setSetting('currency', 'FCFA');
  }

  // Charger la devise globale
  window._currency = (await getSetting('currency')) || 'FCFA';
}

function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.style.opacity = '0';
      splash.style.transform = 'scale(0.95)';
      setTimeout(() => {
        splash.style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
      }, 500);
    }, 1800);
  }
}

function initGreeting() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Bonne nuit';
  if (hour >= 5 && hour < 12) greeting = 'Bonjour';
  else if (hour >= 12 && hour < 18) greeting = 'Bon après-midi';
  else if (hour >= 18 && hour < 22) greeting = 'Bonsoir';

  const titleEl = document.getElementById('greeting-title');
  if (titleEl) titleEl.textContent = greeting + ' 👋';

  const dateEl = document.getElementById('greeting-date');
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}

/* ===================== NAVIGATION / ROUTEUR ===================== */

async function showPage(pageName, navBtn) {
  if (currentPage === pageName && pageName !== 'dashboard') return;

  // Fermer les modals ouverts
  closeAllModals();

  // Gérer l'historique
  if (currentPage !== pageName) {
    pageHistory.push(currentPage);
    if (pageHistory.length > 10) pageHistory.shift();
  }

  // Désactiver l'ancienne page
  const oldPage = document.getElementById(`page-${currentPage}`);
  if (oldPage) {
    oldPage.classList.remove('active');
  }

  currentPage = pageName;

  // Activer la nouvelle page
  const newPage = document.getElementById(`page-${pageName}`);
  if (newPage) {
    newPage.classList.add('active');
  }

  // Mettre à jour la nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });

  // Bouton back : montrer sur pages secondaires
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.style.display = ['settings', 'map'].includes(pageName) ? 'flex' : 'none';
  }

  // Charger les données de la page
  switch (pageName) {
    case 'dashboard':
      await loadDashboard();
      break;
    case 'orders':
      currentOrderFilter = 'all';
      currentOrderSearch = '';
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      const allTab = document.querySelector('.filter-tab[data-status="all"]');
      if (allTab) allTab.classList.add('active');
      await loadOrdersWithClientNames();
      break;
    case 'contracts':
      await loadContractsList();
      break;
    case 'clients':
      await loadClients();
      break;
    case 'history':
      initHistoryDates();
      await loadHistory();
      break;
    case 'settings':
      await loadSettings();
      break;
    case 'map':
      await initMapPage();
      break;
  }
}

function goBack() {
  if (pageHistory.length > 0) {
    const prev = pageHistory.pop();
    showPage(prev);
  } else {
    showPage('dashboard');
  }
}

/* ===================== MODALS ===================== */

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  const overlay = document.getElementById('modal-overlay');
  if (!modal) return;

  overlay.classList.add('active');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('active');

  // Vérifier s'il reste des modals ouverts
  const anyOpen = document.querySelector('.modal.active');
  if (!anyOpen) {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

/* ===================== TOAST ===================== */

let toastTimeout = null;

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toast-message');
  const icon = toast.querySelector('.toast-icon');

  msg.textContent = message;
  toast.classList.remove('hidden', 'error');
  if (type === 'error') {
    toast.classList.add('error');
    icon.className = 'fas fa-exclamation-circle toast-icon';
  } else {
    icon.className = 'fas fa-check-circle toast-icon';
  }

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

/* ===================== CONFIRMATION ===================== */

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;

  const btn = document.getElementById('confirm-action-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    closeModal('modal-confirm');
    onConfirm();
  });

  openModal('modal-confirm');
}

/* ===================== HISTORIQUE ===================== */

function initHistoryDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

  const fromEl = document.getElementById('hist-from');
  const toEl = document.getElementById('hist-to');

  if (fromEl && !fromEl.value) {
    fromEl.value = firstDay.toISOString().split('T')[0];
  }
  if (toEl && !toEl.value) {
    toEl.value = now.toISOString().split('T')[0];
  }
}

async function loadHistory() {
  const fromEl = document.getElementById('hist-from');
  const toEl = document.getElementById('hist-to');
  const listEl = document.getElementById('history-list');

  if (!fromEl || !toEl || !listEl) return;

  const fromDate = fromEl.value;
  const toDate = toEl.value;

  let orders = await getAllOrders();
  const settings = await getAllSettings();
  const currency = settings.currency || 'FCFA';

  // Filtrer par période
  if (fromDate) {
    orders = orders.filter(o => o.createdAt && o.createdAt.split('T')[0] >= fromDate);
  }
  if (toDate) {
    orders = orders.filter(o => o.createdAt && o.createdAt.split('T')[0] <= toDate);
  }

  // Stats période
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  document.getElementById('hist-revenue').textContent = formatMoney(totalRevenue, currency);
  document.getElementById('hist-count').textContent = orders.length;

  if (orders.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-chart-bar"></i>
        <p>Aucune commande sur cette période</p>
      </div>`;
    return;
  }

  // Attacher les noms clients
  const clients = await getAllClients();
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c);
  orders.forEach(o => {
    const client = clientMap[o.clientId] || o.clientSnapshot || {};
    o._clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
  });

  listEl.innerHTML = orders.map(o => renderOrderCard(o)).join('');
}

/* ===================== PARAMÈTRES ===================== */

async function loadSettings() {
  const settings = await getAllSettings();

  document.getElementById('set-name').value = settings.businessName || '';
  document.getElementById('set-address').value = settings.businessAddress || '';
  document.getElementById('set-phone').value = settings.businessPhone || '';
  document.getElementById('set-email').value = settings.businessEmail || '';
  document.getElementById('set-nif').value = settings.businessNIF || '';
  document.getElementById('set-rccm').value = settings.businessRCCM || '';
  document.getElementById('set-footer').value = settings.footerMessage || 'Merci de votre confiance !';
  document.getElementById('set-currency').value = settings.currency || 'FCFA';

  // Tarifs
  await loadTarifsSettings();
}

async function saveSettings() {
  await setSetting('businessName', document.getElementById('set-name').value.trim());
  await setSetting('businessAddress', document.getElementById('set-address').value.trim());
  await setSetting('businessPhone', document.getElementById('set-phone').value.trim());
  await setSetting('businessEmail', document.getElementById('set-email').value.trim());
  await setSetting('businessNIF', document.getElementById('set-nif').value.trim());
  await setSetting('businessRCCM', document.getElementById('set-rccm').value.trim());
  await setSetting('footerMessage', document.getElementById('set-footer').value.trim());
  await setSetting('currency', document.getElementById('set-currency').value);

  window._currency = document.getElementById('set-currency').value;

  showToast('Paramètres sauvegardés !');
}

async function loadTarifsSettings() {
  let tarifs = await getAllTarifs();
  if (tarifs.length === 0) tarifs = DEFAULT_TARIFS.map(t => ({ ...t }));

  const container = document.getElementById('tarifs-list');
  container.innerHTML = tarifs.map((t, i) => `
    <div class="tarif-row" data-index="${i}">
      <input type="text" value="${escapeHtml(t.name)}" placeholder="Nom article" class="tarif-name" />
      <input type="number" value="${t.price}" placeholder="Prix" class="tarif-price" min="0" />
      <button class="btn-icon" onclick="removeTarifRow(this)" style="color:#ef4444;width:32px;height:32px">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function addTarifRow() {
  const container = document.getElementById('tarifs-list');
  const div = document.createElement('div');
  div.className = 'tarif-row';
  div.innerHTML = `
    <input type="text" placeholder="Nom article" class="tarif-name" />
    <input type="number" placeholder="Prix" class="tarif-price" min="0" />
    <button class="btn-icon" onclick="removeTarifRow(this)" style="color:#ef4444;width:32px;height:32px">
      <i class="fas fa-times"></i>
    </button>`;
  container.appendChild(div);
}

function removeTarifRow(btn) {
  btn.closest('.tarif-row').remove();
}

async function saveTarifs() {
  const rows = document.querySelectorAll('.tarif-row');
  const tarifs = [];
  rows.forEach(row => {
    const name = row.querySelector('.tarif-name').value.trim();
    const price = parseFloat(row.querySelector('.tarif-price').value) || 0;
    if (name) tarifs.push({ name, price });
  });

  await clearAndSaveTarifs(tarifs);
  showToast('Tarifs sauvegardés !');
}

function confirmClearData() {
  showConfirm(
    '⚠️ Effacer toutes les données ?',
    'ATTENTION : Cela supprimera définitivement tous les clients, commandes, contrats et paramètres. Cette action est irréversible !',
    async () => {
      await clearAllData();
      await checkAndSeedDefaults();
      await loadDashboard();
      showToast('Données effacées');
    }
  );
}

/* ===================== SERVICE WORKER ===================== */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      // Optionnel, ne pas bloquer si sw.js non disponible
    });
  }
}

/* ===================== GESTES SWIPE (mobile) ===================== */

let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);

  // Swipe horizontal significatif
  if (Math.abs(dx) > 60 && dy < 50) {
    const pages = ['dashboard', 'orders', 'contracts', 'clients', 'history'];
    const idx = pages.indexOf(currentPage);

    if (dx < 0 && idx < pages.length - 1) {
      const navBtn = document.querySelector(`.nav-item[data-page="${pages[idx + 1]}"]`);
      showPage(pages[idx + 1], navBtn);
    } else if (dx > 0 && idx > 0) {
      const navBtn = document.querySelector(`.nav-item[data-page="${pages[idx - 1]}"]`);
      showPage(pages[idx - 1], navBtn);
    }
  }
}, { passive: true });

/* ===================== FERMER SUGGESTIONS ===================== */

document.addEventListener('click', (e) => {
  const suggestions = document.getElementById('client-suggestions');
  if (suggestions && !e.target.closest('.client-search-wrap')) {
    suggestions.classList.add('hidden');
  }
});

/* ===================== RACCOURCIS CLAVIER ===================== */

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllModals();
});

/* ===================== FORMATDATE SHORT (utilisé dans orders) ===================== */
function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}
