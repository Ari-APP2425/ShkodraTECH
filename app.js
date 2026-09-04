let rowCounter = 0;
let currentDocType = 'fature';
let logoBase64 = '';

// Inicimi gjatë ngarkimit të faqes
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('docDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  // Shto një rresht bosh fillestar
  if (document.getElementById('itemsBody') && document.getElementById('itemsBody').children.length === 0) {
    addRow();
  }
  updateArkivaBadge();
});

function setDocType(type) {
  currentDocType = type;
  document.getElementById('btnFature').classList.toggle('active', type === 'fature');
  document.getElementById('btnOfert').classList.toggle('active', type === 'oferte');
}

function addRow(desc = '', qty = 1, price = 0) {
  rowCounter++;
  const tbody = document.getElementById('itemsBody');
  const tr = document.createElement('tr');
  tr.id = `row-${rowCounter}`;
  
  tr.innerHTML = `
    <td class="text-center fw-bold text-muted row-num">${tbody.children.length + 1}</td>
    <td><input type="text" class="form-control form-control-sm item-desc" value="${desc}" placeholder="Përshkrimi i produktit / shërbimit"></td>
    <td><input type="number" class="form-control form-control-sm item-qty" value="${qty}" min="1" step="any" oninput="calculateTotals()"></td>
    <td><input type="number" class="form-control form-control-sm item-price" value="${price}" min="0" step="any" oninput="calculateTotals()"></td>
    <td>
      <select class="form-select form-select-sm item-vat" onchange="calculateTotals()">
        <option value="20" selected>20% TVSH</option>
        <option value="0">0% (Përjashtuar)</option>
      </select>
    </td>
    <td class="fw-bold item-total">0.00 €</td>
    <td class="text-center">
      <button type="button" class="btn btn-outline-danger btn-sm p-1 border-0" onclick="removeRow('row-${rowCounter}')">
        <i class="fa-solid fa-trash"></i>
      </button>
    </td>
  `;
  
  tbody.appendChild(tr);
  updateRowNumbers();
  calculateTotals();
}

function removeRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    updateRowNumbers();
    calculateTotals();
  }
}

function updateRowNumbers() {
  const rows = document.querySelectorAll('#itemsBody tr');
  rows.forEach((row, index) => {
    const numCell = row.querySelector('.row-num');
    if (numCell) numCell.textContent = index + 1;
  });
}

function calculateTotals() {
  const rows = document.querySelectorAll('#itemsBody tr');
  let subtotal = 0;
  let totalVat = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const vatRate = parseFloat(row.querySelector('.item-vat').value) || 0;

    const rowSubtotal = qty * price;
    const rowVat = rowSubtotal * (vatRate / 100);
    const rowTotal = rowSubtotal + rowVat;

    row.querySelector('.item-total').textContent = rowTotal.toFixed(2) + ' €';

    subtotal += rowSubtotal;
    totalVat += rowVat;
  });

  const grandTotal = subtotal + totalVat;

  document.getElementById('subtotalVal').textContent = subtotal.toFixed(2) + ' €';
  document.getElementById('vatVal').textContent = totalVat.toFixed(2) + ' €';
  document.getElementById('totalVal').textContent = grandTotal.toFixed(2) + ' €';
}

