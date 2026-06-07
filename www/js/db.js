/* ===================================================
   db.js — Gestion IndexedDB (Base de données locale)
   =================================================== */

const DB_NAME = 'STProDB';
const DB_VERSION = 2; // Incrémenté pour ajouter le store contracts
let db = null;

const STORES = {
  clients: 'clients',
  orders: 'orders',
  settings: 'settings',
  tarifs: 'tarifs',
  contracts: 'contracts'
};

/** Initialise la base de données */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Store Clients
      if (!database.objectStoreNames.contains(STORES.clients)) {
        const clientStore = database.createObjectStore(STORES.clients, {
          keyPath: 'id',
          autoIncrement: true
        });
        clientStore.createIndex('phone', 'phone', { unique: false });
        clientStore.createIndex('name', 'lastname', { unique: false });
        clientStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store Orders
      if (!database.objectStoreNames.contains(STORES.orders)) {
        const orderStore = database.createObjectStore(STORES.orders, {
          keyPath: 'id',
          autoIncrement: true
        });
        orderStore.createIndex('clientId', 'clientId', { unique: false });
        orderStore.createIndex('status', 'status', { unique: false });
        orderStore.createIndex('arrivalDate', 'arrivalDate', { unique: false });
        orderStore.createIndex('pickupDate', 'pickupDate', { unique: false });
        orderStore.createIndex('createdAt', 'createdAt', { unique: false });
        orderStore.createIndex('ref', 'ref', { unique: true });
        orderStore.createIndex('contractId', 'contractId', { unique: false });
      } else {
        // Ajouter l'index contractId si la version est mise à jour
        const tx = event.target.transaction;
        const orderStore = tx.objectStore(STORES.orders);
        if (!orderStore.indexNames.contains('contractId')) {
          orderStore.createIndex('contractId', 'contractId', { unique: false });
        }
      }

      // Store Settings
      if (!database.objectStoreNames.contains(STORES.settings)) {
        database.createObjectStore(STORES.settings, { keyPath: 'key' });
      }

      // Store Tarifs
      if (!database.objectStoreNames.contains(STORES.tarifs)) {
        database.createObjectStore(STORES.tarifs, {
          keyPath: 'id',
          autoIncrement: true
        });
      }

      // Store Contracts (NOUVEAU)
      if (!database.objectStoreNames.contains(STORES.contracts)) {
        const contractStore = database.createObjectStore(STORES.contracts, {
          keyPath: 'id',
          autoIncrement: true
        });
        contractStore.createIndex('clientId', 'clientId', { unique: false });
        contractStore.createIndex('status', 'status', { unique: false });
        contractStore.createIndex('startDate', 'startDate', { unique: false });
        contractStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/** Génère une référence de commande unique */
function generateRef() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ST${year}${month}${day}-${rand}`;
}

/** Génère une référence de contrat unique */
function generateContractRef() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CTR${year}${month}-${rand}`;
}

/* ---- CLIENTS ---- */

function addClient(client) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.clients, 'readwrite');
    const store = tx.objectStore(STORES.clients);
    client.createdAt = new Date().toISOString();
    client.updatedAt = new Date().toISOString();
    const req = store.add(client);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function updateClient(client) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.clients, 'readwrite');
    const store = tx.objectStore(STORES.clients);
    client.updatedAt = new Date().toISOString();
    const req = store.put(client);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getClient(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.clients, 'readonly');
    const store = tx.objectStore(STORES.clients);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllClients() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.clients, 'readonly');
    const store = tx.objectStore(STORES.clients);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteClient(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.clients, 'readwrite');
    const store = tx.objectStore(STORES.clients);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function searchClientsByQuery(query) {
  return new Promise(async (resolve) => {
    const all = await getAllClients();
    const q = query.toLowerCase();
    const results = all.filter(c =>
      (c.firstname + ' ' + c.lastname).toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.lastname.toLowerCase().includes(q) ||
      c.firstname.toLowerCase().includes(q)
    );
    resolve(results);
  });
}

/* ---- ORDERS ---- */

function addOrder(order) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.orders, 'readwrite');
    const store = tx.objectStore(STORES.orders);
    order.ref = generateRef();
    order.createdAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    if (!order.status) order.status = 'processing';
    const req = store.add(order);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function updateOrder(order) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.orders, 'readwrite');
    const store = tx.objectStore(STORES.orders);
    order.updatedAt = new Date().toISOString();
    const req = store.put(order);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getOrder(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.orders, 'readonly');
    const store = tx.objectStore(STORES.orders);
    const req = store.get(Number(id));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllOrders() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.orders, 'readonly');
    const store = tx.objectStore(STORES.orders);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

function deleteOrder(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.orders, 'readwrite');
    const store = tx.objectStore(STORES.orders);
    const req = store.delete(Number(id));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getOrdersByClient(clientId) {
  return new Promise(async (resolve) => {
    const all = await getAllOrders();
    resolve(all.filter(o => o.clientId === clientId));
  });
}

