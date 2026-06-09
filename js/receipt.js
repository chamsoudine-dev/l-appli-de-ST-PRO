/* ===================================================
   receipt.js — Génération de reçus professionnels ST-PRO Jardin & Pots
   =================================================== */

let currentReceiptOrder = null;
let currentReceiptClient = null;

/** Affiche le modal de reçu pour une commande (intervention) */
async function showReceipt(orderId) {
  const order = await getOrder(Number(orderId));
  if (!order) return;

  let client = null;
  if (order.clientId) {
    client = await getClient(order.clientId);
  } else {
    client = order.clientSnapshot || {};
  }

  const settings = await getAllSettings();
  currentReceiptOrder = order;
  currentReceiptClient = client;

  const currency = settings.currency || 'FCFA';
  const businessName = settings.businessName || 'ST-PRO';
  const businessAddress = settings.businessAddress || 'Niamey, Niger';
  const businessPhone = settings.businessPhone || '+227 76 75 74 68 / 91 99 04 66';
  const businessEmail = settings.businessEmail || 'stpro8481@gmail.com';
  const footerMsg = settings.footerMessage || 'ST-PRO — Un cadre vert, propre et harmonieux valorise votre maison.';

  const receiptHTML = buildReceiptHTML(order, client, {
    currency, businessName, businessAddress,
    businessPhone, businessEmail, footerMsg
  });

  document.getElementById('receipt-container').innerHTML = receiptHTML;

  // Mettre le bon numéro WhatsApp
  const phone = (client && client.phone) ? client.phone : null;
  document.getElementById('btn-send-whatsapp').dataset.phone = phone || '';
  document.getElementById('btn-send-whatsapp').dataset.orderId = order.id;

  openModal('modal-receipt');
}

