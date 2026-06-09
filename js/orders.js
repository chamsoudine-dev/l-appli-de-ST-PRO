/* ===================================================
   orders.js — Gestion des Interventions pour ST-PRO
   =================================================== */

let currentOrderFilter = 'all';
let currentOrderSearch = '';
let editingOrderId = null;
let selectedClientForOrder = null;
let currentTarifs = [];

/* ===================== AFFICHAGE LISTE ===================== */

async function loadOrders(filter = currentOrderFilter, search = currentOrderSearch) {
  currentOrderFilter = filter;
  currentOrderSearch = search;

  const listEl = document.getElementById('orders-list');
  if (!listEl) return;

  let orders = await getAllOrders();

  // Filtre statut
  if (filter !== 'all') {
    orders = orders.filter(o => o.status === filter);
  }

  // Filtre recherche
  if (search.trim()) {
    const q = search.toLowerCase();
    orders = await filterOrdersBySearch(orders, q);
  }

  if (orders.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <p>${search ? 'Aucune intervention trouvée' : 'Aucune intervention planifiée'}</p>
        ${!search ? '<button class="btn-primary" onclick="showNewOrder()"><i class="fas fa-plus"></i> Planifier un passage</button>' : ''}
      </div>`;
    return;
  }

  listEl.innerHTML = orders.map(order => renderOrderCard(order)).join('');
}

async function filterOrdersBySearch(orders, query) {
  const clients = await getAllClients();
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c);

  return orders.filter(o => {
    const client = clientMap[o.clientId] || o.clientSnapshot || {};
    const clientName = `${client.firstname || ''} ${client.lastname || ''}`.toLowerCase();
    const phone = (client.phone || '').toLowerCase();
    const ref = (o.ref || '').toLowerCase();
    const address = (client.address || '').toLowerCase();
    return clientName.includes(query) || phone.includes(query) || ref.includes(query) || address.includes(query);
  });
}

function renderOrderCard(order) {
  const statusClass = `status-${order.status || 'processing'}`;
  const badgeClass = `badge-${order.status || 'processing'}`;
  const statusLabel = getStatusLabel(order.status);
  const total = formatMoney(order.total || 0, window._currency || 'FCFA');

  const arrivalDate = order.arrivalDate ? formatDateShort(order.arrivalDate) : '—';
  const pickupDate = order.pickupDate ? formatDateShort(order.pickupDate) : '—';

  const clientName = order._clientName || '...';
  const clientRisk = order._clientRisk || 'low';
  
  // Badge de risque
  let riskBadge = '';
  let borderClass = 'risk-low';
  if (clientRisk === 'high') {
    riskBadge = '<span class="badge-risk badge-risk-high danger-badge-blink">⚠️ Foyer Dangereux</span>';
    borderClass = 'risk-high';
  } else if (clientRisk === 'medium') {
    riskBadge = '<span class="badge-risk badge-risk-medium warning-badge-blink">⚠️ Zone Sensible</span>';
    borderClass = 'risk-medium';
  }

  const articlesCount = (order.articles || []).reduce((sum, a) => sum + (a.qty || 1), 0);
  const isUrgent = order.pickupDate && isToday(order.pickupDate) && order.status !== 'delivered';

  return `
    <div class="order-card ${statusClass} ${borderClass}${isUrgent ? ' urgent' : ''}" onclick="showOrderDetail(${order.id})">
      <div class="order-card-header">
        <span class="order-ref">${order.ref || '—'}</span>
        <span class="order-status-badge ${badgeClass}">${statusLabel}</span>
      </div>
      <div class="order-client">${escapeHtml(clientName)} ${riskBadge}</div>
      <div class="order-meta">
        <span class="order-meta-item"><i class="fas fa-calendar-alt"></i> Planifié : ${arrivalDate}</span>
        <span class="order-meta-item"><i class="fas fa-leaf"></i> Passage : ${pickupDate}</span>
        <span class="order-meta-item"><i class="fas fa-seedling"></i> ${articlesCount} prestation(s)</span>
        ${isUrgent ? '<span class="order-meta-item" style="color:#ff9800"><i class="fas fa-exclamation-circle"></i> Aujourd\'hui !</span>' : ''}
      </div>
      <div class="order-amount">${total}</div>
    </div>`;
}

async function loadOrdersWithClients(filter = currentOrderFilter, search = '') {
  let orders = await getAllOrders();
  const clients = await getAllClients();
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c);

  // Attacher les noms, risques et adresses
  orders.forEach(o => {
    const client = clientMap[o.clientId] || o.clientSnapshot || {};
    o._clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
    o._clientRisk = client.riskLevel || 'low';
    o._clientAddress = client.address || '';
  });

  if (filter !== 'all') {
    orders = orders.filter(o => o.status === filter);
  }

  if (search.trim()) {
    const q = search.toLowerCase();
    orders = orders.filter(o =>
      o._clientName.toLowerCase().includes(q) ||
      (o.ref || '').toLowerCase().includes(q) ||
      ((clientMap[o.clientId] || {}).phone || '').includes(q)
    );
  }

  return orders;
}

/* ===================== AFFICHAGE DASHBOARD ===================== */

async function loadDashboard() {
  const orders = await getAllOrders();
  const clients = await getAllClients();
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c);
  
  const settings = await getAllSettings();
  window._currency = settings.currency || 'FCFA';

  // Stats
  document.getElementById('stat-total').textContent = orders.length;
  document.getElementById('stat-processing').textContent = orders.filter(o => o.status === 'processing').length;
  document.getElementById('stat-ready').textContent = orders.filter(o => o.status === 'ready').length;
  document.getElementById('stat-delivered').textContent = orders.filter(o => o.status === 'delivered').length;

  // Revenus
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStr = now.toISOString().split('T')[0];

  let monthRevenue = 0;
  let todayRevenue = 0;

  orders.forEach(o => {
    const created = new Date(o.createdAt);
    if (created >= monthStart) monthRevenue += o.total || 0;
    if (o.createdAt && o.createdAt.startsWith(todayStr)) todayRevenue += o.total || 0;
  });

  document.getElementById('revenue-month').textContent = formatMoney(monthRevenue, window._currency);
  document.getElementById('revenue-today').textContent = formatMoney(todayRevenue, window._currency);

  // Alertes aujourd'hui (arrosages planifiés non terminés)
  const urgentOrders = orders.filter(o =>
    o.pickupDate === todayStr && o.status === 'processing'
  );

  const alertEl = document.getElementById('alert-today');
  if (urgentOrders.length > 0) {
    alertEl.classList.remove('hidden');
    document.getElementById('alert-count').textContent = urgentOrders.length;

    // Badge notification
    const badge = document.getElementById('notif-badge');
    badge.textContent = urgentOrders.length;
    badge.style.display = 'flex';
  } else {
    alertEl.classList.add('hidden');
    document.getElementById('notif-badge').style.display = 'none';
  }

  // ==================== PLANNING HEBDOMADAIRE (7 PROCHAINS JOURS) ====================
  const planningListEl = document.getElementById('weekly-planning-list');
  if (planningListEl) {
    const endOfWeek = new Date();
    endOfWeek.setDate(now.getDate() + 7);
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    // Filtrer les interventions d'arrosage planifiées pour la semaine
    let weeklyOrders = orders.filter(o => 
      o.status === 'processing' && 
      o.pickupDate && 
      o.pickupDate >= todayStr && 
      o.pickupDate <= endOfWeekStr
    );

    // Trier par date
    weeklyOrders.sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));

    if (weeklyOrders.length === 0) {
      planningListEl.innerHTML = `
        <div class="empty-state" style="padding:16px">
          <i class="fas fa-calendar-check" style="font-size:24px;color:var(--gold-light)"></i>
          <p style="font-size:12px">Aucune récupération planifiée cette semaine</p>
        </div>`;
    } else {
      // Regrouper par date
      const groups = {};
      weeklyOrders.forEach(o => {
        const client = clientMap[o.clientId] || o.clientSnapshot || {};
        o._clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
        o._clientRisk = client.riskLevel || 'low';
        o._clientAddress = client.address || '';
        
        if (!groups[o.pickupDate]) groups[o.pickupDate] = [];
        groups[o.pickupDate].push(o);
      });

      let html = '';
      for (const dateStr in groups) {
        const dateObj = new Date(dateStr + 'T00:00:00');
        const formattedDay = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
        
        html += `
          <div class="planning-day-card">
            <div class="planning-day-header">${formattedDay}</div>
            <div style="display:flex;flex-direction:column;gap:8px">
        `;
        
        groups[dateStr].forEach(o => {
          let riskTag = '';
          let borderClass = 'risk-low';
          if (o._clientRisk === 'high') {
            riskTag = '<span class="badge-risk badge-risk-high danger-badge-blink">⚠️ Foyer Dangereux</span>';
            borderClass = 'risk-high';
          } else if (o._clientRisk === 'medium') {
            riskTag = '<span class="badge-risk badge-risk-medium warning-badge-blink">⚠️ Zone Sensible</span>';
            borderClass = 'risk-medium';
          }

          html += `
            <div class="order-card ${borderClass}" style="padding:10px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:12px" onclick="showOrderDetail(${o.id})">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${escapeHtml(o._clientName)} ${riskTag}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                  <i class="fas fa-map-marker-alt"></i> ${escapeHtml(o._clientAddress || 'Adresse non spécifiée')}
                </div>
                <div style="font-size:11px;color:var(--text-muted)">
                  <i class="fas fa-seedling"></i> ${(o.articles || []).map(a => a.name).join(', ')}
                </div>
              </div>
              <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
                <button class="btn-icon" style="width:32px;height:32px;background:rgba(37,211,102,0.15)" onclick="sendWateringReminderById(${o.clientId || 0})" title="Relance WhatsApp">
                  <i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i>
                </button>
              </div>
            </div>
          `;
        });
        
        html += `</div></div>`;
      }
      planningListEl.innerHTML = html;
    }
  }

  // Interventions récentes (5 dernières)
  const recentEl = document.getElementById('recent-orders-list');
  const recent = orders.slice(0, 5);

  if (recent.length === 0) {
    recentEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-leaf"></i>
        <p>Aucune intervention récente</p>
        <button class="btn-primary" onclick="showNewOrder()"><i class="fas fa-plus"></i> Planifier un passage</button>
      </div>`;
    return;
  }

  recent.forEach(o => {
    const client = clientMap[o.clientId] || o.clientSnapshot || {};
    o._clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
    o._clientRisk = client.riskLevel || 'low';
    o._clientAddress = client.address || '';
  });

  recentEl.innerHTML = recent.map(o => renderOrderCard(o)).join('');
}

