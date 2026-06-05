/* ===================================================
   map.js — Logique de la Carte de Géolocalisation Leaflet
   =================================================== */

let mapInstance = null;
let mapMarkers = [];
let currentMapFilter = 'all'; // 'all' | 'today'
let mapSearchQuery = '';

// Position par défaut : Niamey, Niger
const DEFAULT_LAT = 13.5116;
const DEFAULT_LNG = 2.1254;
const DEFAULT_ZOOM = 13;

/** Initialise la page de la carte */
async function initMapPage() {
  if (typeof L === 'undefined') {
    showToast("Erreur : Leaflet n'est pas chargé.", 'error');
    return;
  }

  // Attendre que le conteneur soit visible dans le DOM pour initialiser la carte correctement
  setTimeout(async () => {
    const container = document.getElementById('leaflet-map-container');
    if (!container) return;

    if (!mapInstance) {
      // Créer la carte avec le thème sombre CartoDB Dark Matter
      mapInstance = L.map('leaflet-map-container', {
        zoomControl: true,
        tap: false // Évite certains bugs tactiles sur mobile
      }).setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
      }).addTo(mapInstance);
    }

    // Force Leaflet à recalculer sa taille d'affichage (crucial pour le mode PWA/SPA)
    mapInstance.invalidateSize();

    // Recharger les marqueurs
    await loadMapMarkers();
  }, 150);
}