/** Construit le HTML du reçu */
function buildReceiptHTML(order, client, settings) {
  const { currency, businessName, businessAddress, businessPhone, businessEmail, footerMsg } = settings;

  const clientName = client
    ? `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client'
    : 'Client';
  const clientPhone = client ? (client.phone || '—') : '—';

  const arrivalDate = order.arrivalDate ? formatDate(order.arrivalDate) : '—';
  const pickupDate = order.pickupDate ? formatDate(order.pickupDate) : '—';
  const createdAt = order.createdAt ? formatDateTime(order.createdAt) : '—';

  // Articles (prestations) rows
  let articlesRows = '';
  (order.articles || []).forEach(art => {
    const lineTotal = (art.qty || 1) * (art.price || 0);
    articlesRows += `
      <tr>
        <td>${escapeHtml(art.name)}</td>
        <td style="text-align:center">${art.qty || 1}</td>
        <td style="text-align:right">${formatMoney(art.price || 0, currency)}</td>
        <td style="text-align:right">${formatMoney(lineTotal, currency)}</td>
      </tr>`;
  });

  const subtotal = order.subtotal || 0;
  const discount = order.discount || 0;
  const deliveryFee = order.deliveryFee || 0;
  const total = order.total || 0;

  let discountRow = '';
  if (discount > 0) {
    discountRow = `
      <tr>
        <td colspan="3" style="text-align:right;color:#e53e3e">Remise (${discount}%)</td>
        <td style="text-align:right;color:#e53e3e">- ${formatMoney(subtotal * discount / 100, currency)}</td>
      </tr>`;
  }

  let deliveryRow = '';
  if (deliveryFee > 0) {
    deliveryRow = `
      <tr>
        <td colspan="3" style="text-align:right">Frais de déplacement</td>
        <td style="text-align:right">${formatMoney(deliveryFee, currency)}</td>
      </tr>`;
  }

  const statusLabel = getStatusLabel(order.status);
  const statusColor = getStatusColor(order.status);

  const deliveryBadge = order.delivery
    ? `<span class="receipt-delivery-badge">🌿 Intervention à domicile : ${escapeHtml(order.deliveryAddress || 'Adresse du client')}</span>`
    : '';

  const contactLine = [businessPhone, businessEmail].filter(Boolean).join(' | ');

  return `
    <div class="receipt-paper" id="receipt-to-print">
      <!-- HEADER -->
      <div class="receipt-header" style="background: linear-gradient(135deg, #0284c7, #070e1a); color: #fff; padding: 20px; text-align: center;">
        <div class="receipt-logo-icon" style="font-size:36px;margin-bottom:6px">🌿</div>
        <div class="receipt-business-name" style="font-size: 24px; font-weight: 800; color: #38bdf8; letter-spacing: 1px;">${escapeHtml(businessName)}</div>
        <div class="receipt-business-sub" style="font-size: 11px; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 2px;">Entretien Professionnel de Jardins &amp; Pots</div>
        
        <!-- Identifiants ST-PRO -->
        <div style="font-size:9px;color:rgba(255,255,255,0.55);margin-top:6px;font-family:monospace">
          NIF: 141576 /P &nbsp;|&nbsp; RCCM: NE/NIM/01/2025/A10/02064
        </div>

        ${businessAddress ? `<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;position:relative">${escapeHtml(businessAddress)}</div>` : ''}
        ${contactLine ? `<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;position:relative">${escapeHtml(contactLine)}</div>` : ''}
      </div>

      <!-- REFERENCE BANNER -->
      <div class="receipt-ref-banner" style="background: linear-gradient(135deg, #0284c7, #0369a1); padding: 10px 20px; display: flex; justify-content: space-between; align-items: center;">
        <span>INTERVENTION N° ${order.ref || '—'}</span>
        <span>${createdAt}</span>
        <span style="background:${statusColor};padding:2px 10px;border-radius:20px;font-size:11px">${statusLabel}</span>
      </div>

      <!-- BODY -->
      <div class="receipt-body">

        <!-- Client -->
        <div class="receipt-section">
          <div class="receipt-section-title">👤 Client</div>
          <div class="receipt-info-row">
            <span>Nom complet</span>
            <strong>${escapeHtml(clientName)}</strong>
          </div>
          <div class="receipt-info-row">
            <span>Téléphone</span>
            <strong>${escapeHtml(clientPhone)}</strong>
          </div>
          ${client && client.address ? `<div class="receipt-info-row"><span>Adresse</span><strong>${escapeHtml(client.address)}</strong></div>` : ''}
          ${deliveryBadge}
        </div>

        <!-- Planification -->
        <div class="receipt-section">
          <div class="receipt-section-title">📅 Dates d'intervention</div>
          <div class="receipt-info-row">
            <span>Date de planification</span>
            <strong>${arrivalDate}</strong>
          </div>
          <div class="receipt-info-row">
            <span>Date d'intervention</span>
            <strong style="color:var(--accent)">${pickupDate}</strong>
          </div>
        </div>

        <!-- Articles (Prestations) -->
        <div class="receipt-section">
          <div class="receipt-section-title">🌿 Prestations & Services</div>
          <table class="receipt-table">
            <thead>
              <tr>
                <th>Prestation / Service</th>
                <th style="text-align:center">Qté</th>
                <th style="text-align:right">P.U.</th>
                <th style="text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>${articlesRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="text-align:right;color:#666">Sous-total</td>
                <td style="text-align:right;font-weight:600">${formatMoney(subtotal, currency)}</td>
              </tr>
              ${discountRow}
              ${deliveryRow}
              <tr class="total-row-final">
                <td colspan="3" style="text-align:right">TOTAL NET</td>
                <td style="text-align:right">${formatMoney(total, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${order.notes ? `
        <div class="receipt-section">
          <div class="receipt-section-title">📝 Consignes d'entretien</div>
          <div style="font-size:13px;color:#555;font-style:italic">${escapeHtml(order.notes)}</div>
        </div>` : ''}

      </div>

      <!-- FOOTER -->
      <div class="receipt-footer">
        <div class="receipt-footer-text">Merci de votre confiance !</div>
        <div class="receipt-footer-msg">${escapeHtml(footerMsg)}</div>
        ${businessPhone ? `<div style="font-size:11px;color:#999;margin-top:6px">📞 ${escapeHtml(businessPhone)}</div>` : ''}
      </div>

      <!-- BOTTOM STRIP -->
      <div class="receipt-qr-strip">
        <span>✦ ${escapeHtml(businessName)} ✦ Services Techniques Professionnels ✦</span>
      </div>
    </div>`;
}

/** Envoi du reçu via WhatsApp */
async function sendReceiptWhatsApp() {
  if (!currentReceiptOrder || !currentReceiptClient) {
    showToast('Aucune intervention sélectionnée', 'error');
    return;
  }

  const order = currentReceiptOrder;
  const client = currentReceiptClient;
  const settings = await getAllSettings();

  const currency = settings.currency || 'FCFA';
  const businessName = settings.businessName || 'ST-PRO';
  const businessPhone = settings.businessPhone || '';

  const clientName = `${client.firstname || ''} ${client.lastname || ''}`.trim() || 'Client';
  const phone = (client.phone || '').replace(/[\s\-\(\)\.]/g, '');

  if (!phone) {
    showToast('Numéro de téléphone manquant', 'error');
    return;
  }

  const receiptEl = document.getElementById('receipt-to-print');
  if (!receiptEl) {
    showToast('Impossible de trouver le reçu à capturer', 'error');
    return;
  }

  showToast('Génération de l\'image du reçu...', 'info');

  try {
    // Rendre l'élément HTML en image canvas
    const canvas = await html2canvas(receiptEl, {
      useCORS: true,
      scale: 2, // Augmente la résolution pour plus de netteté
      backgroundColor: '#ffffff',
      logging: false
    });

    canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast('Erreur lors de la création de l\'image', 'error');
        return;
      }

      const fileName = `Recu-${order.ref || order.id}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // 1. Essayer l'API de partage Web Share (principalement sur mobile)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Reçu ${order.ref}`,
            text: `Bonjour ${clientName}, voici le reçu pour l'intervention ${order.ref}.`
          });
          showToast('Reçu envoyé avec succès !');
          return;
        } catch (shareErr) {
          console.log('Partage direct annulé ou non pris en charge:', shareErr);
          // Continuer vers la méthode de secours
        }
      }

      // 2. Méthode de secours : Copier dans le presse-papiers + Téléchargement + WhatsApp
      let copiedToClipboard = false;
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          const clipboardItem = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([clipboardItem]);
          copiedToClipboard = true;
        } catch (clipErr) {
          console.warn('Impossible de copier dans le presse-papiers:', clipErr);
        }
      }

      // Déclencher le téléchargement automatique du fichier image
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      // Préparer le message WhatsApp d'accompagnement
      const message = `
🌿 *${businessName} JARDIN & POTS*
━━━━━━━━━━━━━━━━━━━
Bonjour *${clientName}* 👋

Voici le reçu de votre intervention *N° ${order.ref}*.

${copiedToClipboard ? '📋 *L\'image du reçu a été copiée dans votre presse-papiers.* Vous pouvez la coller directement ici (Ctrl+V ou appui long > Coller).' : '💾 *L\'image du reçu a été téléchargée sur votre appareil.* Vous pouvez la joindre à cette discussion.'}

💰 *Montant Total :* ${formatMoney(order.total || 0, currency)}
📅 *Date d\'intervention :* ${order.pickupDate ? formatDate(order.pickupDate) : '—'}
━━━━━━━━━━━━━━━━━━━
Merci de votre confiance ! 🙏
`.trim();

      const encodedMessage = encodeURIComponent(message);
      const formattedPhone = phone.replace('+', '');
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

      if (window.cordova) {
        window.open(whatsappUrl, '_system');
      } else {
        window.open(whatsappUrl, '_blank');
      }

      if (copiedToClipboard) {
        showToast('Image copiée & téléchargée. Veuillez la coller sur WhatsApp !');
      } else {
        showToast('Reçu téléchargé. Ouvrez WhatsApp pour l\'envoyer !');
      }
    }, 'image/png');

  } catch (err) {
    console.error('Erreur html2canvas:', err);
    showToast('Erreur lors de la capture du reçu', 'error');
  }
}

