/* ===================================================
   clients.js — Gestion des Clients pour ST-PRO
   =================================================== */

/* ===================== CHARGEMENT ===================== */

async function loadClients(search = '') {
  let clients = await getAllClients();

  if (search.trim()) {
    const q = search.toLowerCase();
    clients = clients.filter(c =>
      (c.firstname + ' ' + c.lastname).toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    );
  }

  // Trier par nom
  clients.sort((a, b) => (a.lastname || '').localeCompare(b.lastname || ''));

  const listEl = document.getElementById('clients-list');
  if (!listEl) return;

  if (clients.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>${search ? 'Aucun domicile trouvé' : 'Aucun client enregistré'}</p>
        ${!search ? '<button class="btn-primary" onclick="showNewClient()"><i class="fas fa-plus"></i> Ajouter un client</button>' : ''}
      </div>`;
    return;
  }

  // Attacher le compte de commandes (interventions)
  const orders = await getAllOrders();
  const orderCountMap = {};
  orders.forEach(o => {
    if (o.clientId) {
      orderCountMap[o.clientId] = (orderCountMap[o.clientId] || 0) + 1;
    }
  });

  listEl.innerHTML = clients.map(c => renderClientCard(c, orderCountMap[c.id] || 0)).join('');
}

function renderClientCard(client, orderCount = 0) {
  const initials = getInitials(client.firstname, client.lastname);
  const fullName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
  
  // Badge de risque
  let riskBadge = '';
  let cardClass = '';
  if (client.riskLevel === 'high') {
    riskBadge = '<span class="badge-risk badge-risk-high danger-badge-blink">⚠️ Foyer Dangereux</span>';
    cardClass = 'risk-high';
  } else if (client.riskLevel === 'medium') {
    riskBadge = '<span class="badge-risk badge-risk-medium warning-badge-blink">⚠️ Zone Sensible</span>';
    cardClass = 'risk-medium';
  } else {
    riskBadge = '<span class="badge-risk badge-risk-low standard-badge">Standard</span>';
    cardClass = 'risk-low';
  }

  const dayStr = client.wateringDay || 'Non spécifié';
  const freqStr = client.frequency ? getFrequencyLabelAbbr(client.frequency) : 'Non défini';

  // Indicateur GPS
  const gpsIcon = client.latitude && client.longitude
    ? `<span style="color:var(--success);font-size:10px;margin-left:6px" title="GPS enregistré"><i class="fas fa-map-marker-alt"></i> GPS ✓</span>`
    : '';

  return `
    <div class="client-card ${cardClass}" onclick="showClientDetail(${client.id})">
      <div class="client-avatar">${initials}</div>
      <div class="client-info">
        <div class="client-name">${escapeHtml(fullName)} ${riskBadge}</div>
        <div class="client-phone"><i class="fas fa-map-marker-alt" style="font-size:10px;color:var(--gold-light);margin-right:4px"></i>${escapeHtml(client.address || 'Pas d\'adresse')}${gpsIcon}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
          <i class="fas fa-calendar-day" style="font-size:10px;color:var(--accent-light);margin-right:4px"></i>Arrosage : <strong>${dayStr}</strong> (${freqStr})
        </div>
      </div>
      <div class="client-actions">
        <button class="btn-icon" onclick="event.stopPropagation();callClient('${escapeHtml(client.phone)}')" title="Appeler">
          <i class="fas fa-phone" style="color:var(--success)"></i>
        </button>
        ${client.latitude && client.longitude
          ? `<button class="btn-icon" onclick="event.stopPropagation();navigateToClient(${client.latitude},${client.longitude})" title="Navigation GPS">
               <i class="fas fa-route" style="color:var(--accent-light)"></i>
             </button>`
          : `<button class="btn-icon" onclick="event.stopPropagation();sendWateringReminderById(${client.id})" title="Rappel WhatsApp">
               <i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i>
             </button>`
        }
      </div>
    </div>`;
}

function getInitials(firstname, lastname) {
  const f = (firstname || '').charAt(0).toUpperCase();
  const l = (lastname || '').charAt(0).toUpperCase();
  return (f + l) || '?';
}

function getFrequencyLabel(freq) {
  const map = {
    basique: 'Formule Entretien Basique (4 000 FCFA / intervention)',
    standard: 'Formule Entretien Standard (10 000 FCFA / mois)',
    premium: 'Formule Premium (Sur Devis)',
    hebdo: 'Hebdomadaire (1 passage/semaine)',
    custom: 'Prestation Personnalisée'
  };
  return map[freq] || freq || 'Non définie';
}

function getFrequencyLabelAbbr(freq) {
  const map = {
    basique: 'Basique',
    standard: 'Standard',
    premium: 'Premium',
    hebdo: 'Hebdo',
    custom: 'Perso'
  };
  return map[freq] || freq || 'N/A';
}

/* ===================== DÉTAIL CLIENT ===================== */

async function showClientDetail(clientId) {
  const client = await getClient(clientId);
  if (!client) return;

  // Charger les commandes (interventions) du client
  const orders = await getOrdersByClient(clientId);
  const settings = await getAllSettings();
  const currency = settings.currency || 'FCFA';

  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  const content = document.getElementById('order-detail-content');
  const fullName = `${client.firstname || ''} ${client.lastname || ''}`.trim();
  const initials = getInitials(client.firstname, client.lastname);

  // Alerte de sécurité
  let safetyAlertHTML = '';
  let riskBadge = '';
  if (client.riskLevel === 'high') {
    safetyAlertHTML = `
      <div class="danger-badge-blink" style="padding:12px;border-radius:var(--radius-sm);text-align:center;margin:12px 0 16px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px">
        <i class="fas fa-exclamation-triangle" style="font-size:16px"></i>
        <span><strong>ATTENTION : FOYER DANGEREUX !</strong><br>Prendre des précautions de sécurité pour l'équipe sur place.</span>
      </div>`;
    riskBadge = '<span class="badge-risk badge-risk-high danger-badge-blink">⚠️ Foyer Dangereux</span>';
  } else if (client.riskLevel === 'medium') {
    safetyAlertHTML = `
      <div class="warning-badge-blink" style="padding:10px;border-radius:var(--radius-sm);text-align:center;margin:12px 0 16px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px">
        <i class="fas fa-exclamation-circle" style="font-size:14px"></i>
        <span><strong>Zone Sensible</strong> : Rester attentif et sécuriser les accès.</span>
      </div>`;
    riskBadge = '<span class="badge-risk badge-risk-medium warning-badge-blink">⚠️ Zone Sensible</span>';
  } else {
    riskBadge = '<span class="badge-risk badge-risk-low standard-badge">Zone Sécurisée</span>';
  }

  // GPS Block
  let gpsBlock = '';
  if (client.latitude && client.longitude) {
    gpsBlock = `
      <div class="glass-card" style="margin:12px 0;padding:12px;background:rgba(46,204,113,0.07);border-color:rgba(46,204,113,0.3)">
        <div style="font-size:11px;color:var(--success);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">
          <i class="fas fa-map-marker-alt"></i> Position GPS Enregistrée
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
          📍 ${client.latitude.toFixed(6)}, ${client.longitude.toFixed(6)}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" style="flex:1;font-size:12px;padding:8px" onclick="navigateToClient(${client.latitude},${client.longitude})">
            <i class="fas fa-route"></i> Google Maps
          </button>
          <button class="btn-secondary" style="flex:1;font-size:12px;padding:8px" onclick="navigateToClientWaze(${client.latitude},${client.longitude})">
            <i class="fas fa-car"></i> Waze
          </button>
          <button class="btn-secondary" style="width:40px;padding:8px;flex-shrink:0" onclick="captureClientGPS(${client.id})" title="Mettre à jour GPS">
            <i class="fas fa-sync-alt" style="font-size:12px"></i>
          </button>
        </div>
      </div>`;
  } else {
    gpsBlock = `
      <div class="glass-card" style="margin:12px 0;padding:12px;background:rgba(246,158,30,0.07);border-color:rgba(246,158,30,0.3)">
        <div style="font-size:11px;color:var(--warning);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">
          <i class="fas fa-map-marker-alt"></i> Pas de GPS enregistré
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
          Rendez-vous chez le client, puis capturez sa position pour guider votre équipe.
        </p>
        <button class="btn-primary btn-full" style="font-size:13px" onclick="captureClientGPS(${client.id})">
          <i class="fas fa-crosshairs"></i> Capturer la Position GPS du Client
        </button>
      </div>`;
  }

  const ordersHtml = orders.length === 0
    ? '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">Aucune intervention planifiée</p>'
    : orders.slice(0, 5).map(o => `
        <div class="detail-row" style="cursor:pointer" onclick="closeModal('modal-order-detail');showOrderDetail(${o.id})">
          <div>
            <div style="font-size:13px;font-weight:600">${o.ref || '—'}</div>
            <div style="font-size:11px;color:var(--text-muted)">Passage : ${o.pickupDate ? formatDateShort(o.pickupDate) : ''}</div>
          </div>
          <div style="text-align:right">
            <span class="order-status-badge badge-${o.status}">${getStatusLabel(o.status)}</span>
            <div style="font-size:13px;font-weight:700;color:var(--gold-light);margin-top:4px">${formatMoney(o.total || 0, currency)}</div>
          </div>
        </div>`).join('');

  content.innerHTML = `
    <!-- Avatar & Nom -->
    <div style="text-align:center;padding:16px 0 8px">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dark),var(--gold));display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;margin-bottom:12px">${initials}</div>
      <div style="font-size:22px;font-weight:700">${escapeHtml(fullName)}</div>
      <div style="margin-top:6px">${riskBadge}</div>
      
      ${safetyAlertHTML}

      ${client.phone ? `<div style="color:var(--text-secondary);font-size:14px;margin-top:8px"><i class="fas fa-phone" style="color:var(--gold-light)"></i> ${escapeHtml(client.phone)}</div>` : ''}
      ${client.email ? `<div style="color:var(--text-secondary);font-size:13px;margin-top:2px">${escapeHtml(client.email)}</div>` : ''}
      ${client.address ? `<div style="color:var(--text-muted);font-size:12px;margin-top:2px"><i class="fas fa-map-marker-alt" style="color:var(--gold-light)"></i> ${escapeHtml(client.address)}</div>` : ''}
    </div>

    <!-- GPS Block -->
    ${gpsBlock}

    <!-- Détails Jardin -->
    <div class="glass-card" style="margin-bottom:16px;padding:14px">
      <div style="font-size:11px;color:var(--accent-light);text-transform:uppercase;font-weight:700;letter-spacing:1px;margin-bottom:8px">Fiche Technique Jardin</div>
      <div class="detail-row"><span class="detail-label">Plantes / Jardin</span><span class="detail-value" style="font-weight:600">${escapeHtml(client.plantInfo || 'Non précisé')}</span></div>
      <div class="detail-row"><span class="detail-label">Fréquence</span><span class="detail-value">${getFrequencyLabel(client.frequency)}</span></div>
      <div class="detail-row"><span class="detail-label">Jour d'arrosage</span><span class="detail-value" style="color:var(--gold-light);font-weight:600">${escapeHtml(client.wateringDay || 'Non défini')}</span></div>
    </div>

    <!-- Stats client -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="glass-card" style="text-align:center;padding:12px">
        <div style="font-size:24px;font-weight:800;color:var(--gold-light)">${orders.length}</div>
        <div style="font-size:11px;color:var(--text-muted)">Interventions</div>
      </div>
      <div class="glass-card" style="text-align:center;padding:12px">
        <div style="font-size:18px;font-weight:800;color:var(--accent-light)">${formatMoney(totalSpent, currency)}</div>
        <div style="font-size:11px;color:var(--text-muted)">Montant total</div>
      </div>
    </div>

    <!-- Commandes récentes -->
    <div class="detail-section">
      <div class="detail-section-title"><i class="fas fa-calendar-alt"></i> Interventions récentes</div>
      ${ordersHtml}
    </div>

    <!-- Actions -->
    <div class="detail-actions">
      ${client.phone ? `
      <button class="btn-whatsapp btn-full" onclick="sendWateringReminderById(${client.id})">
        <i class="fab fa-whatsapp"></i> Rappel d'arrosage WhatsApp
      </button>` : ''}
      <button class="btn-primary btn-full" onclick="showEditClient(${client.id})">
        <i class="fas fa-edit"></i> Modifier Profil
      </button>
      <button class="btn-primary btn-full" onclick="closeModal('modal-order-detail');showNewOrderForClient(${client.id})">
        <i class="fas fa-plus"></i> Planifier un Passage
      </button>
      <button class="btn-danger btn-full" onclick="confirmDeleteClient(${client.id})">
        <i class="fas fa-trash"></i> Supprimer Client
      </button>
    </div>
  `;

  document.querySelector('#modal-order-detail .modal-header h3').textContent = 'Profil Client & Domicile';
  openModal('modal-order-detail');
}

/* ===================== FORMULAIRE CLIENT ===================== */

function showNewClient() {
  document.getElementById('modal-client-title').textContent = 'Nouveau Client';
  document.getElementById('client-id').value = '';
  document.getElementById('edit-client-firstname').value = '';
  document.getElementById('edit-client-lastname').value = '';
  document.getElementById('edit-client-phone').value = '';
  document.getElementById('edit-client-email').value = '';
  document.getElementById('edit-client-address').value = '';
  document.getElementById('edit-client-risk').value = 'low';
  document.getElementById('edit-client-day').value = 'Lundi';
  document.getElementById('edit-client-frequency').value = 'basique';
  document.getElementById('edit-client-plants').value = '';
  // Reset GPS fields
  document.getElementById('edit-client-lat').value = '';
  document.getElementById('edit-client-lng').value = '';
  updateGPSStatus(null, null);
  openModal('modal-client');
}

async function showEditClient(clientId) {
  const client = await getClient(clientId);
  if (!client) return;

  document.getElementById('modal-client-title').textContent = 'Modifier Client';
  document.getElementById('client-id').value = client.id;
  document.getElementById('edit-client-firstname').value = client.firstname || '';
  document.getElementById('edit-client-lastname').value = client.lastname || '';
  document.getElementById('edit-client-phone').value = client.phone || '';
  document.getElementById('edit-client-email').value = client.email || '';
  document.getElementById('edit-client-address').value = client.address || '';
  
  // Nouveaux champs
  document.getElementById('edit-client-risk').value = client.riskLevel || 'low';
  document.getElementById('edit-client-day').value = client.wateringDay || 'Lundi';
  document.getElementById('edit-client-frequency').value = client.frequency || 'basique';
  document.getElementById('edit-client-plants').value = client.plantInfo || '';

  // GPS
  document.getElementById('edit-client-lat').value = client.latitude || '';
  document.getElementById('edit-client-lng').value = client.longitude || '';
  updateGPSStatus(client.latitude, client.longitude);

  closeModal('modal-order-detail');
  openModal('modal-client');
}

async function saveClient() {
  const firstname = document.getElementById('edit-client-firstname').value.trim();
  const lastname = document.getElementById('edit-client-lastname').value.trim();
  const phone = document.getElementById('edit-client-phone').value.trim();
  const email = document.getElementById('edit-client-email').value.trim();
  const address = document.getElementById('edit-client-address').value.trim();
  
  const riskLevel = document.getElementById('edit-client-risk').value;
  const wateringDay = document.getElementById('edit-client-day').value;
  const frequency = document.getElementById('edit-client-frequency').value;
  const plantInfo = document.getElementById('edit-client-plants').value.trim();
  
  const latVal = document.getElementById('edit-client-lat').value;
  const lngVal = document.getElementById('edit-client-lng').value;
  const latitude = latVal ? parseFloat(latVal) : null;
  const longitude = lngVal ? parseFloat(lngVal) : null;

  const id = document.getElementById('client-id').value;

  if (!firstname && !lastname) {
    showToast('Veuillez entrer un nom', 'error');
    return;
  }

  const clientData = { 
    firstname, 
    lastname, 
    phone, 
    email, 
    address,
    riskLevel,
    wateringDay,
    frequency,
    plantInfo,
    latitude,
    longitude
  };

  if (id) {
    clientData.id = Number(id);
    const existing = await getClient(Number(id));
    clientData.createdAt = existing.createdAt;
    await updateClient(clientData);
    showToast('Client modifié !');
  } else {
    await addClient(clientData);
    showToast('Client ajouté !');
  }

  closeModal('modal-client');
  await loadClients();
}

function confirmDeleteClient(clientId) {
  showConfirm(
    'Supprimer ce client ?',
    'Le client et ses informations d\'arrosage seront supprimés. Les interventions passées seront conservées.',
    async () => {
      await deleteClient(clientId);
      closeModal('modal-order-detail');
      showToast('Client supprimé');
      await loadClients();
    }
  );
}

/* ===================== GÉOLOCALISATION GPS ===================== */

/**
 * Capture la position GPS actuelle et l'associe à un client
 */
function captureClientGPS(clientId) {
  if (!navigator.geolocation) {
    showToast('GPS non disponible sur cet appareil', 'error');
    return;
  }

  showToast('Localisation en cours...', 'success');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      // Si clientId est fourni → sauvegarder directement
      if (clientId) {
        const client = await getClient(clientId);
        if (client) {
          client.latitude = lat;
          client.longitude = lng;
          await updateClient(client);
          showToast(`✅ GPS capturé (±${accuracy}m) !`);
          // Recharger le détail client si ouvert
          await showClientDetail(clientId);
        }
      } else {
        // Mode formulaire : remplir les champs cachés
        document.getElementById('edit-client-lat').value = lat;
        document.getElementById('edit-client-lng').value = lng;
        updateGPSStatus(lat, lng, accuracy);
        showToast(`✅ GPS capturé (±${accuracy}m) !`);
      }
    },
    (error) => {
      let msg = 'Erreur GPS';
      if (error.code === 1) msg = 'Accès GPS refusé. Autorisez la localisation.';
      else if (error.code === 2) msg = 'Position GPS indisponible';
      else if (error.code === 3) msg = 'Délai GPS dépassé, réessayez';
      showToast(msg, 'error');
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

/**
 * Met à jour l'affichage du statut GPS dans le formulaire
 */
function updateGPSStatus(lat, lng, accuracy) {
  const statusEl = document.getElementById('gps-status');
  if (!statusEl) return;

  if (lat && lng) {
    statusEl.innerHTML = `
      <div class="gps-captured">
        <i class="fas fa-map-marker-alt" style="color:var(--success)"></i>
        <span style="color:var(--success)">GPS enregistré${accuracy ? ` (±${accuracy}m)` : ''}</span>
        <span style="color:var(--text-muted);font-size:11px">${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}</span>
      </div>`;
  } else {
    statusEl.innerHTML = `
      <div class="gps-empty">
        <i class="fas fa-map-marker-alt" style="color:var(--text-muted)"></i>
        <span style="color:var(--text-muted)">Aucun GPS enregistré</span>
      </div>`;
  }
}

/**
 * Ouvre Google Maps avec les coordonnées du client
 */
function navigateToClient(lat, lng) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(url, '_blank');
}

/**
 * Ouvre Waze avec les coordonnées du client
 */
function navigateToClientWaze(lat, lng) {
  const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  window.open(url, '_blank');
}

/**
 * Capture GPS depuis le formulaire modal (bouton dans modal-client)
 */
function captureGPSInForm() {
  captureClientGPS(null);
}

/* ===================== ACTIONS RAPIDES ===================== */

function callClient(phone) {
  if (!phone) { showToast('Pas de numéro', 'error'); return; }
  window.location.href = `tel:${phone}`;
}

function whatsappClient(phone) {
  if (!phone) { showToast('Pas de numéro WhatsApp', 'error'); return; }
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').replace('+', '');
  const whatsappUrl = `https://wa.me/${cleaned}`;
  if (window.cordova) {
    window.open(whatsappUrl, '_system');
  } else {
    window.open(whatsappUrl, '_blank');
  }
}