function getOrdersByContract(contractId) {
  return new Promise(async (resolve) => {
    const all = await getAllOrders();
    resolve(all.filter(o => o.contractId === contractId));
  });
}

/* ---- CONTRACTS ---- */

function addContract(contract) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.contracts, 'readwrite');
    const store = tx.objectStore(STORES.contracts);
    contract.ref = generateContractRef();
    contract.createdAt = new Date().toISOString();
    contract.updatedAt = new Date().toISOString();
    if (!contract.status) contract.status = 'active';
    const req = store.add(contract);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function updateContract(contract) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.contracts, 'readwrite');
    const store = tx.objectStore(STORES.contracts);
    contract.updatedAt = new Date().toISOString();
    const req = store.put(contract);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getContract(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.contracts, 'readonly');
    const store = tx.objectStore(STORES.contracts);
    const req = store.get(Number(id));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllContracts() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.contracts, 'readonly');
    const store = tx.objectStore(STORES.contracts);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

function deleteContract(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.contracts, 'readwrite');
    const store = tx.objectStore(STORES.contracts);
    const req = store.delete(Number(id));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ---- SETTINGS ---- */

function getSetting(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.settings, 'readonly');
    const store = tx.objectStore(STORES.settings);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.settings, 'readwrite');
    const store = tx.objectStore(STORES.settings);
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getAllSettings() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.settings, 'readonly');
    const store = tx.objectStore(STORES.settings);
    const req = store.getAll();
    req.onsuccess = () => {
      const result = {};
      req.result.forEach(s => result[s.key] = s.value);
      resolve(result);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---- TARIFS ---- */

function getAllTarifs() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.tarifs, 'readonly');
    const store = tx.objectStore(STORES.tarifs);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function clearAndSaveTarifs(tarifs) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.tarifs, 'readwrite');
    const store = tx.objectStore(STORES.tarifs);
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      let count = 0;
      if (tarifs.length === 0) { resolve(); return; }
      tarifs.forEach(t => {
        const req = store.add(t);
        req.onsuccess = () => { count++; if (count === tarifs.length) resolve(); };
        req.onerror = () => reject(req.error);
      });
    };
    clearReq.onerror = () => reject(clearReq.error);
  });
}

/* ---- CLEAR ALL ---- */

function clearAllData() {
  return new Promise((resolve, reject) => {
    const stores = [STORES.clients, STORES.orders, STORES.settings, STORES.tarifs, STORES.contracts];
    let count = 0;
    stores.forEach(storeName => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => { count++; if (count === stores.length) resolve(); };
      req.onerror = () => reject(req.error);
    });
  });
}

/* ---- Default Tarifs — ST-PRO Pressing ---- */
const DEFAULT_TARIFS = [
  { name: 'Chemise (Lavage + Repassage)', price: 1000 },
  { name: 'Pantalon (Lavage + Repassage)', price: 1000 },
  { name: 'Veste / Blouson (Nettoyage à sec)', price: 1500 },
  { name: 'Costume 2 Pièces (Nettoyage à sec)', price: 2500 },
  { name: 'Robe Simple (Lavage + Repassage)', price: 1500 },
  { name: 'Robe de soirée / Pagne (Lavage + Repassage)', price: 2500 },
  { name: 'Drap de lit 2 places (Lavage)', price: 1500 },
  { name: 'Couette / Couverture (Lavage)', price: 3000 },
  { name: 'T-shirt / Polo (Lavage + Repassage)', price: 800 },
  { name: 'Repassage simple (par habit)', price: 500 },
  { name: 'Abonnement Mensuel (30 habits)', price: 22000 }
];

/* ---- Helpers dates ---- */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addWeeks(dateStr, weeks) {
  return addDays(dateStr, weeks * 7);
}

/**
 * Génère les dates d'intervention selon une fréquence
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 * @param {string} frequency - 'weekly' | 'biweekly' | 'monthly' | 'twice_monthly'
 * @param {number[]} weekDays - jours de la semaine (0=dim, 1=lun...6=sam) si applicable
 * @returns {string[]} liste de dates YYYY-MM-DD
 */
function generateInterventionDates(startDate, endDate, frequency, weekDays = []) {
  const dates = [];
  let current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  if (frequency === 'weekly') {
    // Chaque semaine, même jour que le startDate
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 7);
    }
  } else if (frequency === 'biweekly') {
    // Toutes les 2 semaines
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 14);
    }
  } else if (frequency === 'twice_monthly') {
    // 2 fois par mois : le jour de début, et 15 jours après
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      const second = new Date(current);
      second.setDate(second.getDate() + 15);
      if (second <= end) {
        dates.push(second.toISOString().split('T')[0]);
      }
      current.setMonth(current.getMonth() + 1);
    }
  } else if (frequency === 'monthly') {
    // 1 fois par mois, même jour
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setMonth(current.getMonth() + 1);
    }
  }

  // Supprimer les doublons et trier
  return [...new Set(dates)].sort();
}