/* ===================== DÉTAIL INTERVENTION ===================== */

async function showOrderDetail(orderId) {
  const order = await getOrder(Number(orderId));
  if (!order) return;

  let client = null;
  if (order.clientId) client = await getClient(order.clientId);
  if (!client) client = order.clientSnapshot || {};

  const settings = await getAllSettings();
  const currency = settings.currency || 'FCFA';

  const clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
  const riskLevel = client.riskLevel || 'low';
  
  // Alerte sécurité
  let safetyAlertHTML = '';
  if (riskLevel === 'high') {
    safetyAlertHTML = `
      <div class="danger-badge-blink" style="padding:10px;border-radius:8px;text-align:center;margin-bottom:12px;font-size:12px;font-weight:700">
        <i class="fas fa-exclamation-triangle"></i> DANGER : FOYER SIGNALÉ DANGEREUX !
      </div>`;
  } else if (riskLevel === 'medium') {
    safetyAlertHTML = `
      <div class="warning-badge-blink" style="padding:8px;border-radius:8px;text-align:center;margin-bottom:12px;font-size:12px">
        <i class="fas fa-exclamation-circle"></i> Zone Sensible - Rester vigilant.
      </div>`;
  }

  const articlesRows = (order.articles || []).map(a => `
    <div class="detail-row">
      <span class="detail-label">${escapeHtml(a.name)} x${a.qty || 1}</span>
      <span class="detail-value">${formatMoney((a.qty || 1) * (a.price || 0), currency)}</span>
    </div>`).join('');

  const content = document.getElementById('order-detail-content');
  content.innerHTML = `
    <!-- Alerte Sécurité -->
    ${safetyAlertHTML}

    <!-- Status -->
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-info-circle"></i> Statut de l'intervention</div>
      <select class="detail-status-select" id="detail-status-select" onchange="updateOrderStatus(${order.id}, this.value)">
        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>🔄 En cours</option>
        <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>✅ Réalisé</option>
        <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>💵 Payé</option>
        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ Annulé</option>
      </select>
    </div>

    <!-- Client -->
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-user"></i> Client</div>
      <div class="detail-row"><span class="detail-label">Nom</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
      <div class="detail-row"><span class="detail-label">Téléphone</span><span class="detail-value">${escapeHtml(client.phone || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Adresse</span><span class="detail-value">${escapeHtml(client.address || '—')}</span></div>
      ${client.latitude && client.longitude ? `
      <div class="detail-row" style="margin-top: 6px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08)">
        <span class="detail-label"><i class="fas fa-map-marker-alt" style="color:var(--success)"></i> GPS Enregistré</span>
        <span class="detail-value" style="display:flex; gap:6px">
          <button class="btn-primary btn-sm" style="padding:4px 8px; font-size:11px" onclick="navigateToClient(${client.latitude}, ${client.longitude})">
            <i class="fas fa-route"></i> Google Maps
          </button>
          <button class="btn-secondary btn-sm" style="padding:4px 8px; font-size:11px" onclick="navigateToClientWaze(${client.latitude}, ${client.longitude})">
            Waze
          </button>
        </span>
      </div>
      ` : `
      <div class="detail-row" style="margin-top: 6px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08)">
        <span class="detail-label" style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> Aucun GPS</span>
        <span class="detail-value">
          <button class="btn-secondary btn-sm" style="padding:4px 8px; font-size:11px" onclick="captureGPSFromOrderDetail(${order.id}, ${order.clientId || 0})">
            <i class="fas fa-crosshairs"></i> Capturer
          </button>
        </span>
      </div>
      `}
    </div>


    <!-- Dates -->
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-calendar-alt"></i> Planification</div>
      <div class="detail-row"><span class="detail-label">Date de planification</span><span class="detail-value">${order.arrivalDate ? formatDate(order.arrivalDate) : '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Date d'intervention</span><span class="detail-value" style="color:var(--accent-light)">${order.pickupDate ? formatDate(order.pickupDate) : '—'}</span></div>
    </div>

    <!-- Prestations -->
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-seedling"></i> Prestations & Tarifs</div>
      ${articlesRows}
      <div class="detail-row" style="margin-top:8px"><span class="detail-label">Sous-total</span><span class="detail-value">${formatMoney(order.subtotal || 0, currency)}</span></div>
      ${order.discount > 0 ? `<div class="detail-row"><span class="detail-label" style="color:#ef4444">Remise (${order.discount}%)</span><span class="detail-value" style="color:#ef4444">- ${formatMoney((order.subtotal || 0) * order.discount / 100, currency)}</span></div>` : ''}
      <div class="detail-row" style="border-top:2px solid var(--border-color);margin-top:8px;padding-top:8px">
        <span style="font-weight:700">TOTAL</span>
        <span style="font-weight:800;font-size:18px;color:var(--accent-light)">${formatMoney(order.total || 0, currency)}</span>
      </div>
    </div>

    ${order.notes ? `
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-sticky-note"></i> Notes de terrain & Consignes</div>
      <p style="font-size:13px;color:var(--text-secondary);font-style:italic">${escapeHtml(order.notes)}</p>
    </div>` : ''}

    <!-- Actions -->
    <div class="detail-actions">
      <button class="btn-whatsapp btn-full" onclick="showReceipt(${order.id});closeModal('modal-order-detail')">
        <i class="fab fa-whatsapp"></i> Voir & Envoyer le Reçu
      </button>
      <button class="btn-primary btn-full" onclick="editOrder(${order.id})">
        <i class="fas fa-edit"></i> Modifier l'intervention
      </button>
      <button class="btn-danger btn-full" onclick="confirmDeleteOrder(${order.id})">
        <i class="fas fa-trash"></i> Supprimer
      </button>
    </div>
  `;

  openModal('modal-order-detail');
}