async function sendWateringReminderById(clientId) {
  const client = await getClient(clientId);
  if (!client) return;
  
  const phone = (client.phone || '').replace(/[\s\-\(\)\.]/g, '');
  if (!phone) {
    showToast('Numéro WhatsApp manquant', 'error');
    return;
  }
  
  const fullName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
  const dayStr = client.wateringDay || 'votre jour prévu';
  
  let riskWarning = '';
  if (client.riskLevel === 'high') {
    riskWarning = '\n\n⚠️ *CONSIGNE DE SÉCURITÉ* : Notre zone d\'intervention étant signalée à haut risque, merci de bien vouloir libérer les accès et sécuriser les abords du domicile avant l\'arrivée de nos agents.';
  } else if (client.riskLevel === 'medium') {
    riskWarning = '\n\n⚠️ *CONSIGNE* : Merci de faciliter l\'accès à votre domicile à nos agents.';
  }

  const message = `
🌱 *ST-PRO SERVICES*
━━━━━━━━━━━━━━━━━━━
Bonjour *${fullName}* 👋

Nous vous rappelons que le passage de notre équipe pour l'arrosage et l'entretien de votre jardin est prévu pour *${dayStr}*.

Formule : ${getFrequencyLabel(client.frequency)}
Jardin : ${client.plantInfo || 'Espaces verts'}
${riskWarning}
━━━━━━━━━━━━━━━━━━━
Merci de votre confiance ! 🙏
  `.trim();

  const encoded = encodeURIComponent(message);
  let formattedPhone = phone.replace('+', '');
  
  const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encoded}`;
  if (window.cordova) {
    window.open(whatsappUrl, '_system');
  } else {
    window.open(whatsappUrl, '_blank');
  }
  showToast('WhatsApp ouvert avec le rappel !');
}

async function showNewOrderForClient(clientId) {
  const client = await getClient(clientId);
  if (!client) return;
  await showNewOrder();
  // Pré-sélectionner le client
  setTimeout(() => selectClientForOrder(client), 100);
}

function searchClients(query) {
  loadClients(query);
}

/* ===================== LOGIQUE GPS DANS LES FORMULAIRES DE COMMANDES/CONTRATS ===================== */

/** Capturer la position pour une intervention */
function captureGPSForOrder() {
  if (!navigator.geolocation) {
    showToast('GPS non disponible', 'error');
    return;
  }
  showToast('Localisation en cours...', 'success');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      document.getElementById('order-client-lat').value = lat;
      document.getElementById('order-client-lng').value = lng;

      // Si un client existant est sélectionné
      if (selectedClientForOrder) {
        selectedClientForOrder.latitude = lat;
        selectedClientForOrder.longitude = lng;
        await updateClient(selectedClientForOrder);
        loadClients();
        loadDashboard();
      }

      updateOrderGPSStatus(lat, lng, accuracy);
      showToast(`✅ GPS capturé (±${accuracy}m) !`);
    },
    (error) => {
      showToast('Erreur de capture GPS', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/** Capturer la position pour un contrat */
function captureGPSForContract() {
  if (!navigator.geolocation) {
    showToast('GPS non disponible', 'error');
    return;
  }
  showToast('Localisation en cours...', 'success');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      document.getElementById('contract-client-lat').value = lat;
      document.getElementById('contract-client-lng').value = lng;

      // Si un client existant est sélectionné
      if (selectedClientForContract) {
        selectedClientForContract.latitude = lat;
        selectedClientForContract.longitude = lng;
        await updateClient(selectedClientForContract);
        loadClients();
        loadDashboard();
      }

      updateContractGPSStatus(lat, lng, accuracy);
      showToast(`✅ GPS capturé (±${accuracy}m) !`);
    },
    (error) => {
      showToast('Erreur de capture GPS', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/** Met à jour le status GPS de l'intervention */
function updateOrderGPSStatus(lat, lng, accuracy) {
  const statusEl = document.getElementById('order-gps-status');
  const viewBtn = document.getElementById('btn-order-gps-view');
  if (!statusEl) return;

  if (lat && lng) {
    statusEl.innerHTML = `
      <div class="gps-captured" style="font-size:12px; display:flex; flex-direction:column; gap:2px">
        <span style="color:var(--success); font-weight:600"><i class="fas fa-check-circle"></i> GPS enregistré ${accuracy ? `(±${accuracy}m)` : ''}</span>
        <span style="color:var(--text-secondary); font-family:monospace; font-size:11px">${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}</span>
      </div>`;
    if (viewBtn) viewBtn.classList.remove('hidden');
  } else {
    statusEl.innerHTML = `
      <div class="gps-empty">
        <i class="fas fa-map-marker-alt" style="color:var(--text-muted); font-size:12px"></i>
        <span style="color:var(--text-muted); font-size:12px">Aucune position GPS</span>
      </div>`;
    if (viewBtn) viewBtn.classList.add('hidden');
  }
}

/** Met à jour le status GPS du contrat */
function updateContractGPSStatus(lat, lng, accuracy) {
  const statusEl = document.getElementById('contract-gps-status');
  const viewBtn = document.getElementById('btn-contract-gps-view');
  if (!statusEl) return;

  if (lat && lng) {
    statusEl.innerHTML = `
      <div class="gps-captured" style="font-size:12px; display:flex; flex-direction:column; gap:2px">
        <span style="color:var(--success); font-weight:600"><i class="fas fa-check-circle"></i> GPS enregistré ${accuracy ? `(±${accuracy}m)` : ''}</span>
        <span style="color:var(--text-secondary); font-family:monospace; font-size:11px">${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}</span>
      </div>`;
    if (viewBtn) viewBtn.classList.remove('hidden');
  } else {
    statusEl.innerHTML = `
      <div class="gps-empty">
        <i class="fas fa-map-marker-alt" style="color:var(--text-muted); font-size:12px"></i>
        <span style="color:var(--text-muted); font-size:12px">Aucune position GPS</span>
      </div>`;
    if (viewBtn) viewBtn.classList.add('hidden');
  }
}

/** Ouvrir itinéraire GPS depuis commande */
function openOrderGPSRoute() {
  const lat = document.getElementById('order-client-lat').value;
  const lng = document.getElementById('order-client-lng').value;
  if (lat && lng) navigateToClient(parseFloat(lat), parseFloat(lng));
}

/** Ouvrir itinéraire GPS depuis contrat */
function openContractGPSRoute() {
  const lat = document.getElementById('contract-client-lat').value;
  const lng = document.getElementById('contract-client-lng').value;
  if (lat && lng) navigateToClient(parseFloat(lat), parseFloat(lng));
}

/** Capture GPS directement depuis la vue d'intervention */
async function captureGPSFromOrderDetail(orderId, clientId) {
  if (!clientId) {
    showToast("Veuillez d'abord enregistrer le client", 'error');
    return;
  }
  if (!navigator.geolocation) {
    showToast('GPS non disponible', 'error');
    return;
  }
  showToast('Localisation en cours...', 'success');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      const client = await getClient(clientId);
      if (client) {
        client.latitude = lat;
        client.longitude = lng;
        await updateClient(client);
        
        // Mettre à jour l'intervention pour inclure les infos du client mis à jour si nécessaire
        const order = await getOrder(orderId);
        if (order) {
          order.clientSnapshot = client;
          await updateOrder(order);
        }

        showToast(`✅ GPS enregistré (${accuracy}m) !`);
        closeModal('modal-order-detail');
        showOrderDetail(orderId);
        loadClients();
        loadDashboard();
      }
    },
    (error) => {
      showToast('Erreur GPS', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/** Capture GPS directement depuis la vue de contrat */
async function captureGPSFromContractDetail(contractId, clientId) {
  if (!clientId) {
    showToast('Client non spécifié', 'error');
    return;
  }
  if (!navigator.geolocation) {
    showToast('GPS non disponible', 'error');
    return;
  }
  showToast('Localisation en cours...', 'success');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      const client = await getClient(clientId);
      if (client) {
        client.latitude = lat;
        client.longitude = lng;
        await updateClient(client);
        
        const contract = await getContract(contractId);
        if (contract) {
          contract.clientSnapshot = client;
          await updateContract(contract);
        }

        showToast(`✅ GPS enregistré (${accuracy}m) !`);
        closeModal('modal-contract-detail');
        showContractDetail(contractId);
        loadClients();
        loadDashboard();
      }
    },
    (error) => {
      showToast('Erreur GPS', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