/** Charge les marqueurs sur la carte en fonction du filtre et de la recherche */
async function loadMapMarkers() {
  if (!mapInstance) return;

  // Effacer les anciens marqueurs
  mapMarkers.forEach(marker => mapInstance.removeLayer(marker));
  mapMarkers = [];

  const clients = await getAllClients();
  const orders = await getAllOrders();
  const settings = await getAllSettings();
  const currency = settings.currency || 'FCFA';

  const todayStr = new Date().toISOString().split('T')[0];

  if (currentMapFilter === 'all') {
    // ---- FILTRE : TOUS LES CLIENTS ----
    let filteredClients = clients.filter(c => c.latitude && c.longitude);

    // Filtrer par recherche
    if (mapSearchQuery.trim()) {
      const q = mapSearchQuery.toLowerCase();
      filteredClients = filteredClients.filter(c =>
        `${c.firstname} ${c.lastname}`.toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }

    // Plotter les clients
    filteredClients.forEach(client => {
      let markerClass = 'marker-risk-low';
      let iconHTML = '<i class="fas fa-home"></i>';

      if (client.riskLevel === 'high') {
        markerClass = 'marker-risk-high';
        iconHTML = '<i class="fas fa-exclamation-triangle"></i>';
      } else if (client.riskLevel === 'medium') {
        markerClass = 'marker-risk-medium';
        iconHTML = '<i class="fas fa-exclamation-circle"></i>';
      }

      const customIcon = L.divIcon({
        html: `<div class="map-custom-marker ${markerClass}">${iconHTML}</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([client.latitude, client.longitude], { icon: customIcon });

      // Popup content
      const fullName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
      const riskBadge = client.riskLevel === 'high' ? '⚠️ Foyer Dangereux' : client.riskLevel === 'medium' ? '⚠️ Zone Sensible' : 'Zone Sécurisée';
      const riskBadgeColor = client.riskLevel === 'high' ? '#ef4444' : client.riskLevel === 'medium' ? '#f59e0b' : '#2ecc71';

      const popupHTML = `
        <div class="map-popup-container">
          <div class="map-popup-title">
            <i class="fas fa-user-circle" style="color:var(--gold-light)"></i>
            <span>${escapeHtml(fullName)}</span>
          </div>
          <div style="font-size:10px; font-weight:700; color:${riskBadgeColor}; margin-bottom:6px">${riskBadge}</div>
          <div class="map-popup-info">
            <strong>📞 Tél:</strong> ${escapeHtml(client.phone || '—')}<br>
            <strong>📍 Domicile:</strong> ${escapeHtml(client.address || 'Non spécifié')}<br>
            <strong>🌱 Plantes:</strong> ${escapeHtml(client.plantInfo || 'Non précisé')}<br>
            <strong>📅 Passage:</strong> ${escapeHtml(client.wateringDay || 'Non défini')} (${escapeHtml(client.frequency || 'N/A')})
          </div>
          <div class="map-popup-actions">
            <button class="map-popup-btn map-popup-btn-primary" onclick="navigateToClient(${client.latitude}, ${client.longitude})">
              <i class="fas fa-route"></i> Google Maps
            </button>
            <button class="map-popup-btn map-popup-btn-secondary" onclick="navigateToClientWaze(${client.latitude}, ${client.longitude})">
              Waze
            </button>
          </div>
          <div class="map-popup-actions" style="margin-top:4px">
            <button class="map-popup-btn map-popup-btn-secondary" onclick="callClient('${escapeHtml(client.phone)}')">
              <i class="fas fa-phone"></i> Appeler
            </button>
            <button class="map-popup-btn map-popup-btn-whatsapp" onclick="sendWateringReminderById(${client.id})">
              <i class="fab fa-whatsapp"></i> Rappel
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHTML);
      marker.addTo(mapInstance);
      mapMarkers.push(marker);
    });

  } else if (currentMapFilter === 'today') {
    // ---- FILTRE : PASSAGES DU JOUR ----
    // Récupérer les interventions d'aujourd'hui
    const todayOrders = orders.filter(o => 
      o.pickupDate === todayStr && 
      o.status !== 'cancelled'
    );

    // Lier les coordonnées des clients
    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c);

    let plottedOrders = todayOrders.map(o => {
      const client = clientMap[o.clientId] || o.clientSnapshot || {};
      return {
        order: o,
        client: client,
        lat: client.latitude || o.clientSnapshot?.latitude,
        lng: client.longitude || o.clientSnapshot?.longitude
      };
    }).filter(item => item.lat && item.lng);

    // Filtrer par recherche
    if (mapSearchQuery.trim()) {
      const q = mapSearchQuery.toLowerCase();
      plottedOrders = plottedOrders.filter(item =>
        `${item.client.firstname} ${item.client.lastname}`.toLowerCase().includes(q) ||
        (item.client.address || '').toLowerCase().includes(q) ||
        (item.order.ref || '').toLowerCase().includes(q)
      );
    }

    // Plotter les interventions d'aujourd'hui
    plottedOrders.forEach(item => {
      const { order, client, lat, lng } = item;
      const fullName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';

      let iconClass = 'marker-intervention-today';
      let iconHTML = '<i class="fas fa-tint"></i>'; // goutte par défaut

      if (order.status === 'ready') {
        iconHTML = '<i class="fas fa-check-circle"></i>'; // fait
      } else if (order.status === 'delivered') {
        iconHTML = '<i class="fas fa-file-invoice-dollar"></i>'; // payé
      }

      const customIcon = L.divIcon({
        html: `<div class="map-custom-marker ${iconClass}">${iconHTML}</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const statusBadge = getStatusLabel(order.status);
      const itemsList = (order.articles || []).map(a => `• ${escapeHtml(a.name)}`).join('<br>');

      const popupHTML = `
        <div class="map-popup-container">
          <div class="map-popup-title" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom:4px; margin-bottom:6px">
            <span style="font-size:11px; background:var(--accent); color:#fff; padding:2px 6px; border-radius:4px; font-weight:700">JOUR J</span>
            <span style="font-weight:700">${escapeHtml(fullName)}</span>
          </div>
          <div class="map-popup-info">
            <strong>📋 Réf:</strong> ${escapeHtml(order.ref || '—')}<br>
            <strong>⚡ Statut:</strong> ${escapeHtml(statusBadge)}<br>
            <strong>💰 Montant:</strong> ${formatMoney(order.total || 0, currency)}<br>
            <strong>🛠️ Prestations:</strong><br><span style="color:var(--text-muted)">${itemsList}</span>
          </div>
          <div class="map-popup-actions">
            <button class="map-popup-btn map-popup-btn-primary" onclick="navigateToClient(${lat}, ${lng})">
              <i class="fas fa-route"></i> Itinéraire
            </button>
            <button class="map-popup-btn map-popup-btn-secondary" onclick="closeMapAndShowOrder(${order.id})">
              <i class="fas fa-eye"></i> Ouvrir
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHTML);
      marker.addTo(mapInstance);
      mapMarkers.push(marker);
    });
  }

  // Ajuster le niveau de zoom pour englober tous les marqueurs
  if (mapMarkers.length > 0) {
    const group = new L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.15));
  } else {
    // Si pas de marqueur, recentrer sur la vue par défaut
    mapInstance.setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);
  }
}

/** Filtre les marqueurs par type */
async function filterMapMarkers(type) {
  currentMapFilter = type;

  // Gérer la classe active sur les boutons
  document.querySelectorAll('#map-filter-tabs .filter-tab').forEach(btn => {
    btn.classList.remove('active');
  });

  const activeBtn = document.getElementById(`btn-map-filter-${type}`);
  if (activeBtn) activeBtn.classList.add('active');

  await loadMapMarkers();
}

/** Gère la recherche textuelle sur la carte */
async function searchMapClients(query) {
  mapSearchQuery = query;
  await loadMapMarkers();
}

/** Ferme le modal de la carte et ouvre le détail d'une intervention */
function closeMapAndShowOrder(orderId) {
  // Simuler le clic du bouton back / accueil pour quitter la carte
  goBack();
  setTimeout(() => {
    showOrderDetail(orderId);
  }, 300);
}