async function updateOrderStatus(orderId, newStatus) {
  const order = await getOrder(orderId);
  if (!order) return;
  order.status = newStatus;
  await updateOrder(order);

  showToast('Statut mis à jour !');
  await loadDashboard();
  await loadOrdersWithClientNames();
}

async function loadOrdersWithClientNames() {
  const orders = await loadOrdersWithClients(currentOrderFilter, currentOrderSearch);
  const listEl = document.getElementById('orders-list');
  if (!listEl) return;

  if (orders.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>Aucune commande</p></div>`;
    return;
  }

  listEl.innerHTML = orders.map(o => renderOrderCard(o)).join('');
}

/* ===================== FORMULAIRE COMMANDE ===================== */

async function showNewOrder() {
  editingOrderId = null;
  selectedClientForOrder = null;
  currentTarifs = await getAllTarifs();
  if (currentTarifs.length === 0) {
    currentTarifs = DEFAULT_TARIFS.map(t => ({ ...t }));
  }

  document.getElementById('modal-order-title').textContent = 'Enregistrer une Intervention';
  document.getElementById('order-id').value = '';
  document.getElementById('client-search-input').value = '';
  document.getElementById('client-firstname').value = '';
  document.getElementById('client-lastname').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('order-discount').value = '0';
  document.getElementById('order-notes').value = '';


  // Dates par défaut (aujourd'hui pour les deux car l'arrosage se fait le jour même)
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('order-arrival').value = today;
  document.getElementById('order-pickup').value = today;

  // Reset client UI
  document.getElementById('selected-client-info').classList.add('hidden');
  document.getElementById('new-client-fields').style.display = '';

  // Reset GPS
  document.getElementById('order-client-lat').value = '';
  document.getElementById('order-client-lng').value = '';
  updateOrderGPSStatus(null, null);

  // Articles (Prestations) : un par défaut
  const articlesList = document.getElementById('articles-list');
  articlesList.innerHTML = '';
  addArticleRow();

  recalcTotal();
  openModal('modal-order');
}

async function editOrder(orderId) {
  const order = await getOrder(Number(orderId));
  if (!order) return;

  editingOrderId = order.id;
  currentTarifs = await getAllTarifs();
  if (currentTarifs.length === 0) currentTarifs = DEFAULT_TARIFS.map(t => ({ ...t }));

  document.getElementById('modal-order-title').textContent = 'Modifier l\'Intervention';
  document.getElementById('order-id').value = order.id;

  // Client
  if (order.clientId) {
    const client = await getClient(order.clientId);
    if (client) {
      selectClientForOrder(client);
    }
  } else if (order.clientSnapshot) {
    document.getElementById('client-firstname').value = order.clientSnapshot.firstname || '';
    document.getElementById('client-lastname').value = order.clientSnapshot.lastname || '';
    document.getElementById('client-phone').value = order.clientSnapshot.phone || '';
    
    // Charger le GPS du snapshot si présent
    const lat = order.clientSnapshot.latitude || '';
    const lng = order.clientSnapshot.longitude || '';
    document.getElementById('order-client-lat').value = lat;
    document.getElementById('order-client-lng').value = lng;
    updateOrderGPSStatus(lat, lng);
  } else {
    // Reset GPS
    document.getElementById('order-client-lat').value = '';
    document.getElementById('order-client-lng').value = '';
    updateOrderGPSStatus(null, null);
  }

  // Dates
  document.getElementById('order-arrival').value = order.arrivalDate || '';
  document.getElementById('order-pickup').value = order.pickupDate || '';



  // Notes
  document.getElementById('order-notes').value = order.notes || '';

  // Remise
  document.getElementById('order-discount').value = order.discount || 0;

  // Prestations
  const articlesList = document.getElementById('articles-list');
  articlesList.innerHTML = '';
  (order.articles || [{ name: '', qty: 1, price: 0 }]).forEach(art => {
    addArticleRow(art);
  });

  recalcTotal();

  closeModal('modal-order-detail');
  openModal('modal-order');
}

function addArticleRow(article = null, containerId = 'articles-list', onChangeCb = null) {
  const list = document.getElementById(containerId);
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'article-row';

  const tarifs = (containerId === 'contract-articles-list') ? currentContractTarifs : currentTarifs;
  const tarifOptions = tarifs.length > 0
    ? tarifs.map(t => `<option value="${escapeHtml(t.name)}" data-price="${t.price}">${escapeHtml(t.name)} — ${t.price.toLocaleString('fr-FR')} FCFA</option>`).join('')
    : '';

  const cb = onChangeCb ? `${onChangeCb}(this)` : `onArticleNameChange(this,'${containerId}')`;

  div.innerHTML = `
    <div class="article-row-header">
      <div class="article-row-name" id="art-label-${Date.now()}">Nouvelle prestation</div>
      <button class="article-row-del" onclick="removeArticleRow(this)">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="article-row-footer">
      <select class="article-select-styled article-name-select" onchange="onArticleNameChange(this,'${containerId}')">
        <option value="">— Choisir une prestation —</option>
        ${tarifOptions}
        <option value="__custom__">✏️ Autre (saisir manuellement)</option>
      </select>
    </div>
    <div class="article-row-footer" id="custom-name-row-${Date.now()}" style="display:none">
      <input type="text" class="article-input-styled article-name-input" placeholder="Nom de la prestation..." oninput="updateArticleLabel(this)" />
    </div>
    <div class="article-row-footer" style="align-items:center;gap:8px">
      <div class="article-qty-wrap">
        <span class="article-qty-label">Qté</span>
        <input type="number" class="article-qty" min="1" value="${article ? article.qty || 1 : 1}" oninput="onArticleQtyOrPriceChange(this)" style="width:38px" />
      </div>
      <div class="article-price-wrap" style="flex:1">
        <span style="font-size:10px;color:var(--text-muted);white-space:nowrap">Prix FCFA</span>
        <input type="number" class="article-price" min="0" value="${article ? article.price || 0 : 0}" oninput="onArticleQtyOrPriceChange(this)" />
      </div>
    </div>`;

  list.appendChild(div);

  // Pré-remplir si article fourni
  if (article) {
    const select = div.querySelector('.article-name-select');
    const nameInput = div.querySelector('.article-name-input');
    const option = Array.from(select.options).find(o => o.value === article.name);
    const labelEl = div.querySelector('.article-row-name');

    if (option) {
      select.value = article.name;
      if (labelEl) labelEl.textContent = article.name;
    } else {
      select.value = '__custom__';
      nameInput.value = article.name || '';
      const customRow = div.querySelector('[id^="custom-name-row"]');
      if (customRow) customRow.style.display = '';
      if (labelEl) labelEl.textContent = article.name || 'Prestation personnalisée';
    }
    div.querySelector('.article-price').value = article.price || 0;
  }

  const cb2 = containerId === 'contract-articles-list' ? updateContractPreview : recalcTotal;
  cb2();
}

function onArticleNameChange(select, containerId) {
  const row = select.closest('.article-row');
  const nameInput = row.querySelector('.article-name-input');
  const priceInput = row.querySelector('.article-price');
  const labelEl = row.querySelector('.article-row-name');
  const customRow = row.querySelector('[id^="custom-name-row"]');

  if (select.value === '__custom__') {
    if (customRow) customRow.style.display = '';
    select.closest('.article-row-footer').style.display = 'none';
    if (labelEl) labelEl.textContent = 'Prestation personnalisée';
  } else if (select.value === '') {
    if (customRow) customRow.style.display = 'none';
    if (labelEl) labelEl.textContent = 'Nouvelle prestation';
  } else {
    if (customRow) customRow.style.display = 'none';
    const opt = select.options[select.selectedIndex];
    if (opt && opt.dataset.price) {
      priceInput.value = opt.dataset.price;
    }
    // Afficher nom sans le prix (couper au " — ")
    const fullLabel = opt ? opt.value : select.value;
    if (labelEl) labelEl.textContent = fullLabel;
  }

  const cid = containerId || 'articles-list';
  if (cid === 'contract-articles-list') updateContractPreview();
  else recalcTotal();
}

function updateArticleLabel(input) {
  const row = input.closest('.article-row');
  const labelEl = row.querySelector('.article-row-name');
  if (labelEl) labelEl.textContent = input.value || 'Prestation personnalisée';
  recalcTotal();
}

function onArticleQtyOrPriceChange(inp) {
  const row = inp.closest('.article-row');
  // Detect if inside contract or order
  const inContract = !!row.closest('#contract-articles-list');
  if (inContract) updateContractPreview(); else recalcTotal();
}

function removeArticleRow(btn) {
  const row = btn.closest('.article-row');
  const inContract = !!row.closest('#contract-articles-list');
  row.remove();
  if (inContract) updateContractPreview(); else recalcTotal();
}


function getArticles() {
  const rows = document.querySelectorAll('#articles-list .article-row');
  const articles = [];
  rows.forEach(row => {
    const select = row.querySelector('.article-name-select');
    const nameInput = row.querySelector('.article-name-input');
    const qtyInput = row.querySelector('.article-qty');
    const priceInput = row.querySelector('.article-price');

    let name = '';
    if (select && select.value === '__custom__') {
      name = nameInput ? nameInput.value.trim() : '';
    } else if (select) {
      name = select.value;
    }

    const qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
    const price = parseFloat(priceInput ? priceInput.value : '0') || 0;

    if (name) articles.push({ name, qty, price });
  });
  return articles;
}

function recalcTotal() {
  const articles = getArticles();
  const subtotal = articles.reduce((sum, a) => sum + (a.qty * a.price), 0);
  const discount = parseFloat(document.getElementById('order-discount').value) || 0;

  const discountAmt = subtotal * discount / 100;
  const total = subtotal - discountAmt;

  const currency = window._currency || 'FCFA';
  document.getElementById('order-subtotal').textContent = formatMoney(subtotal, currency);
  document.getElementById('order-total').textContent = formatMoney(total, currency);
}



/* ===================== RECHERCHE CLIENT DANS COMMANDE ===================== */

async function searchClientForOrder(query) {
  const suggestionsEl = document.getElementById('client-suggestions');

  if (!query.trim()) {
    suggestionsEl.classList.add('hidden');
    return;
  }

  const results = await searchClientsByQuery(query);

  if (results.length === 0) {
    suggestionsEl.classList.add('hidden');
    return;
  }

  suggestionsEl.innerHTML = results.slice(0, 5).map(c => `
    <div class="client-suggestion-item" onclick="selectClientForOrder(${JSON.stringify(c).replace(/"/g, '&quot;')})">
      <strong>${escapeHtml(c.firstname)} ${escapeHtml(c.lastname)}</strong>
      <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${escapeHtml(c.phone)}</span>
    </div>`).join('');

  suggestionsEl.classList.remove('hidden');
}

function selectClientForOrder(client) {
  selectedClientForOrder = client;

  // Afficher le client sélectionné
  document.getElementById('selected-client-name').textContent =
    `${client.firstname} ${client.lastname} — ${client.phone}`;
  document.getElementById('selected-client-info').classList.remove('hidden');

  // Masquer les champs de nouveau client
  document.getElementById('new-client-fields').style.display = 'none';

  // Cacher les suggestions
  document.getElementById('client-suggestions').classList.add('hidden');
  document.getElementById('client-search-input').value = '';

  // Remplir et mettre à jour le statut GPS du client
  document.getElementById('order-client-lat').value = client.latitude || '';
  document.getElementById('order-client-lng').value = client.longitude || '';
  updateOrderGPSStatus(client.latitude, client.longitude);
}

function clearSelectedClient() {
  selectedClientForOrder = null;
  document.getElementById('selected-client-info').classList.add('hidden');
  document.getElementById('new-client-fields').style.display = '';
  document.getElementById('client-firstname').value = '';
  document.getElementById('client-lastname').value = '';
  document.getElementById('client-phone').value = '';

  // Réinitialiser le statut GPS
  document.getElementById('order-client-lat').value = '';
  document.getElementById('order-client-lng').value = '';
  updateOrderGPSStatus(null, null);
}


/* ===================== SAUVEGARDE COMMANDE ===================== */

async function saveOrder() {
  const articles = getArticles();
  if (articles.length === 0) {
    showToast('Ajoutez au moins une prestation', 'error');
    return;
  }

  const arrivalDate = document.getElementById('order-arrival').value;
  const pickupDate = document.getElementById('order-pickup').value;

  if (!arrivalDate || !pickupDate) {
    showToast('Veuillez renseigner les dates', 'error');
    return;
  }

  if (pickupDate < arrivalDate) {
    showToast('La date d\'intervention doit être égale ou postérieure à la date de planification', 'error');
    return;
  }

  const subtotal = articles.reduce((sum, a) => sum + (a.qty * a.price), 0);
  const discount = parseFloat(document.getElementById('order-discount').value) || 0;
  const total = subtotal - (subtotal * discount / 100);

  const notes = document.getElementById('order-notes').value.trim();

  let clientId = null;
  let clientSnapshot = null;

  const orderLat = document.getElementById('order-client-lat').value;
  const orderLng = document.getElementById('order-client-lng').value;

  if (selectedClientForOrder) {
    clientId = selectedClientForOrder.id;
    if (orderLat && orderLng) {
      selectedClientForOrder.latitude = parseFloat(orderLat);
      selectedClientForOrder.longitude = parseFloat(orderLng);
      await updateClient(selectedClientForOrder);
    }
    clientSnapshot = selectedClientForOrder;
  } else {
    // Nouveau client ou client anonyme
    const firstname = document.getElementById('client-firstname').value.trim();
    const lastname = document.getElementById('client-lastname').value.trim();
    const phone = document.getElementById('client-phone').value.trim();

    if (!firstname && !lastname) {
      showToast('Veuillez renseigner le nom du client', 'error');
      return;
    }

    // Sauvegarder le nouveau client si téléphone fourni
    if (firstname || lastname) {
      const newClient = { firstname, lastname, phone };
      if (orderLat && orderLng) {
        newClient.latitude = parseFloat(orderLat);
        newClient.longitude = parseFloat(orderLng);
      }
      if (phone) {
        const newId = await addClient(newClient);
        clientId = newId;
        clientSnapshot = { ...newClient, id: newId };
        await loadClients();
      } else {
        clientSnapshot = newClient;
      }
    }
  }

  const orderData = {
    clientId,
    clientSnapshot,
    articles,
    subtotal,
    discount,
    total,
    arrivalDate,
    pickupDate,
    notes,
    status: 'processing'
  };

  if (editingOrderId) {
    const existing = await getOrder(editingOrderId);
    orderData.id = editingOrderId;
    orderData.ref = existing.ref;
    orderData.status = existing.status;
    orderData.createdAt = existing.createdAt;
    if (existing.contractId) {
      orderData.contractId = existing.contractId;
    }
    await updateOrder(orderData);
    showToast('Intervention modifiée !');
  } else {
    const newId = await addOrder(orderData);
    orderData.id = newId;
    showToast('Intervention créée !');
  }

  closeModal('modal-order');
  await loadDashboard();
  await loadOrdersWithClientNames();
}

/* ===================== SUPPRESSION ===================== */

function confirmDeleteOrder(orderId) {
  showConfirm(
    'Supprimer l\'intervention ?',
    'Cette action est irréversible. L\'intervention sera définitivement supprimée.',
    async () => {
      await deleteOrder(orderId);
      closeModal('modal-order-detail');
      showToast('Intervention supprimée');
      await loadDashboard();
      await loadOrdersWithClientNames();
    }
  );
}

/* ===================== SEARCH ===================== */

function searchOrders(query) {
  currentOrderSearch = query;
  loadOrdersWithClientNames();
}

function filterOrders(status, btn) {
  currentOrderFilter = status;

  // Update tabs UI
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  loadOrdersWithClientNames();
  showPage('orders');
}

/* ===================== HELPERS DATE ===================== */

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

/* ===================================================
   GESTION DES CONTRATS RÉCURRENTS
   =================================================== */

let editingContractId = null;
let selectedClientForContract = null;
let currentContractTarifs = [];

/* ---- Affichage liste des contrats ---- */

async function loadContractsList() {
  const listEl = document.getElementById('contracts-list');
  if (!listEl) return;

  const contracts = await getAllContracts();
  const clients = await getAllClients();
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c);

  if (contracts.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-contract"></i>
        <p>Aucun contrat d'entretien</p>
        <button class="btn-primary" onclick="showNewContract()">
          <i class="fas fa-plus"></i> Nouveau Contrat
        </button>
      </div>`;
    return;
  }

  // Récupérer les interventions liées
  const allOrders = await getAllOrders();
  const contractOrderMap = {};
  allOrders.forEach(o => {
    if (o.contractId) {
      if (!contractOrderMap[o.contractId]) contractOrderMap[o.contractId] = [];
      contractOrderMap[o.contractId].push(o);
    }
  });

  const settings = await getAllSettings();
  const currency = settings.currency || 'FCFA';
  const today = new Date().toISOString().split('T')[0];

  listEl.innerHTML = contracts.map(contract => {
    const client = clientMap[contract.clientId] || {};
    const clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
    const orders = contractOrderMap[contract.id] || [];
    const pending = orders.filter(o => o.status === 'processing' && o.pickupDate >= today).length;
    const done = orders.filter(o => o.status === 'ready' || o.status === 'delivered').length;

    const statusColor = contract.status === 'active' ? 'var(--success)' : contract.status === 'cancelled' ? 'var(--danger)' : 'var(--warning)';
    const statusLabel = contract.status === 'active' ? 'Actif' : contract.status === 'cancelled' ? 'Annulé' : 'Terminé';
    const freqLabel = getContractFrequencyLabel(contract.frequency);

    return `
      <div class="contract-card" onclick="showContractDetail(${contract.id})">
        <div class="contract-card-header">
          <div>
            <div class="contract-ref">${contract.ref || '—'}</div>
            <div class="contract-client">${escapeHtml(clientName)}</div>
          </div>
          <span class="contract-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${statusLabel}</span>
        </div>
        <div class="contract-meta">
          <span><i class="fas fa-calendar-alt"></i> ${formatDateShort(contract.startDate)} → ${formatDateShort(contract.endDate)}</span>
          <span><i class="fas fa-redo"></i> ${freqLabel}</span>
        </div>
        <div class="contract-progress">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px">
            <span>✅ ${done} terminée(s)</span>
            <span>🔄 ${pending} à venir</span>
            <span>📋 ${orders.length} total</span>
          </div>
          ${orders.length > 0 ? `
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${Math.round((done/orders.length)*100)}%"></div>
          </div>` : ''}
        </div>
        <div class="contract-amount">${formatMoney(contract.totalEstimated || 0, currency)}</div>
      </div>`;
  }).join('');
}