function handleLogoUpload(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      logoBase64 = e.target.result;
      const preview = document.getElementById('logoPreview');
      const placeholder = document.getElementById('logoPlaceholder');
      const removeBtn = document.getElementById('removeLogoBtn');
      
      preview.src = logoBase64;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function removeLogo() {
  logoBase64 = '';
  document.getElementById('compLogo').value = '';
  document.getElementById('logoPreview').style.display = 'none';
  document.getElementById('logoPlaceholder').style.display = 'block';
  document.getElementById('removeLogoBtn').style.display = 'none';
}

function clearForm() {
  document.getElementById('invoiceForm').reset();
  document.getElementById('itemsBody').innerHTML = '';
  removeLogo();
  addRow();
  calculateTotals();
}

/* =========================================================
   FUNKSIONET E KONFIGURATORIT TË KAMERAVE
   ========================================================= */
function updateConfigSummary() {
  const camRes = document.getElementById('cfgCamRes').value;
  const camType = document.getElementById('cfgCamType').value;
  const dvrType = document.getElementById('cfgDvrType').value;
  const dvrRes = document.getElementById('cfgDvrRes').value;
  const dvrCh = document.getElementById('cfgDvrCh').value;
  const summary = document.getElementById('cfgSummary');

  let parts = [];
  if (camRes || camType) {
    let camParts = [];
    if (camRes) camParts.push(camRes + ' MP');
    if (camType) camParts.push(camType);
    parts.push('<strong><i class="fa-solid fa-video me-1"></i>Kamera:</strong> ' + camParts.join(' / '));
  }
  if (dvrType || dvrRes || dvrCh) {
    let dvrParts = [];
    if (dvrType) dvrParts.push(dvrType);
    if (dvrRes) dvrParts.push(dvrRes + ' MP');
    if (dvrCh) dvrParts.push(dvrCh + ' Ch');
    parts.push('<strong><i class="fa-solid fa-server me-1"></i>DVR/NVR/XVR:</strong> ' + dvrParts.join(' / '));
  }

  summary.innerHTML = parts.length ? parts.join('<br>') : 'Zgjidh opsionet më lart për të parë përmbledhjen.';
}

function resetConfigForm() {
  document.getElementById('cfgCamRes').value = '';
  document.getElementById('cfgCamType').value = '';
  document.getElementById('cfgDvrType').value = '';
  document.getElementById('cfgDvrRes').value = '';
  document.getElementById('cfgDvrCh').value = '';
  updateConfigSummary();
}

function addConfiguredCameraToInvoice() {
  const camRes = document.getElementById('cfgCamRes').value;
  const camType = document.getElementById('cfgCamType').value;
  const dvrType = document.getElementById('cfgDvrType').value;
  const dvrRes = document.getElementById('cfgDvrRes').value;
  const dvrCh = document.getElementById('cfgDvrCh').value;

  if (!camRes && !camType && !dvrType && !dvrRes && !dvrCh) {
    alert('Zgjidh të paktën një opsion para se të shtosh në faturë.');
    return;
  }

  // Nëse nuk ka asnjë rresht, pastrojmë rreshtin bosh fillestar nëse përshkrimi është bosh
  const rows = document.querySelectorAll('#itemsBody tr');
  if (rows.length === 1) {
    const firstDesc = rows[0].querySelector('.item-desc').value;
    if (!firstDesc) {
      document.getElementById('itemsBody').innerHTML = '';
    }
  }

  // Shto Kamerën nëse është zgjedhur
  if (camRes || camType) {
    let desc = 'Kamera Sigurie';
    if (camRes) desc += ' ' + camRes + 'MP';
    if (camType) desc += ' (' + camType + ')';
    addRow(desc, 1, 0);
  }

  // Shto DVR/NVR nëse është zgjedhur
  if (dvrType || dvrRes || dvrCh) {
    let desc = dvrType || 'DVR/NVR Regjistrues';
    let details = [];
    if (dvrRes) details.push(dvrRes + 'MP');
    if (dvrCh) details.push(dvrCh + ' Kanale');
    if (details.length) desc += ' (' + details.join(', ') + ')';
    addRow(desc, 1, 0);
  }

  // Mbyll modalin pas shtimit
  const modalEl = document.getElementById('cameraConfigModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();

  // Pastro formën
  resetConfigForm();
}

/* =========================================================
   FUNKSIONET E ARKIVËS DHE GENERIMIT TË PDF
   ========================================================= */
function updateArkivaBadge() {
  const arkiva = JSON.parse(localStorage.getItem('shkodra_tech_arkiva') || '[]');
  const badge = document.getElementById('arkivaBadge');
  if (badge) badge.textContent = arkiva.length;
}

function saveToArkiva() {
  const docNo = document.getElementById('docNo').value || 'DOC-' + Date.now();
  const cliName = document.getElementById('cliName').value || 'Klient i panjohur';
  const totalVal = document.getElementById('totalVal').textContent;

  const itemData = {
    id: Date.now(),
    type: currentDocType,
    docNo: docNo,
    date: document.getElementById('docDate').value,
    cliName: cliName,
    total: totalVal,
    compName: document.getElementById('compName').value,
    notes: document.getElementById('docNotes').value
  };

  let arkiva = JSON.parse(localStorage.getItem('shkodra_tech_arkiva') || '[]');
  arkiva.push(itemData);
  localStorage.setItem('shkodra_tech_arkiva', JSON.stringify(arkiva));

  updateArkivaBadge();
  alert('Dokumenti u ruajt me sukses në arkivë!');
}

function loadArkivaList() {
  const arkiva = JSON.parse(localStorage.getItem('shkodra_tech_arkiva') || '[]');
  const tbody = document.getElementById('arkivaBody');
  tbody.innerHTML = '';

  if (arkiva.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nuk ka dokumente të ruajtura.</td></tr>';
    return;
  }

  arkiva.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge ${item.type === 'fature' ? 'bg-primary' : 'bg-warning text-dark'}">${item.type.toUpperCase()}</span></td>
      <td>${item.docNo}</td>
      <td>${item.date}</td>
      <td>${item.cliName}</td>
      <td class="fw-bold">${item.total}</td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm" onclick="deleteArkivaItem(${item.id})"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function deleteArkivaItem(id) {
  let arkiva = JSON.parse(localStorage.getItem('shkodra_tech_arkiva') || '[]');
  arkiva = arkiva.filter(i => i.id !== id);
  localStorage.setItem('shkodra_tech_arkiva', JSON.stringify(arkiva));
  loadArkivaList();
  updateArkivaBadge();
}