/** Impression du reçu */
function printReceipt() {
  const receiptEl = document.getElementById('receipt-to-print');
  if (!receiptEl) return;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Facture - ${currentReceiptOrder ? currentReceiptOrder.ref : ''}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #f5f5f5; padding: 20px; }
        .receipt-paper { max-width: 400px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
        .receipt-header { background: linear-gradient(135deg, #1b4332, #0b1a13); color: #fff; padding: 24px 20px 20px; text-align: center; }
        .receipt-logo-icon { font-size: 36px; margin-bottom: 8px; }
        .receipt-business-name { font-size: 22px; font-weight: 800; color: #52b788; margin-bottom: 4px; }
        .receipt-business-sub { font-size: 11px; color: rgba(255,255,255,0.7); letter-spacing: 2px; text-transform: uppercase; }
        .receipt-ref-banner { background: linear-gradient(135deg, #2d6a4f, #1b4332); padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; }
        .receipt-ref-banner span { font-size: 12px; font-weight: 700; color: #fff; }
        .receipt-body { padding: 20px; }
        .receipt-section { margin-bottom: 16px; }
        .receipt-section-title { font-size: 10px; font-weight: 700; color: #2d6a4f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #f0f0f0; }
        .receipt-info-row { display: flex; justify-content: space-between; font-size: 13px; color: #333; padding: 3px 0; }
        .receipt-info-row strong { color: #112a1e; }
        .receipt-table { width: 100%; border-collapse: collapse; }
        .receipt-table thead th { background: #f0f7f4; color: #2d6a4f; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 8px 10px; text-align: left; }
        .receipt-table thead th:last-child { text-align: right; }
        .receipt-table tbody tr { border-bottom: 1px solid #f0f0f0; }
        .receipt-table tbody td { padding: 9px 10px; font-size: 13px; color: #333; }
        .receipt-table tbody td:last-child { text-align: right; font-weight: 600; }
        .receipt-table tfoot td { padding: 8px 10px; font-size: 13px; }
        .receipt-table tfoot tr.total-row-final td { font-size: 16px; font-weight: 800; color: #2d6a4f; border-top: 2px solid #52b788; padding-top: 10px; }
        .receipt-delivery-badge { display: inline-flex; align-items: center; gap: 4px; background: #eaf6f0; color: #2d6a4f; border: 1px solid #c7e8d9; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 4px; }
        .receipt-footer { background: #f0f7f4; padding: 14px 20px; text-align: center; border-top: 1px dashed #52b788; }
        .receipt-footer-text { font-size: 12px; color: #666; }
        .receipt-footer-msg { font-size: 13px; font-weight: 600; color: #2d6a4f; margin-top: 4px; font-style: italic; }
        .receipt-qr-strip { background: linear-gradient(135deg, #1b4332, #0b1a13); padding: 10px 20px; text-align: center; }
        .receipt-qr-strip span { font-size: 11px; color: rgba(255,255,255,0.5); }
        @media print { body { padding: 0; background: #fff; } .receipt-paper { box-shadow: none; border-radius: 0; max-width: 100%; } }
      </style>
    </head>
    <body>
      ${receiptEl.outerHTML}
      <script>window.onload = function(){ window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/* ---- Helpers ---- */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(amount, currency) {
  const num = Number(amount) || 0;
  return num.toLocaleString('fr-FR') + ' ' + (currency || 'FCFA');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getStatusLabel(status) {
  const map = {
    processing: 'En cours',
    ready: 'Réalisé',
    delivered: 'Payé',
    cancelled: 'Annulé'
  };
  return map[status] || status;
}

function getStatusColor(status) {
  const map = {
    processing: '#ff9800',
    ready: '#0284c7',
    delivered: '#10b981',
    cancelled: '#64748b'
  };
  return map[status] || '#64748b';
}