function getContractFrequencyLabel(freq) {
  const map = {
    weekly: 'Hebdomadaire',
    biweekly: 'Bimensuelle (2 sem.)',
    twice_monthly: '2× / mois',
    monthly: 'Mensuelle',
    custom: '📅 Dates personnalisées'
  };
  return map[freq] || freq || 'N/A';
}

/* ===================================================
   CALENDRIER INTERACTIF DE PLANIFICATION
   =================================================== */

// Dates sélectionnées dans le calendrier (état local)
let _calendarSelectedDates = [];
let _calendarViewOffset = 0; 

/**
 * Appelé quand la date de début ou de fin change.
 * Reconstruit le calendrier interactif.
 */
function onContractPeriodChange() {
  const startVal = document.getElementById('contract-start').value;
  const endVal   = document.getElementById('contract-end').value;

  const clearBtnWrap = document.getElementById('calendar-clear-btn-wrap');

  if (!startVal || !endVal || endVal < startVal) {
    document.getElementById('calendar-planner-wrap').innerHTML = `
      <div class="calendar-no-dates">
        <i class="fas fa-calendar-alt" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.4"></i>
        Sélectionnez une date de début et de fin pour voir le calendrier de planification
      </div>`;
    document.getElementById('period-indicator').style.display = 'none';
    document.getElementById('calendar-summary-wrap').classList.add('hidden');
    if (clearBtnWrap) clearBtnWrap.style.display = 'none';
    return;
  }

  const start = new Date(startVal + 'T00:00:00');
  const end   = new Date(endVal   + 'T00:00:00');
  const diffDays = Math.round((end - start) / 86400000);
  const diffWeeks = Math.ceil(diffDays / 7) || 1;

  const periodEl = document.getElementById('period-indicator');
  const periodText = document.getElementById('period-text');
  periodText.textContent = ` ${diffWeeks} semaine(s) · du ${start.toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})} au ${end.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`;
  periodEl.style.display = 'flex';
  periodEl.style.gap = '6px';
  periodEl.style.alignItems = 'center';
  periodEl.style.justifyContent = 'center';

  if (clearBtnWrap) clearBtnWrap.style.display = 'block';

  // Retirer les dates sélectionnées hors de la période
  _calendarSelectedDates = _calendarSelectedDates.filter(d => d >= startVal && d <= endVal);
  _calendarViewOffset = 0;

  buildCalendarPlanner(startVal, endVal);
  updateContractPreview();
}

/**
 * Construit le calendrier semaine par semaine — avec les boutons Lun/Mar/Mer…
 * cochables directement sur chaque bloc semaine.
 */
function buildCalendarPlanner(startVal, endVal) {
  const wrap = document.getElementById('calendar-planner-wrap');
  if (!wrap) return;

  const start = new Date(startVal + 'T00:00:00');
  const end   = new Date(endVal   + 'T00:00:00');
  const today = new Date().toISOString().split('T')[0];

  // Trouver le lundi de la semaine de début
  const firstMonday = new Date(start);
  const dayOfWeek = firstMonday.getDay(); // 0=dim,1=lun...
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  firstMonday.setDate(firstMonday.getDate() + offset);

  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  let html = '<div class="calendar-planner">';

  let weekStart = new Date(firstMonday);
  let weekNum = 0;

  while (weekStart <= end) {
    weekNum++;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = weekStart.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
    const weekEndStr   = weekEnd.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });

    // Vérifier combien de jours sont sélectionnés dans cette semaine
    let selectedCountInWeek = 0;
    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(dayDate.getDate() + d);
      const dateStr = dayDate.toISOString().split('T')[0];
      if (_calendarSelectedDates.includes(dateStr)) selectedCountInWeek++;
    }

    html += `
      <div class="calendar-week-block">
        <div class="calendar-week-header">
          <div class="calendar-week-label">
            <i class="fas fa-calendar-week"></i>
            Semaine ${weekNum}
            ${selectedCountInWeek > 0 ? `<span class="calendar-week-badge">${selectedCountInWeek} jour${selectedCountInWeek > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="calendar-week-count">${weekStartStr} – ${weekEndStr}</div>
        </div>
        <div class="calendar-days-row">`;

    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(dayDate.getDate() + d);
      const dateStr = dayDate.toISOString().split('T')[0];
      const isInRange = dateStr >= startVal && dateStr <= endVal;
      const isSelected = _calendarSelectedDates.includes(dateStr);
      const isTodayDay = dateStr === today;

      let cls = 'calendar-day-btn';
      if (!isInRange) cls += ' disabled';
      if (isSelected) cls += ' selected';
      if (isTodayDay) cls += ' today';

      const clickHandler = isInRange
        ? `onclick="toggleCalendarDay('${dateStr}','${startVal}','${endVal}')"`
        : '';

      html += `
        <button class="${cls}" ${clickHandler} title="${dayDate.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})}">
          <span class="calendar-day-name">${DAY_NAMES[d]}</span>
          <span class="calendar-day-num">${dayDate.getDate()}</span>
          <span class="calendar-selected-dot"></span>
        </button>`;
    }

    html += `</div></div>`;
    weekStart.setDate(weekStart.getDate() + 7);
  }

  html += '</div>';
  wrap.innerHTML = html;
  updateCalendarSummary();
}

/**
 * Bascule la sélection d'un jour dans le calendrier.
 */
function toggleCalendarDay(dateStr, startVal, endVal) {
  if (_calendarSelectedDates.includes(dateStr)) {
    _calendarSelectedDates = _calendarSelectedDates.filter(d => d !== dateStr);
  } else {
    _calendarSelectedDates.push(dateStr);
    _calendarSelectedDates.sort();
  }
  buildCalendarPlanner(startVal, endVal);
  updateContractPreview();
}

/**
 * Supprime une date depuis le résumé.
 */
function removeCalendarDate(dateStr) {
  _calendarSelectedDates = _calendarSelectedDates.filter(d => d !== dateStr);
  const startVal = document.getElementById('contract-start').value;
  const endVal   = document.getElementById('contract-end').value;
  if (startVal && endVal) buildCalendarPlanner(startVal, endVal);
  updateContractPreview();
}

/**
 * Met à jour le résumé des dates sélectionnées.
 */
function updateCalendarSummary() {
  const wrap  = document.getElementById('calendar-summary-wrap');
  const count = document.getElementById('calendar-summary-count');
  const chips = document.getElementById('calendar-summary-chips');
  if (!wrap || !count || !chips) return;

  if (_calendarSelectedDates.length === 0) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  count.textContent = _calendarSelectedDates.length;
  chips.innerHTML = _calendarSelectedDates.map(d => {
    const label = new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {weekday:'short', day:'2-digit', month:'short'});
    return `<span class="calendar-summary-chip" onclick="removeCalendarDate('${d}')" title="Cliquer pour retirer">
      <i class="fas fa-calendar-day"></i>${label} <i class="fas fa-times" style="font-size:9px;opacity:0.6"></i>
    </span>`;
  }).join('');
}

/* ===================================================
   LOGIQUE DE L'ASSISTANT DE PLANIFICATION RAPIDE
   =================================================== */
let _quickSelectedDays = [];

function resetQuickScheduleHelper() {
  _quickSelectedDays = [];
  document.querySelectorAll('.btn-quick-day').forEach(btn => btn.classList.remove('active'));
}

function toggleQuickDay(btn) {
  const day = parseInt(btn.dataset.day);
  if (_quickSelectedDays.includes(day)) {
    _quickSelectedDays = _quickSelectedDays.filter(d => d !== day);
    btn.classList.remove('active');
  } else {
    _quickSelectedDays.push(day);
    btn.classList.add('active');
  }
}

function applyQuickSchedule() {
  const startVal = document.getElementById('contract-start').value;
  const endVal = document.getElementById('contract-end').value;
  if (!startVal || !endVal) {
    showToast('Dates de début ou de fin manquantes', 'error');
    return;
  }
  if (endVal < startVal) {
    showToast('La date de fin est antérieure à la date de début', 'error');
    return;
  }
  if (_quickSelectedDays.length === 0) {
    showToast('Veuillez sélectionner au moins un jour', 'error');
    return;
  }

  const start = new Date(startVal + 'T00:00:00');
  const end = new Date(endVal + 'T00:00:00');
  const tempDates = new Set(_calendarSelectedDates);
  let current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (_quickSelectedDays.includes(day)) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      tempDates.add(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }

  _calendarSelectedDates = Array.from(tempDates);
  _calendarSelectedDates.sort();

  buildCalendarPlanner(startVal, endVal);
  updateContractPreview();
  showToast('Planification appliquée avec succès !');
}

function clearCalendarPlanner() {
  _calendarSelectedDates = [];
  const startVal = document.getElementById('contract-start').value;
  const endVal = document.getElementById('contract-end').value;
  if (startVal && endVal) buildCalendarPlanner(startVal, endVal);
  updateContractPreview();
  showToast('Toutes les dates ont été effacées');
}

function getCalendarDates() {
  return [..._calendarSelectedDates];
}

// Compatibilité ancienne API
function getCustomDates() { return getCalendarDates(); }

/* ---- Ancien renderCustomDatesList (conservé pour compatibilité) ---- */
function renderCustomDatesList() {}

/* --- (kept for compat) --- */
function addCustomDate() {}
function removeCustomDate(d) { removeCalendarDate(d); }


/* ---- Détail contrat ---- */

async function showContractDetail(contractId) {
  const contract = await getContract(contractId);
  if (!contract) return;

  let client = null;
  if (contract.clientId) client = await getClient(contract.clientId);

  const settings = await getAllSettings();
  const currency = settings.currency || 'FCFA';
  const clientName = client ? `${client.firstname || ''} ${client.lastname || ''}`.trim() : 'Client';

  // Interventions liées
  const orders = await getOrdersByContract(contractId);
  const today = new Date().toISOString().split('T')[0];
  const pending = orders.filter(o => o.status === 'processing' && o.pickupDate >= today);
  const done = orders.filter(o => o.status === 'ready' || o.status === 'delivered');
  const cancelled = orders.filter(o => o.status === 'cancelled');

  const ordersHtml = orders.length === 0
    ? '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">Aucune intervention générée</p>'
    : orders.slice().sort((a,b) => a.pickupDate.localeCompare(b.pickupDate)).map(o => `
      <div class="detail-row" style="cursor:pointer" onclick="closeModal('modal-contract-detail');showOrderDetail(${o.id})">
        <div>
          <div style="font-size:12px;color:var(--text-muted)">${formatDateShort(o.pickupDate)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${o.ref}</div>
        </div>
        <span class="order-status-badge badge-${o.status}">${getStatusLabel(o.status)}</span>
      </div>`).join('');

  let gpsRow = '';
  if (client && client.latitude && client.longitude) {
    gpsRow = `
      <div class="detail-row" style="margin-top: 6px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08)">
        <span class="detail-label"><i class="fas fa-map-marker-alt" style="color:var(--success)"></i> GPS Enregistré</span>
        <span class="detail-value" style="display:flex; gap:6px">
          <button class="btn-primary btn-sm" style="padding:4px 8px; font-size:11px" onclick="navigateToClient(${client.latitude}, ${client.longitude})">
            <i class="fas fa-route"></i> Google Maps
          </button>
          <button class="btn-secondary btn-sm" style="padding:4px 8px; font-size:11px" onclick="navigateToClientWaze(${client.latitude}, ${client.longitude})">
            Waze
          </button>
        </span>
      </div>`;
  } else if (client && client.id) {
    gpsRow = `
      <div class="detail-row" style="margin-top: 6px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08)">
        <span class="detail-label" style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> Aucun GPS</span>
        <span class="detail-value">
          <button class="btn-secondary btn-sm" style="padding:4px 8px; font-size:11px" onclick="captureGPSFromContractDetail(${contract.id}, ${client.id})">
            <i class="fas fa-crosshairs"></i> Capturer
          </button>
        </span>
      </div>`;
  }

  const content = document.getElementById('contract-detail-content');
  content.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-file-contract"></i> Informations du Contrat</div>
      <div class="detail-row"><span class="detail-label">Référence</span><span class="detail-value">${contract.ref}</span></div>
      <div class="detail-row"><span class="detail-label">Client</span><span class="detail-value" style="font-weight:700">${escapeHtml(clientName)}</span></div>
      <div class="detail-row"><span class="detail-label">Fréquence</span><span class="detail-value">${getContractFrequencyLabel(contract.frequency)}</span></div>
      <div class="detail-row"><span class="detail-label">Début</span><span class="detail-value">${formatDateShort(contract.startDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Fin</span><span class="detail-value">${formatDateShort(contract.endDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Total estimé</span><span class="detail-value" style="color:var(--gold-light);font-weight:700">${formatMoney(contract.totalEstimated || 0, currency)}</span></div>
      ${gpsRow}
    </div>


    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
      <div class="glass-card" style="text-align:center;padding:10px">
        <div style="font-size:20px;font-weight:800;color:var(--gold-light)">${orders.length}</div>
        <div style="font-size:10px;color:var(--text-muted)">Total</div>
      </div>
      <div class="glass-card" style="text-align:center;padding:10px">
        <div style="font-size:20px;font-weight:800;color:var(--success)">${done.length}</div>
        <div style="font-size:10px;color:var(--text-muted)">Terminées</div>
      </div>
      <div class="glass-card" style="text-align:center;padding:10px">
        <div style="font-size:20px;font-weight:800;color:var(--warning)">${pending.length}</div>
        <div style="font-size:10px;color:var(--text-muted)">À venir</div>
      </div>
    </div>

    ${contract.notes ? `
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-sticky-note"></i> Notes du contrat</div>
      <p style="font-size:13px;color:var(--text-secondary);font-style:italic">${escapeHtml(contract.notes)}</p>
    </div>` : ''}

    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-calendar-alt"></i> Calendrier des Interventions</div>
      ${ordersHtml}
    </div>

    <div class="detail-actions">
      ${contract.status === 'active' ? `
      <button class="btn-primary btn-full" onclick="editContract(${contract.id})">
        <i class="fas fa-edit"></i> Modifier le Contrat
      </button>
      <button class="btn-danger btn-full" onclick="confirmCancelContract(${contract.id})">
        <i class="fas fa-ban"></i> Annuler le Contrat
      </button>` : `
      <div style="text-align:center;padding:12px;color:var(--text-muted);font-size:13px">
        <i class="fas fa-info-circle"></i> Ce contrat est ${contract.status === 'cancelled' ? 'annulé' : 'terminé'}.
      </div>`}
    </div>
  `;

  openModal('modal-contract-detail');
}

/* ---- Formulaire nouveau contrat ---- */

async function showNewContract() {
  editingContractId = null;
  selectedClientForContract = null;
  currentContractTarifs = await getAllTarifs();
  if (currentContractTarifs.length === 0) currentContractTarifs = DEFAULT_TARIFS.map(t => ({ ...t }));

  document.getElementById('modal-contract-title').textContent = 'Nouveau Contrat d\'Entretien';
  document.getElementById('contract-id').value = '';
  document.getElementById('contract-client-search').value = '';
  document.getElementById('contract-client-suggestions').classList.add('hidden');
  document.getElementById('contract-selected-client-info').classList.add('hidden');
  document.getElementById('contract-new-client-fields').style.display = '';
  document.getElementById('contract-client-firstname').value = '';
  document.getElementById('contract-client-lastname').value = '';
  document.getElementById('contract-client-phone').value = '';

  // Reset GPS
  document.getElementById('contract-client-lat').value = '';
  document.getElementById('contract-client-lng').value = '';
  updateContractGPSStatus(null, null);

  // Dates par défaut : aujourd'hui → dans 1 mois
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const startStr = today.toISOString().split('T')[0];
  const endStr   = nextMonth.toISOString().split('T')[0];

  document.getElementById('contract-start').value = startStr;
  document.getElementById('contract-end').value   = endStr;
  document.getElementById('contract-discount').value = '0';
  document.getElementById('contract-notes').value = '';

  // Reset calendrier
  _calendarSelectedDates = [];
  resetQuickScheduleHelper();
  onContractPeriodChange();

  // Prestations
  const articlesList = document.getElementById('contract-articles-list');
  articlesList.innerHTML = '';
  addContractArticleRow();

  updateContractPreview();
  openModal('modal-contract');
}

async function editContract(contractId) {
  const contract = await getContract(contractId);
  if (!contract) return;

  editingContractId = contractId;
  currentContractTarifs = await getAllTarifs();
  if (currentContractTarifs.length === 0) currentContractTarifs = DEFAULT_TARIFS.map(t => ({ ...t }));

  document.getElementById('modal-contract-title').textContent = 'Modifier le Contrat';
  document.getElementById('contract-id').value = contractId;

  // Client
  if (contract.clientId) {
    const client = await getClient(contract.clientId);
    if (client) selectClientForContract(client);
  } else if (contract.clientSnapshot) {
    document.getElementById('contract-client-firstname').value = contract.clientSnapshot.firstname || '';
    document.getElementById('contract-client-lastname').value = contract.clientSnapshot.lastname || '';
    document.getElementById('contract-client-phone').value = contract.clientSnapshot.phone || '';
    
    // Charger le GPS du snapshot si présent
    const lat = contract.clientSnapshot.latitude || '';
    const lng = contract.clientSnapshot.longitude || '';
    document.getElementById('contract-client-lat').value = lat;
    document.getElementById('contract-client-lng').value = lng;
    updateContractGPSStatus(lat, lng);
  } else {
    // Reset GPS
    document.getElementById('contract-client-lat').value = '';
    document.getElementById('contract-client-lng').value = '';
    updateContractGPSStatus(null, null);
  }

  document.getElementById('contract-start').value = contract.startDate || '';
  document.getElementById('contract-end').value   = contract.endDate   || '';
  document.getElementById('contract-discount').value = contract.discount || 0;
  document.getElementById('contract-notes').value    = contract.notes   || '';

  // Restaurer les dates sélectionnées depuis le contrat
  _calendarSelectedDates = Array.isArray(contract.customDates) && contract.customDates.length > 0
    ? [...contract.customDates]
    : [];
  resetQuickScheduleHelper();

  // Si contrat avec fréquence automatique, régénérer les dates depuis les interventions existantes
  if (!contract.customDates || contract.customDates.length === 0) {
    // Charger les dates depuis les interventions du contrat
    getOrdersByContract(contractId).then(orders => {
      _calendarSelectedDates = orders.map(o => o.pickupDate).filter(Boolean);
      _calendarSelectedDates.sort();
      onContractPeriodChange();
    });
  } else {
    onContractPeriodChange();
  }

  // Prestations
  const articlesList = document.getElementById('contract-articles-list');
  articlesList.innerHTML = '';
  (contract.articles || [{ name: '', qty: 1, price: 0 }]).forEach(art => addContractArticleRow(art));

  updateContractPreview();
  closeModal('modal-contract-detail');
  openModal('modal-contract');
}

/* ---- Ligne prestation dans contrat (utilise la fonction unifiée) ---- */

function addContractArticleRow(article = null) {
  addArticleRow(article, 'contract-articles-list');
}

// Alias de compatibilité
function onContractArticleChange(select) {
  onArticleNameChange(select, 'contract-articles-list');
}
function removeContractArticleRow(btn) {
  removeArticleRow(btn);
}

function getContractArticles() {
  const rows = document.querySelectorAll('#contract-articles-list .article-row');
  const articles = [];
  rows.forEach(row => {
    const select = row.querySelector('.article-name-select');
    const nameInput = row.querySelector('.article-name-input');
    const qtyInput = row.querySelector('.article-qty');
    const priceInput = row.querySelector('.article-price');

    let name = '';
    if (select && select.value === '__custom__') {
      name = nameInput ? nameInput.value.trim() : '';
    } else if (select) {
      name = select.value;
    }

    const qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
    const price = parseFloat(priceInput ? priceInput.value : '0') || 0;

    if (name) articles.push({ name, qty, price });
  });
  return articles;
}

/* ---- Prévisualisation du contrat ---- */

function updateContractPreview() {
  const articles = getContractArticles();
  const subtotal = articles.reduce((sum, a) => sum + a.qty * a.price, 0);
  const discount = parseFloat(document.getElementById('contract-discount')?.value) || 0;
  const pricePerIntervention = subtotal - (subtotal * discount / 100);

  // Compter les dates sélectionnées dans le calendrier
  const nbInterventions = _calendarSelectedDates.length;
  updateCalendarSummary();

  const total = pricePerIntervention * nbInterventions;
  const currency = window._currency || 'FCFA';

  const previewEl = document.getElementById('contract-preview');
  if (previewEl) {
    const customHint = nbInterventions === 0
      ? '<div style="color:var(--warning);font-size:12px;text-align:center;padding:4px"><i class="fas fa-info-circle"></i> Ajoutez des dates de passage ci-dessus</div>'
      : '';
    previewEl.innerHTML = `
      ${customHint}
      <div class="contract-preview-row">
        <span>Prix / intervention</span>
        <strong>${formatMoney(pricePerIntervention, currency)}</strong>
      </div>
      <div class="contract-preview-row">
        <span>Nombre d'interventions prévues</span>
        <strong style="color:var(--gold-light)">${nbInterventions}</strong>
      </div>
      <div class="contract-preview-row total">
        <span>TOTAL ESTIMÉ DU CONTRAT</span>
        <strong style="color:var(--accent-light);font-size:16px">${formatMoney(total, currency)}</strong>
      </div>`;
  }
}

/* ---- Recherche client pour contrat ---- */

async function searchClientForContract(query) {
  const suggestionsEl = document.getElementById('contract-client-suggestions');
  if (!query.trim()) { suggestionsEl.classList.add('hidden'); return; }

  const results = await searchClientsByQuery(query);
  if (results.length === 0) { suggestionsEl.classList.add('hidden'); return; }

  suggestionsEl.innerHTML = results.slice(0, 5).map(c => `
    <div class="client-suggestion-item" onclick="selectClientForContract(${JSON.stringify(c).replace(/"/g, '&quot;')})">
      <strong>${escapeHtml(c.firstname)} ${escapeHtml(c.lastname)}</strong>
      <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${escapeHtml(c.phone)}</span>
    </div>`).join('');

  suggestionsEl.classList.remove('hidden');
}

function selectClientForContract(client) {
  selectedClientForContract = client;
  document.getElementById('contract-selected-client-name').textContent =
    `${client.firstname} ${client.lastname} — ${client.phone}`;
  document.getElementById('contract-selected-client-info').classList.remove('hidden');
  document.getElementById('contract-new-client-fields').style.display = 'none';
  document.getElementById('contract-client-suggestions').classList.add('hidden');
  document.getElementById('contract-client-search').value = '';

  // Remplir et mettre à jour le statut GPS du client
  document.getElementById('contract-client-lat').value = client.latitude || '';
  document.getElementById('contract-client-lng').value = client.longitude || '';
  updateContractGPSStatus(client.latitude, client.longitude);
}

function clearSelectedClientForContract() {
  selectedClientForContract = null;
  document.getElementById('contract-selected-client-info').classList.add('hidden');
  document.getElementById('contract-new-client-fields').style.display = '';
  document.getElementById('contract-client-firstname').value = '';
  document.getElementById('contract-client-lastname').value = '';
  document.getElementById('contract-client-phone').value = '';

  // Réinitialiser le statut GPS
  document.getElementById('contract-client-lat').value = '';
  document.getElementById('contract-client-lng').value = '';
  updateContractGPSStatus(null, null);
}


/* ---- Sauvegarde contrat + génération des interventions ---- */

async function saveContract() {
  const articles = getContractArticles();
  if (articles.length === 0) {
    showToast('Ajoutez au moins une prestation', 'error');
    return;
  }

  const startDate = document.getElementById('contract-start').value;
  const endDate   = document.getElementById('contract-end').value;
  const discount  = parseFloat(document.getElementById('contract-discount').value) || 0;
  const notes     = document.getElementById('contract-notes').value.trim();

  const subtotal = articles.reduce((sum, a) => sum + a.qty * a.price, 0);
  const pricePerIntervention = subtotal - (subtotal * discount / 100);

  // Récupérer les dates sélectionnées depuis le calendrier interactif
  const dates = getCalendarDates();

  if (!startDate || !endDate) {
    showToast('Veuillez renseigner les dates de début et de fin', 'error');
    return;
  }
  if (endDate < startDate) {
    showToast('La date de fin doit être après la date de début', 'error');
    return;
  }
  if (dates.length === 0) {
    showToast('Sélectionnez au moins une date de passage dans le calendrier', 'error');
    return;
  }

  const totalEstimated = pricePerIntervention * dates.length;

  const contractLat = document.getElementById('contract-client-lat').value;
  const contractLng = document.getElementById('contract-client-lng').value;

  // Gérer le client
  let clientId = null;
  let clientSnapshot = null;

  if (selectedClientForContract) {
    clientId = selectedClientForContract.id;
    if (contractLat && contractLng) {
      selectedClientForContract.latitude = parseFloat(contractLat);
      selectedClientForContract.longitude = parseFloat(contractLng);
      await updateClient(selectedClientForContract);
    }
    clientSnapshot = selectedClientForContract;
  } else {
    const firstname = document.getElementById('contract-client-firstname').value.trim();
    const lastname = document.getElementById('contract-client-lastname').value.trim();
    const phone = document.getElementById('contract-client-phone').value.trim();

    if (!firstname && !lastname) {
      showToast('Veuillez renseigner le nom du client', 'error');
      return;
    }

    if (firstname || lastname) {
      const newClient = { firstname, lastname, phone };
      if (contractLat && contractLng) {
        newClient.latitude = parseFloat(contractLat);
        newClient.longitude = parseFloat(contractLng);
      }
      if (phone) {
        const newId = await addClient(newClient);
        clientId = newId;
        clientSnapshot = { ...newClient, id: newId };
        await loadClients();
      } else {
        clientSnapshot = newClient;
      }
    }
  }

  // Dates de début/fin : prendre min/max des dates choisies
  const effectiveStartDate = dates[0] || startDate;
  const effectiveEndDate = dates[dates.length - 1] || endDate;

  const contractData = {
    clientId,
    clientSnapshot,
    articles,
    subtotal,
    discount,
    pricePerIntervention,
    totalEstimated,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    frequency: 'custom',
    customDates: dates,
    notes,
    status: 'active'
  };

  let contractId;

  if (editingContractId) {
    // Modifier le contrat existant
    const existing = await getContract(editingContractId);
    contractData.id = editingContractId;
    contractData.ref = existing.ref;
    contractData.createdAt = existing.createdAt;
    await updateContract(contractData);
    contractId = editingContractId;

    // Supprimer les futures interventions existantes et en recréer
    const existingOrders = await getOrdersByContract(contractId);
    const today = new Date().toISOString().split('T')[0];
    for (const o of existingOrders) {
      if (o.pickupDate >= today && o.status === 'processing') {
        await deleteOrder(o.id);
      }
    }
    showToast('Contrat modifié — interventions futures recréées');
  } else {
    contractId = await addContract(contractData);
    showToast(`Contrat créé ! ${dates.length} interventions planifiées.`);
  }


  // Créer les interventions individuelles
  const newDates = editingContractId
    ? dates.filter(d => d >= new Date().toISOString().split('T')[0])
    : dates;

  for (const date of newDates) {
    const orderData = {
      clientId,
      clientSnapshot,
      articles,
      subtotal,
      discount,
      deliveryFee: 0,
      total: pricePerIntervention,
      arrivalDate: date,
      pickupDate: date,
      notes,
      status: 'processing',
      contractId
    };
    await addOrder(orderData);
  }

  closeModal('modal-contract');
  await loadDashboard();
  await loadContractsList();
}

/* ---- Annulation contrat ---- */

function confirmCancelContract(contractId) {
  showConfirm(
    '❌ Annuler le contrat ?',
    'Toutes les interventions futures planifiées liées à ce contrat seront annulées. Les interventions déjà effectuées sont conservées.',
    async () => {
      await cancelContract(contractId);
    }
  );
}

async function cancelContract(contractId) {
  const contract = await getContract(contractId);
  if (!contract) return;

  // Marquer le contrat comme annulé
  contract.status = 'cancelled';
  await updateContract(contract);

  // Annuler toutes les interventions futures (non encore effectuées)
  const orders = await getOrdersByContract(contractId);
  const today = new Date().toISOString().split('T')[0];
  let cancelled = 0;

  for (const o of orders) {
    if (o.status === 'processing' && o.pickupDate >= today) {
      o.status = 'cancelled';
      await updateOrder(o);
      cancelled++;
    }
  }

  closeModal('modal-contract-detail');
  showToast(`Contrat annulé — ${cancelled} intervention(s) future(s) annulée(s)`);
  await loadContractsList();
  await loadDashboard();
}

