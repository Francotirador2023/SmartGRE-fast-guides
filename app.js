// ==============================================================================
// CONFIGURACIÓN DE TU BACKEND LOCAL (FASTAPI + SQLITE)
// ==============================================================================
// URL del servidor local de base de datos.
const SERVER_URL = 'http://127.0.0.1:8000';
let isServerActive = false; // Se autodetecta al cargar
// ==============================================================================

// SaaS GLOBAL STATE
let currentRole = 'carrier'; // 'carrier' (Transagui) or 'sender' (Hofarm)
let activeData = null;

// TAB NAVIGATION SYSTEM
const navItems = document.querySelectorAll('.nav-menu .nav-item');
const tabSections = document.querySelectorAll('.tab-content');
const tabTitle = document.getElementById('tab-title');
const tabSubtitle = document.getElementById('tab-subtitle');

const tabMeta = {
  dashboard: {
    carrier: { title: 'Consola de Transportista', subtitle: 'Monitoreo de Guías de Remisión Transportista (GRT) y despachos en rampa.' },
    sender: { title: 'Gestión de Almacén y Despacho', subtitle: 'Monitoreo de Guías de Remisión Remitente (GRR) y salidas de stock.' }
  },
  scanner: {
    carrier: { title: 'Ingesta OCR (De Guías de Clientes)', subtitle: 'Digitalización automática de Guías Remitentes físicas para emitir Guías Transportistas.' },
    sender: { title: 'Ingesta OCR (De Órdenes / Facturas)', subtitle: 'Conversión instantánea de Órdenes de Compra o Facturas a Guías de Remisión Remitente.' }
  },
  history: {
    carrier: { title: 'Historial de Transportes (GRT)', subtitle: 'Listado completo de guías de transportistas aceptadas por la SUNAT.' },
    sender: { title: 'Historial de Despachos (GRR)', subtitle: 'Listado de guías remitentes emitidas por almacén y enviadas a clientes.' }
  },
  integrations: {
    carrier: { title: 'Ecosistema API Transportista', subtitle: 'Integraciones del transportista con SUNAT, GPS de camiones y webhooks de clientes.' },
    sender: { title: 'Ecosistema API Remitente', subtitle: 'Conexión del almacén con sistemas ERP (SAP, Odoo), Facturación y SUNAT.' }
  }
};

// INITIALIZE NAVIGATION
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tabName = item.getAttribute('data-tab');
    
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    
    tabSections.forEach(section => {
      if (section.id === `tab-content-${tabName}`) {
        section.style.display = 'block';
      } else {
        section.style.display = 'none';
      }
    });

    updateTabHeader(tabName);
  });
});

function updateTabHeader(tabName) {
  const activeTab = tabName || document.querySelector('.nav-menu .nav-item.active').getAttribute('data-tab');
  if (tabMeta[activeTab] && tabMeta[activeTab][currentRole]) {
    tabTitle.textContent = tabMeta[activeTab][currentRole].title;
    tabSubtitle.textContent = tabMeta[activeTab][currentRole].subtitle;
  }
}

// CHECK BACKEND STATUS & LOAD PERSISTENT DATA
async function checkServerStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/`);
    if (response.ok) {
      isServerActive = true;
      console.log("⚡ SmartGRE Server: ¡Conectado al backend local SQLite!");
      
      // Update UI Status Indicators
      const badge = document.getElementById('header-company-badge');
      if (badge) {
        badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        badge.style.background = 'rgba(16, 185, 129, 0.08)';
      }
    }
  } catch (error) {
    isServerActive = false;
    console.log("💡 SmartGRE Server: Servidor desconectado. Corriendo en modo simulación (Frontend-only).");
  }
  
  // Update OCR status pill in UI
  const ocrPill = document.getElementById('ocr-engine-pill');
  if (ocrPill) {
    if (isServerActive) {
      ocrPill.className = 'status-pill pill-success';
      ocrPill.innerHTML = '<span class="blink-dot"></span> REAL AI + DB (CONECTADO)';
      ocrPill.style.background = 'rgba(16, 185, 129, 0.15)';
      ocrPill.style.color = '#10b981';
      ocrPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      ocrPill.className = 'status-pill pill-warning';
      ocrPill.style.background = 'rgba(245, 158, 11, 0.15)';
      ocrPill.style.color = '#f59e0b';
      ocrPill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      if (window.location.protocol === 'file:') {
        ocrPill.innerHTML = '⚠️ MODO DEMO OFFLINE (Navegador bloqueó fetch local. Usa http://127.0.0.1:8000)';
      } else {
        ocrPill.innerHTML = '⚠️ SERVIDOR INACTIVO (Ejecuta: python server.py)';
      }
    }
  }

  // Refresh views
  renderDashboardData();
  renderHistoryTable();
  renderIntegrationsPanel();
}

// DRAG AND DROP REAL INTERFACE & FILE LISTENER
const dropZone = document.getElementById('drop-zone');
const fileUploader = document.getElementById('file-uploader');

if (dropZone && fileUploader) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileUploader.addEventListener('change', () => {
    if (fileUploader.files.length > 0) {
      handleFileUpload(fileUploader.files[0]);
    }
  });
}

function clearAllActiveIntervals() {
  if (window.scanInterval) {
    clearInterval(window.scanInterval);
    window.scanInterval = null;
  }
  if (window.uploadInterval) {
    clearInterval(window.uploadInterval);
    window.uploadInterval = null;
  }
}

// CLIENT-SIDE IMAGE COMPRESSION (Resizes to max 1200px and compresses to 85% JPEG quality)
async function resizeImage(file, maxWidth = 1200, maxHeight = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          }));
        }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// FILE PROCESSING FLOW (Real backend extraction or Simulated demo)
async function handleFileUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert("📸 Por favor, selecciona un archivo de imagen válido (JPG, JPEG o PNG).");
    return;
  }

  // Clear any active scan/upload timers to prevent overlapping UI updates
  clearAllActiveIntervals();

  // 1. Show scanning playground screen
  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('samples-panel').style.display = 'none';
  document.getElementById('success-screen').style.display = 'none';
  
  const playground = document.getElementById('scan-playground');
  playground.style.display = 'flex';
  
  const progressBg = document.getElementById('scan-progress-area');
  const progressBar = document.getElementById('progress-bar');
  const scanPercent = document.getElementById('scan-percent');
  const scanLabel = document.getElementById('scan-status-label');
  const laserLine = document.getElementById('laser-line');
  
  progressBg.style.display = 'flex';
  progressBar.style.width = '10%';
  scanPercent.textContent = '10%';
  laserLine.style.display = 'block';
  
  resetFormFields();

  // If server is not active, run simulated demo instead
  if (!isServerActive) {
    scanLabel.textContent = '🔍 Iniciando digitalizador demo (Servidor inactivo)...';
    progressBg.style.display = 'none';
    triggerScanDemo();
    return;
  }

  scanLabel.textContent = '⚡ Optimizando imagen para transmisión ultra rápida...';

  let optimizedFile = file;
  try {
    optimizedFile = await resizeImage(file, 1200, 1200);
    console.log(`📸 Compresión local: ${(file.size / 1024).toFixed(1)} KB → ${(optimizedFile.size / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.warn("Fallo compresión local, subiendo archivo original", err);
  }

  scanLabel.textContent = '🚀 Subiendo imagen optimizada al servidor...';

  // Make REST Upload call to local Python server
  const formData = new FormData();
  formData.append('file', optimizedFile);

  // Animate progress bar dynamically using an asymptotic formula (never gets stuck at 90%)
  let progress = 15;
  window.uploadInterval = setInterval(() => {
    if (progress < 98) {
      // The closer it gets to 98%, the slower it increments
      const increment = Math.max(0.4, (98 - progress) * 0.08);
      progress += increment;
      progressBar.style.width = `${Math.floor(progress)}%`;
      scanPercent.textContent = `${Math.floor(progress)}%`;
      
      if (progress < 40) {
        scanLabel.textContent = '🤖 Conectando con Gemini 2.5/3.5...';
      } else if (progress < 70) {
        scanLabel.textContent = '⚡ Extrayendo tablas y datos tributarios con IA...';
      } else {
        scanLabel.textContent = '📝 Mapeando datos a base de datos SQLite...';
      }
    }
  }, 120);

  try {
    const response = await fetch(`${SERVER_URL}/api/scan`, {
      method: 'POST',
      body: formData
    });

    clearAllActiveIntervals();

    if (!response.ok) {
      const errorMsg = await response.json();
      throw new Error(errorMsg.detail || "Error en el servidor");
    }

    const data = await response.json();
    
    progressBar.style.width = '100%';
    scanPercent.textContent = '100%';
    scanLabel.textContent = '✓ ¡Extracción completada con éxito real!';
    scanLabel.style.color = 'var(--success)';
    laserLine.style.display = 'none';

    // Populate data model
    activeData = {
      senderRuc: data.emisor.ruc || '20549281042',
      senderName: data.emisor.razon_social || 'LABORATORIO HOFARM S.A.C.',
      docNumber: data.referencia_documento.numero || 'OC-PENDIENTE',
      date: data.referencia_documento.fecha_emision || '31/05/2026',
      startPoint: data.ruta.punto_partida || 'Jr. Los Cedros 452 - Lince',
      endPoint: data.ruta.punto_llegada || 'Av. Industrial 1050 - Ate',
      recipientRuc: data.destinatario.ruc || '20104829103',
      recipientName: data.destinatario.razon_social || 'DIFARMA S.A.',
      driver: currentRole === 'carrier' ? 'Carlos Mendoza Vasquez' : '', 
      license: currentRole === 'carrier' ? 'Q-4829103' : '',
      plate: currentRole === 'carrier' ? 'F4B-920' : '',
      carrierName: data.datos_carga.transportista_nombre || 'TRANSAGUI CORP S.A.C.',
      carrierRuc: data.datos_carga.transportista_ruc || '20948271031',
      weight: data.datos_carga.peso_bruto_total_kg || '0',
      items: data.items || []
    };

    // Render forms & previews
    populateRealUI(activeData);

    setTimeout(() => {
      progressBg.style.display = 'none';
    }, 1000);

  } catch (error) {
    clearAllActiveIntervals();
    console.error(error);
    alert("⚠️ Falló el escaneo con el servidor local:\n" + error.message + "\n\nSe activará el simulador de respaldo.");
    progressBg.style.display = 'none';
    triggerScanDemo();
  }
}

// Populate browser DOM with parsed fields
function populateRealUI(data) {
  // 1. Populate Preview (Left Side)
  document.getElementById('doc-sender-header').textContent = data.senderName;
  document.getElementById('doc-sender-ruc').textContent = `RUC: ${data.senderRuc}`;
  document.getElementById('doc-number-preview').textContent = data.docNumber;
  document.getElementById('doc-date-preview').textContent = data.date;
  document.getElementById('doc-recipient-preview').textContent = data.recipientName;
  document.getElementById('doc-recipient-ruc-preview').textContent = data.recipientRuc;
  document.getElementById('doc-start-preview').textContent = data.startPoint;
  document.getElementById('doc-end-preview').textContent = data.endPoint;
  
  const previewItemsBody = document.getElementById('doc-items-preview');
  previewItemsBody.innerHTML = '';
  data.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px dashed #cbd5e1';
    tr.innerHTML = `
      <td style="padding: 0.15rem 0;">${item.cantidad || item.cant || 1}</td>
      <td style="padding: 0.15rem 0;">${item.descripcion || item.desc}</td>
      <td style="padding: 0.15rem 0; text-align: right;">${item.unidad_medida || item.peso || 'UND'}</td>
    `;
    previewItemsBody.appendChild(tr);
  });

  if (currentRole === 'carrier') {
    document.getElementById('doc-type-title').textContent = 'GUIA DE REMISION REMITENTE';
    document.getElementById('doc-carrier-footer-preview').innerHTML = `
      <strong>Chofer Asignado:</strong> <span id="doc-driver-preview">${data.driver}</span><br>
      <strong>Vehículo (Placa):</strong> <span id="doc-plate-preview">${data.plate}</span>
    `;
  } else {
    document.getElementById('doc-type-title').textContent = 'FACTURA / ORDEN COMERCIAL';
    document.getElementById('doc-carrier-footer-preview').innerHTML = `
      <strong>Courier Contratado:</strong> <span id="doc-driver-preview">${data.carrierName}</span><br>
      <strong>Peso Total:</strong> <span>${data.weight} Kg</span>
    `;
  }

  // 2. Populate Form (Right Side)
  document.getElementById('form-sender-ruc').value = data.senderRuc;
  document.getElementById('form-sender-name').value = data.senderName;
  document.getElementById('form-sender-doc').value = data.docNumber;
  document.getElementById('form-sender-date').value = data.date;
  document.getElementById('form-start-point').value = data.startPoint;
  document.getElementById('form-end-point').value = data.endPoint;
  document.getElementById('form-recipient-ruc').value = data.recipientRuc;
  document.getElementById('form-recipient-name').value = data.recipientName;
  document.getElementById('form-carrier-weight').value = data.weight;

  if (currentRole === 'carrier') {
    document.getElementById('form-carrier-driver').value = data.driver;
    document.getElementById('form-carrier-license').value = data.license;
    document.getElementById('form-carrier-plate').value = data.plate;
  } else {
    document.getElementById('form-carrier-name').value = data.carrierName;
    document.getElementById('form-carrier-ruc').value = data.carrierRuc;
    
    const formItemsBody = document.getElementById('form-items-body');
    formItemsBody.innerHTML = '';
    data.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" class="form-input" style="width: 100%; padding: 0.3rem;" value="${item.descripcion || item.desc}"></td>
        <td><input type="number" class="form-input" style="width: 70px; padding: 0.3rem;" value="${item.cantidad || item.cant}"></td>
        <td><input type="text" class="form-input" style="width: 70px; padding: 0.3rem;" value="${item.unidad_medida || 'UND'}"></td>
      `;
      formItemsBody.appendChild(tr);
    });
  }

  document.querySelectorAll('.form-input.highlighted').forEach(el => {
    el.style.animation = 'glowGently 1s infinite alternate';
  });
}

function triggerScanDemo() {
  if (currentRole === 'carrier') {
    simulateScan('carrier_hofarm');
  } else {
    simulateScan('sender_order');
  }
}

// SCANNER MOCK ENGINE DATA
const mockScanData = {
  carrier_hofarm: {
    senderRuc: '20549281042',
    senderName: 'LABORATORIO HOFARM S.A.C.',
    docNumber: 'GRR-0049281',
    date: '31/05/2026',
    startPoint: 'Jr. Los Cedros 452 - Lince, Lima',
    endPoint: 'Av. Industrial 1050 - Ate, Lima',
    recipientRuc: '20104829103',
    recipientName: 'DIFARMA S.A.',
    driver: 'Carlos Mendoza Vasquez',
    license: 'Q-4829103',
    plate: 'F4B-920',
    weight: '2450',
    items: [
      { cant: '150', desc: 'Caja Amoxicilina 500mg (x100 tab)', peso: '450 Kg' },
      { cant: '80', desc: 'Paracetamol 500mg Suspensión 60ml', peso: '600 Kg' },
      { cant: '120', desc: 'Alcohol Gel Medicinal 1L', peso: '1400 Kg' }
    ]
  },
  carrier_general: {
    senderRuc: '20194827192',
    senderName: 'QUIMICA INDUSTRIAL ANDINA',
    docNumber: 'GRR-0283921',
    date: '31/05/2026',
    startPoint: 'Av. Argentina 4050 - Callao',
    endPoint: 'Almacén Central Transagui - Huachipa',
    recipientRuc: '20492810482',
    recipientName: 'ALICORP S.A.A.',
    driver: 'Jorge Vasquez Torres',
    license: 'A-2948102',
    plate: 'C2I-841',
    weight: '4120',
    items: [
      { cant: '10', desc: 'Cilindro de Cloruro de Sodio (200L)', peso: '2200 Kg' },
      { cant: '5', desc: 'Pallet Envase Polietileno de Alta Densidad', peso: '1920 Kg' }
    ]
  },
  sender_order: {
    senderRuc: '20549281042',
    senderName: 'LABORATORIO HOFARM S.A.C.',
    docNumber: 'OC-2026-9281',
    date: '31/05/2026',
    startPoint: 'Jr. Los Cedros 452 - Lince, Lima',
    endPoint: 'Av. Circunvalación 450 - San Luis, Lima',
    recipientRuc: '20482910394',
    recipientName: 'FARMACIAS DE TODOS S.A.C.',
    carrierRuc: '20948271031',
    carrierName: 'TRANSAGUI CORP S.A.C.',
    weight: '840',
    items: [
      { cant: '200', desc: 'Cajas de Paracetamol Forte 500mg', peso: '200 Unid' },
      { cant: '150', desc: 'Frascos de Jarabe para Tos Pediátrico', peso: '150 Unid' },
      { cant: '50', desc: 'Cajas de Mascarillas Clínicas Quirúrgicas', peso: '50 Unid' }
    ]
  },
  sender_invoice: {
    senderRuc: '20549281042',
    senderName: 'LABORATORIO HOFARM S.A.C.',
    docNumber: 'F001-0004829',
    date: '31/05/2026',
    startPoint: 'Jr. Los Cedros 452 - Lince, Lima',
    endPoint: 'Av. Industrial 120 - Ate, Lima',
    recipientRuc: '20104829103',
    recipientName: 'DIFARMA S.A.',
    carrierRuc: '20948271031',
    carrierName: 'TRANSAGUI CORP S.A.C.',
    weight: '1250',
    items: [
      { cant: '500', desc: 'Tubos de Crema Dermatológica Humectante', peso: '500 Unid' },
      { cant: '100', desc: 'Kits de Primeros Auxilios Portátiles', peso: '100 Unid' }
    ]
  }
};

// ROLE SWITCHING ENGINE (SaaS Demonstrator)
function setSaaSRole(role) {
  currentRole = role;
  
  const btnCarrier = document.getElementById('btn-role-carrier');
  const btnSender = document.getElementById('btn-role-sender');
  
  if (role === 'carrier') {
    btnCarrier.style.background = 'var(--secondary)';
    btnCarrier.style.borderColor = 'var(--secondary)';
    btnSender.style.background = 'rgba(8, 14, 28, 0.8)';
    btnSender.style.borderColor = 'var(--border-color)';
    
    document.getElementById('sidebar-role-label').textContent = 'TRANSAGUI CORP';
    document.getElementById('badge-company-name').textContent = 'TRANSAGUI CORP (TRANSPORTISTA)';
    document.getElementById('footer-role').textContent = 'Gerente de Logística';
    document.getElementById('footer-avatar').textContent = 'TG';
  } else {
    btnSender.style.background = 'var(--secondary)';
    btnSender.style.borderColor = 'var(--secondary)';
    btnCarrier.style.background = 'rgba(8, 14, 28, 0.8)';
    btnCarrier.style.borderColor = 'var(--border-color)';
    
    document.getElementById('sidebar-role-label').textContent = 'LABORATORIO HOFARM';
    document.getElementById('badge-company-name').textContent = 'LAB. HOFARM (REMITENTE)';
    document.getElementById('footer-role').textContent = 'Jefe de Almacén';
    document.getElementById('footer-avatar').textContent = 'HF';
  }

  updateTabHeader();
  renderDashboardData();
  renderScannerForm();
  renderHistoryTable();
  renderIntegrationsPanel();
  resetScan();
}

// 1. DASHBOARD RENDERER (Supports DB persistence or mock)
async function renderDashboardData() {
  const recentActivityBody = document.getElementById('dashboard-recent-activity');
  recentActivityBody.innerHTML = '';
  
  if (currentRole === 'carrier') {
    document.getElementById('m1-title').textContent = 'Guías GRT Emitidas';
    document.getElementById('m3-title').textContent = 'Tiempo Ahorrado Chofer';
    document.getElementById('recent-activity-title').textContent = 'Últimas Guías de Transportista (GRT) Firmadas';
    document.getElementById('chart-section-title').textContent = 'Tiempo de Espera del Conductor en Rampa (Mins)';
    document.getElementById('chart-section-desc').textContent = 'Muestra los minutos que pasa el camión detenido esperando la emisión manual frente al escaneo inteligente.';
    document.getElementById('chart-bar-before').style.height = '85%';
    document.getElementById('chart-val-before').textContent = '24m';
    document.getElementById('chart-label-before').textContent = 'Digitado Manual';
    document.getElementById('chart-bar-after').style.height = '12%';
    document.getElementById('chart-val-after').textContent = '2.8m';
    document.getElementById('chart-label-after').textContent = 'SmartGRE AI OCR';
    document.getElementById('insight-text').textContent = 'Al escanear al instante la Guía Remitente del cliente, el despachador de Transagui emite la Guía Transportista de SUNAT en segundos, evitando que el conductor espere en el almacén de despacho.';
  } else {
    document.getElementById('m1-title').textContent = 'Guías GRR Emitidas';
    document.getElementById('m3-title').textContent = 'Tiempo Ahorrado Almacén';
    document.getElementById('recent-activity-title').textContent = 'Últimas Guías de Remitente (GRR) Despachadas';
    document.getElementById('chart-section-title').textContent = 'Tiempo de Creación de Guías Remitentes (Seg/Guía)';
    document.getElementById('chart-section-desc').textContent = 'Muestra el tiempo que tarda un despachador en digitar ítem por ítem desde una Orden de Compra frente al mapeo automático.';
    document.getElementById('chart-bar-before').style.height = '90%';
    document.getElementById('chart-val-before').textContent = '410s';
    document.getElementById('chart-label-before').textContent = 'Digitando Ítems';
    document.getElementById('chart-bar-after').style.height = '8%';
    document.getElementById('chart-val-after').textContent = '32s';
    document.getElementById('chart-label-after').textContent = 'Mapeo OCR IA';
    document.getElementById('insight-text').textContent = 'En lugar de transcribir a mano los 20 o 50 productos de una Orden de Compra para emitir la Guía Remitente de Hofarm, el cargador de PDF de la plataforma lee la tabla y la genera con validación de RUCs en 30 segundos.';
  }

  // Load from SQLITE DB if active
  if (isServerActive) {
    try {
      const response = await fetch(`${SERVER_URL}/api/history?role=${currentRole}`);
      const history = await response.ok ? await response.json() : [];
      
      document.getElementById('metric-processed').textContent = history.length.toLocaleString();
      
      if (history.length === 0) {
        recentActivityBody.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); padding: 1rem;">No hay registros persistentes todavía.</p>`;
        return;
      }

      // Render top 3 recent items
      history.slice(0, 3).forEach(act => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        
        let meta = '';
        let title = '';
        let amt = '';
        
        if (currentRole === 'carrier') {
          title = `${act.sender_name.substring(0, 18)} → ${act.recipient_name.substring(0, 15)}`;
          meta = `${act.gre_number} | Chofer: ${act.driver_name.split(' ')[0]}`;
          amt = `${(Number(act.weight_kg)/1000).toFixed(1)} TN`;
        } else {
          title = `Despacho → ${act.recipient_name.substring(0, 18)}`;
          meta = `Guía: ${act.gre_number} | Ref: ${act.doc_number}`;
          amt = `${Number(act.weight_kg).toLocaleString()} Kg`;
        }

        div.innerHTML = `
          <div class="activity-left">
            <div class="activity-badge">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <div class="activity-details">
              <span class="activity-name">${title}</span>
              <span class="activity-meta">${meta}</span>
            </div>
          </div>
          <div class="activity-right">
            <span class="activity-amount">${amt}</span>
            <span class="status-pill pill-success">Emitido SUNAT</span>
          </div>
        `;
        recentActivityBody.appendChild(div);
      });
      return;
    } catch (e) {
      console.error(e);
    }
  }

  // Fallback to MOCK Dashboard data
  if (currentRole === 'carrier') {
    document.getElementById('metric-processed').textContent = '1,248';
    document.getElementById('metric-automation').textContent = '94.8%';
    document.getElementById('metric-timesaved').textContent = '4m 12s';
    
    const activities = [
      { client: 'LABORATORIO HOFARM', rec: 'DIFARMA ATE', doc: 'GRT-2026-004822', driver: 'Carlos M.', weight: '2.4 TN', status: 'Emitido SUNAT' },
      { client: 'QUIMICA ANDINA', rec: 'ALICORP CALLAO', doc: 'GRT-2026-004821', driver: 'Jorge V.', weight: '4.1 TN', status: 'Emitido SUNAT' },
      { client: 'LABORATORIO HOFARM', rec: 'ALMACEN SUR', doc: 'GRT-2026-004818', driver: 'Carlos M.', weight: '3.1 TN', status: 'Emitido SUNAT' }
    ];
    activities.forEach(act => {
      const div = document.createElement('div');
      div.className = 'activity-item';
      div.innerHTML = `
        <div class="activity-left">
          <div class="activity-badge">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <div class="activity-details">
            <span class="activity-name">${act.client} → ${act.rec}</span>
            <span class="activity-meta">${act.doc} | Conductor: ${act.driver}</span>
          </div>
        </div>
        <div class="activity-right">
          <span class="activity-amount">${act.weight}</span>
          <span class="status-pill pill-success">${act.status}</span>
        </div>
      `;
      recentActivityBody.appendChild(div);
    });
  } else {
    document.getElementById('metric-processed').textContent = '3,481';
    document.getElementById('metric-automation').textContent = '96.2%';
    document.getElementById('metric-timesaved').textContent = '6m 45s';
    
    const activities = [
      { rec: 'FARMACIAS DE TODOS', doc: 'GRR-0049281', ref: 'OC-2026-9281', carrier: 'TRANSAGUI CORP', weight: '840 Kg', status: 'Emitido SUNAT' },
      { rec: 'DIFARMA S.A.', doc: 'GRR-0049279', ref: 'FAC-0004829', carrier: 'TRANSAGUI CORP', weight: '1,250 Kg', status: 'Emitido SUNAT' },
      { rec: 'BOTICAS PERU S.A.', doc: 'GRR-0049275', ref: 'OC-2026-9104', carrier: 'OLVA COURIER', weight: '310 Kg', status: 'Emitido SUNAT' }
    ];
    activities.forEach(act => {
      const div = document.createElement('div');
      div.className = 'activity-item';
      div.innerHTML = `
        <div class="activity-left">
          <div class="activity-badge">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </div>
          <div class="activity-details">
            <span class="activity-name">Despacho → ${act.rec}</span>
            <span class="activity-meta">Guía: ${act.doc} | Referencia: ${act.ref} | Carrier: ${act.carrier}</span>
          </div>
        </div>
        <div class="activity-right">
          <span class="activity-amount">${act.weight}</span>
          <span class="status-pill pill-success">${act.status}</span>
        </div>
      `;
      recentActivityBody.appendChild(div);
    });
  }
}

// 2. SCANNER FORM RENDERER (remains identical, sets up inputs)
function renderScannerForm() {
  const container = document.getElementById('extracted-form-container');
  const samplesContainer = document.getElementById('samples-buttons-container');
  
  if (currentRole === 'carrier') {
    document.getElementById('scanner-panel-title').textContent = 'Ingesta de Guías Remitente (Emisión de GRT)';
    document.getElementById('upload-box-title').textContent = 'Arrastra la Guía Remitente del Cliente (PDF/Foto)';
    document.getElementById('upload-box-desc').textContent = 'Soporta fotos de guías físicas del cliente (ej. Hofarm) enviadas por WhatsApp para extraer datos.';
    
    samplesContainer.innerHTML = `
      <button class="sample-button" onclick="simulateScan('carrier_hofarm')">
        <div class="sample-btn-icon" style="color: var(--secondary); background: rgba(139,92,246,0.1)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="sample-btn-info">
          <span class="sample-btn-name">Foto Guía Remitente Hofarm</span>
          <span class="sample-btn-size">WhatsApp Image • 420 KB</span>
        </div>
      </button>
      <button class="sample-button" onclick="simulateScan('carrier_general')">
        <div class="sample-btn-icon" style="color: var(--secondary); background: rgba(139,92,246,0.1)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="sample-btn-info">
          <span class="sample-btn-name">Guía Química Andina</span>
          <span class="sample-btn-size">PDF Digital • 1.1 MB</span>
        </div>
      </button>
    `;

    container.innerHTML = `
      <h3 style="font-family: var(--font-title); font-size: 1.1rem; margin-bottom: 0.25rem;">Datos de Guía Remitente Leídos por IA</h3>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">La IA ha digitalizado los datos de la guía del cliente para que emitas la Guía Transportista.</p>
      
      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">RUC Remitente (Cliente)</label>
          <input type="text" class="form-input" id="form-sender-ruc" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Razón Social Remitente</label>
          <input type="text" class="form-input" id="form-sender-name" readonly>
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">N° de Guía Remitente (Vínculo)</label>
          <input type="text" class="form-input" id="form-sender-doc" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de Emisión</label>
          <input type="text" class="form-input" id="form-sender-date">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Dirección de Origen (Partida)</label>
        <input type="text" class="form-input" id="form-start-point">
      </div>

      <div class="form-group">
        <label class="form-label">Dirección de Destino (Llegada)</label>
        <input type="text" class="form-input" id="form-end-point">
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">RUC del Destinatario</label>
          <input type="text" class="form-input" id="form-recipient-ruc">
        </div>
        <div class="form-group">
          <label class="form-label">Destinatario Final</label>
          <input type="text" class="form-input" id="form-recipient-name">
        </div>
      </div>

      <h4 style="font-size: 0.85rem; font-family: var(--font-title); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem; margin: 0.75rem 0 0.25rem 0; color: var(--secondary)">
        Información del Conductor y Camión (Transagui Corp)
      </h4>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">Conductor Asignado</label>
          <input type="text" class="form-input highlighted" id="form-carrier-driver" placeholder="Ej: Carlos Mendoza">
        </div>
        <div class="form-group">
          <label class="form-label">Licencia Conducir</label>
          <input type="text" class="form-input" id="form-carrier-license" placeholder="Ej: Q-4829103">
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">Placa Tracto (Vehículo)</label>
          <input type="text" class="form-input highlighted" id="form-carrier-plate" placeholder="Ej: F4B-920">
        </div>
        <div class="form-group">
          <label class="form-label">Peso Bruto Total Declarado (Kg)</label>
          <input type="text" class="form-input" id="form-carrier-weight">
        </div>
      </div>

      <div class="items-table-wrapper" style="display: none;">
        <table class="items-table"><tbody id="form-items-body"></tbody></table>
      </div>

      <div class="action-buttons">
        <button class="btn btn-secondary" onclick="resetScan()">Cancelar</button>
        <button class="btn btn-primary" id="btn-submit-gre" onclick="emitGRE()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Emitir Guía Transportista (GRT)
        </button>
      </div>
    `;
  } else {
    document.getElementById('scanner-panel-title').textContent = 'Ingesta de Órdenes y Facturas (Emisión de GRR)';
    document.getElementById('upload-box-title').textContent = 'Arrastra el Documento de Venta (PDF/Orden de Compra)';
    document.getElementById('upload-box-desc').textContent = 'Carga el PDF comercial o de compra que te envió el cliente para generar la guía remitente con la lista completa de productos.';

    samplesContainer.innerHTML = `
      <button class="sample-button" onclick="simulateScan('sender_order')">
        <div class="sample-btn-icon" style="color: var(--secondary); background: rgba(139,92,246,0.1)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="sample-btn-info">
          <span class="sample-btn-name">Orden de Compra - Inkafarma</span>
          <span class="sample-btn-size">PDF Digital • 180 KB</span>
        </div>
      </button>
      <button class="sample-button" onclick="simulateScan('sender_invoice')">
        <div class="sample-btn-icon" style="color: var(--secondary); background: rgba(139,92,246,0.1)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="sample-btn-info">
          <span class="sample-btn-name">Factura Comercial Emitida</span>
          <span class="sample-btn-size">PDF Factura • 220 KB</span>
        </div>
      </button>
    `;

    container.innerHTML = `
      <h3 style="font-family: var(--font-title); font-size: 1.1rem; margin-bottom: 0.25rem;">Datos del Documento de Venta (Leídos por IA)</h3>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">La IA ha interpretado los ítems y datos de entrega para crear tu Guía Remitente de Almacén.</p>
      
      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">RUC de Nuestra Empresa</label>
          <input type="text" class="form-input" id="form-sender-ruc" value="20549281042" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre de Nuestra Empresa</label>
          <input type="text" class="form-input" id="form-sender-name" value="LABORATORIO HOFARM S.A.C." readonly>
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">Documento Referencia (OC/Factura)</label>
          <input type="text" class="form-input" id="form-sender-doc" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de Despacho Programada</label>
          <input type="text" class="form-input" id="form-sender-date">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Dirección de Partida (Nuestro Almacén)</label>
        <input type="text" class="form-input" id="form-start-point">
      </div>

      <div class="form-group">
        <label class="form-label">Dirección de Destino (Cliente Final)</label>
        <input type="text" class="form-input" id="form-end-point">
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">RUC de Cliente Destinatario</label>
          <input type="text" class="form-input" id="form-recipient-ruc">
        </div>
        <div class="form-group">
          <label class="form-label">Razón Social Cliente</label>
          <input type="text" class="form-input" id="form-recipient-name">
        </div>
      </div>

      <h4 style="font-size: 0.85rem; font-family: var(--font-title); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem; margin: 0.75rem 0 0.25rem 0; color: var(--secondary)">
        Modalidad de Envío y Courier Contratado
      </h4>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">Transportista Contratado (Carrier)</label>
          <input type="text" class="form-input highlighted" id="form-carrier-name" placeholder="Ej: TRANSAGUI CORP">
        </div>
        <div class="form-group">
          <label class="form-label">RUC de Transportista</label>
          <input type="text" class="form-input" id="form-carrier-ruc" placeholder="Ej: 20948271031">
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label class="form-label">Peso Bruto Estimado Total (Kg)</label>
          <input type="text" class="form-input" id="form-carrier-weight">
        </div>
        <div class="form-group" style="display: none;">
          <input type="text" id="form-carrier-driver" value="CARRIER_MODE_PASS">
          <input type="text" id="form-carrier-plate" value="CARRIER_MODE_PASS">
        </div>
      </div>

      <h4 style="font-size: 0.85rem; font-family: var(--font-title); margin: 0.75rem 0 0.25rem 0; color: var(--secondary)">
        Listado Detallado de Productos Leídos (Obligatorio para Almacén)
      </h4>
      <div class="items-table-wrapper">
        <table class="items-table">
          <thead>
            <tr>
              <th>Descripción Producto</th>
              <th>Cant.</th>
              <th>U.M.</th>
            </tr>
          </thead>
          <tbody id="form-items-body">
          </tbody>
        </table>
      </div>

      <div class="action-buttons">
        <button class="btn btn-secondary" onclick="resetScan()">Cancelar</button>
        <button class="btn btn-primary" id="btn-submit-gre" onclick="emitGRE()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Emitir Guía Remitente (GRR)
        </button>
      </div>
    `;
  }
}

// 3. HISTORY TABLE RENDERER (Persistent SQLITE or Mock)
async function renderHistoryTable() {
  const head = document.getElementById('history-table-head');
  const body = document.getElementById('history-table-body');
  
  if (currentRole === 'carrier') {
    document.getElementById('history-panel-title').textContent = 'Historial de Guías de Transportistas (GRT) Emitidas';
    head.innerHTML = `
      <tr>
        <th style="padding: 0.75rem;">F. Emisión</th>
        <th style="padding: 0.75rem;">N° GRE Transportista</th>
        <th style="padding: 0.75rem;">Cliente (Remitente)</th>
        <th style="padding: 0.75rem;">Conductor y Placa</th>
        <th style="padding: 0.75rem;">Peso Declarado</th>
        <th style="padding: 0.75rem;">Estado SUNAT</th>
      </tr>
    `;
  } else {
    document.getElementById('history-panel-title').textContent = 'Historial de Guías de Remitente (GRR) Emitidas';
    head.innerHTML = `
      <tr>
        <th style="padding: 0.75rem;">F. Despacho</th>
        <th style="padding: 0.75rem;">N° GRE Remitente</th>
        <th style="padding: 0.75rem;">Destinatario Final</th>
        <th style="padding: 0.75rem;">Carrier Contratado</th>
        <th style="padding: 0.75rem;">N° Referencia</th>
        <th style="padding: 0.75rem;">Estado SUNAT</th>
      </tr>
    `;
  }

  // Load from database if active
  if (isServerActive) {
    try {
      const response = await fetch(`${SERVER_URL}/api/history?role=${currentRole}`);
      const history = await response.ok ? await response.json() : [];
      
      body.innerHTML = '';
      if (history.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No hay guías registradas en la Base de Datos.</td></tr>`;
        return;
      }

      history.forEach(act => {
        const tr = document.createElement('tr');
        if (currentRole === 'carrier') {
          tr.innerHTML = `
            <td style="padding: 0.75rem; color: var(--text-muted);">${act.date_created.split(' ')[0]}</td>
            <td style="padding: 0.75rem;"><strong>${act.gre_number}</strong></td>
            <td style="padding: 0.75rem;">${act.sender_name}</td>
            <td style="padding: 0.75rem;">${act.driver_name} • ${act.vehicle_plate}</td>
            <td style="padding: 0.75rem;">${Number(act.weight_kg).toLocaleString()} Kg</td>
            <td style="padding: 0.75rem;"><span class="status-pill pill-success">${act.status === 'EMITIDO' ? 'Aceptado' : act.status}</span></td>
          `;
        } else {
          tr.innerHTML = `
            <td style="padding: 0.75rem; color: var(--text-muted);">${act.date_created.split(' ')[0]}</td>
            <td style="padding: 0.75rem;"><strong>${act.gre_number}</strong></td>
            <td style="padding: 0.75rem;">${act.recipient_name}</td>
            <td style="padding: 0.75rem;">${act.carrier_name}</td>
            <td style="padding: 0.75rem;">${act.doc_number}</td>
            <td style="padding: 0.75rem;"><span class="status-pill pill-success">${act.status === 'EMITIDO' ? 'Aceptado' : act.status}</span></td>
          `;
        }
        body.appendChild(tr);
      });
      return;
    } catch (e) {
      console.error(e);
    }
  }

  // Fallback to MOCK static history
  if (currentRole === 'carrier') {
    body.innerHTML = `
      <tr>
        <td style="padding: 0.75rem; color: var(--text-muted);">31/05/2026</td>
        <td style="padding: 0.75rem;"><strong>GRT-2026-004822</strong></td>
        <td style="padding: 0.75rem;">LABORATORIO HOFARM S.A.C.</td>
        <td style="padding: 0.75rem;">Carlos Mendoza • F4B-920</td>
        <td style="padding: 0.75rem;">2,450 Kg</td>
        <td style="padding: 0.75rem;"><span class="status-pill pill-success">Aceptado</span></td>
      </tr>
      <tr>
        <td style="padding: 0.75rem; color: var(--text-muted);">30/05/2026</td>
        <td style="padding: 0.75rem;"><strong>GRT-2026-004821</strong></td>
        <td style="padding: 0.75rem;">QUIMICA INDUSTRIAL ANDINA</td>
        <td style="padding: 0.75rem;">Jorge Vasquez • C2I-841</td>
        <td style="padding: 0.75rem;">4,120 Kg</td>
        <td style="padding: 0.75rem;"><span class="status-pill pill-success">Aceptado</span></td>
      </tr>
    `;
  } else {
    body.innerHTML = `
      <tr>
        <td style="padding: 0.75rem; color: var(--text-muted);">31/05/2026</td>
        <td style="padding: 0.75rem;"><strong>GRR-0049281</strong></td>
        <td style="padding: 0.75rem;">FARMACIAS DE TODOS S.A.C.</td>
        <td style="padding: 0.75rem;">TRANSAGUI CORP S.A.C.</td>
        <td style="padding: 0.75rem;">OC-2026-9281</td>
        <td style="padding: 0.75rem;"><span class="status-pill pill-success">Aceptado</span></td>
      </tr>
      <tr>
        <td style="padding: 0.75rem; color: var(--text-muted);">31/05/2026</td>
        <td style="padding: 0.75rem;"><strong>GRR-0049279</strong></td>
        <td style="padding: 0.75rem;">DIFARMA S.A.</td>
        <td style="padding: 0.75rem;">TRANSAGUI CORP S.A.C.</td>
        <td style="padding: 0.75rem;">FAC-0004829</td>
        <td style="padding: 0.75rem;"><span class="status-pill pill-success">Aceptado</span></td>
      </tr>
    `;
  }
}

// 4. INTEGRATIONS ECOSYSTEM CARD RENDERER
function renderIntegrationsPanel() {
  const container = document.getElementById('integrations-cards-grid');
  
  if (currentRole === 'carrier') {
    document.getElementById('integrations-panel-title').textContent = 'Ecosistema de Integraciones y APIs para Transportistas';
    document.getElementById('integrations-panel-intro').textContent = 'Para empresas logísticas como Transagui Corp, la plataforma automatiza la recepción de datos y la emisión mediante integraciones críticas:';
    
    container.innerHTML = `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
        <div style="width: 42px; height: 42px; background: rgba(59, 130, 246, 0.1); color: var(--primary); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h3 style="font-family: var(--font-title); color: #fff; font-size: 1.1rem;">SUNAT (SEE API)</h3>
        <p style="font-size: 0.8rem;">Emisión en tiempo real de la **Guía de Remisión Electrónica Transportista (GRT)**. Firma digital automática, validación de licencias y devolución del CDR oficial.</p>
        <span class="status-pill pill-success" style="align-self: flex-start; margin-top: auto;">Conexión Activa</span>
      </div>

      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
        <div style="width: 42px; height: 42px; background: rgba(139, 92, 246, 0.1); color: var(--secondary); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        </div>
        <h3 style="font-family: var(--font-title); color: #fff; font-size: 1.1rem;">Sistemas de Flota & ERP</h3>
        <p style="font-size: 0.8rem;">Enlace directo con el ERP de la transportista para saber al instante qué camiones, tractos, placas y conductores están libres y programados en el día, autocompletando el conductor óptimo.</p>
        <span class="status-pill pill-success" style="align-self: flex-start; margin-top: auto;">Sincronizado</span>
      </div>
    `;
  } else {
    document.getElementById('integrations-panel-title').textContent = 'Ecosistema de Integraciones y APIs para Generadores de Carga / Laboratorios';
    document.getElementById('integrations-panel-intro').textContent = 'Para empresas que fabrican o venden productos como Laboratorio Hofarm, la plataforma conecta la toma de pedidos comerciales con almacén:';
    
    container.innerHTML = `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
        <div style="width: 42px; height: 42px; background: rgba(16, 185, 129, 0.1); color: var(--success); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h3 style="font-family: var(--font-title); color: #fff; font-size: 1.1rem;">ERP e Inventarios (SAP, Odoo)</h3>
        <p style="font-size: 0.8rem;">Conexión directa para leer las facturas aprobadas u órdenes de despacho generadas. Al escanear el PDF, el sistema descarga el inventario y autocompleta la guía en base a la orden de almacén.</p>
        <span class="status-pill pill-success" style="align-self: flex-start; margin-top: auto;">Odoo/SAP Link Activo</span>
      </div>

      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
        <div style="width: 42px; height: 42px; background: rgba(59, 130, 246, 0.1); color: var(--primary); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h3 style="font-family: var(--font-title); color: #fff; font-size: 1.1rem;">SUNAT Remitente (GRR)</h3>
        <p style="font-size: 0.8rem;">Firma digital y despacho de la **Guía de Remisión Electrónica Remitente (GRR)**. Sube de inmediato los catálogos y códigos de productos requeridos por SUNAT.</p>
        <span class="status-pill pill-success" style="align-self: flex-start; margin-top: auto;">Conectado a SUNAT</span>
      </div>
    `;
  }
}

// 5. OCR INTERACTIVE MOCK SCAN PLAYGROUND
function simulateScan(type) {
  clearAllActiveIntervals();
  activeData = mockScanData[type];
  
  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('samples-panel').style.display = 'none';
  document.getElementById('success-screen').style.display = 'none';
  
  const playground = document.getElementById('scan-playground');
  playground.style.display = 'flex';
  
  const itemsFormBody = document.getElementById('form-items-body');
  if (itemsFormBody) itemsFormBody.innerHTML = '';

  const progressBg = document.getElementById('scan-progress-area');
  const progressBar = document.getElementById('progress-bar');
  const scanPercent = document.getElementById('scan-percent');
  const scanLabel = document.getElementById('scan-status-label');
  const laserLine = document.getElementById('laser-line');
  
  progressBg.style.display = 'flex';
  progressBar.style.width = '0%';
  scanPercent.textContent = '0%';
  laserLine.style.display = 'block';
  
  document.getElementById('doc-sender-header').textContent = activeData.senderName;
  document.getElementById('doc-sender-ruc').textContent = `RUC: ${activeData.senderRuc}`;
  document.getElementById('doc-number-preview').textContent = activeData.docNumber;
  document.getElementById('doc-date-preview').textContent = activeData.date;
  document.getElementById('doc-recipient-preview').textContent = activeData.recipientName;
  document.getElementById('doc-recipient-ruc-preview').textContent = activeData.recipientRuc;
  document.getElementById('doc-start-preview').textContent = activeData.startPoint;
  document.getElementById('doc-end-preview').textContent = activeData.endPoint;
  
  if (currentRole === 'carrier') {
    document.getElementById('doc-type-title').textContent = 'GUIA DE REMISION REMITENTE';
    document.getElementById('doc-carrier-footer-preview').innerHTML = `
      <strong>Chofer Asignado:</strong> <span id="doc-driver-preview">PENDIENTE ASIGNAR</span><br>
      <strong>Vehículo (Placa):</strong> <span id="doc-plate-preview">PENDIENTE ASIGNAR</span>
    `;
  } else {
    document.getElementById('doc-type-title').textContent = 'ORDEN DE COMPRA COMERCIAL';
    document.getElementById('doc-carrier-footer-preview').innerHTML = `
      <strong>Courier Contratado:</strong> <span id="doc-driver-preview">PENDIENTE</span><br>
      <strong>Peso Total:</strong> <span>${activeData.weight} Kg</span>
    `;
  }
  
  const previewItemsBody = document.getElementById('doc-items-preview');
  previewItemsBody.innerHTML = '';
  activeData.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px dashed #cbd5e1';
    tr.innerHTML = `
      <td style="padding: 0.15rem 0;">${item.cant}</td>
      <td style="padding: 0.15rem 0;">${item.desc}</td>
      <td style="padding: 0.15rem 0; text-align: right;">${item.peso}</td>
    `;
    previewItemsBody.appendChild(tr);
  });
  
  let progress = 0;
  window.scanInterval = setInterval(() => {
    progress += 2;
    progressBar.style.width = `${progress}%`;
    scanPercent.textContent = `${progress}%`;
    
    if (progress < 25) {
      scanLabel.textContent = '🔍 Extrayendo cabecera y reconociendo estructura...';
    } else if (progress < 50) {
      scanLabel.textContent = '🤖 Procesando visión: Extrayendo RUCs y Direcciones...';
      
      document.getElementById('form-sender-ruc').value = activeData.senderRuc;
      document.getElementById('form-sender-name').value = activeData.senderName;
      document.getElementById('form-sender-doc').value = activeData.docNumber;
      document.getElementById('form-sender-date').value = activeData.date;
      document.getElementById('form-start-point').value = activeData.startPoint;
      document.getElementById('form-end-point').value = activeData.endPoint;
    } else if (progress < 75) {
      scanLabel.textContent = '📦 Digitalizando tabla de ítems y cantidades...';
      
      document.getElementById('form-recipient-ruc').value = activeData.recipientRuc;
      document.getElementById('form-recipient-name').value = activeData.recipientName;
      
      if (currentRole === 'sender' && itemsFormBody.children.length === 0) {
        activeData.items.forEach(item => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><input type="text" class="form-input" style="width: 100%; padding: 0.3rem;" value="${item.desc}"></td>
            <td><input type="number" class="form-input" style="width: 70px; padding: 0.3rem;" value="${item.cant}"></td>
            <td><input type="text" class="form-input" style="width: 70px; padding: 0.3rem;" value="${item.peso.includes('Kg') ? 'KG' : 'UNID'}"></td>
          `;
          itemsFormBody.appendChild(tr);
        });
      }
    } else if (progress < 95) {
      scanLabel.textContent = '🔗 Consultando base de datos interna para sugerencias...';
      
      if (currentRole === 'carrier') {
        document.getElementById('form-carrier-driver').value = activeData.driver;
        document.getElementById('form-carrier-license').value = activeData.license;
        document.getElementById('form-carrier-plate').value = activeData.plate;
        document.getElementById('form-carrier-weight').value = activeData.weight;
        
        document.getElementById('doc-driver-preview').textContent = activeData.driver;
        document.getElementById('doc-plate-preview').textContent = activeData.plate;
      } else {
        document.getElementById('form-carrier-name').value = activeData.carrierName;
        document.getElementById('form-carrier-ruc').value = activeData.carrierRuc;
        document.getElementById('form-carrier-weight').value = activeData.weight;
        
        document.getElementById('doc-driver-preview').textContent = activeData.carrierName;
      }
    } else if (progress >= 100) {
      clearInterval(window.scanInterval);
      scanLabel.textContent = '✓ Digitalización simulada completada.';
      scanLabel.style.color = 'var(--success)';
      laserLine.style.display = 'none';
      
      setTimeout(() => {
        progressBg.style.display = 'none';
        document.querySelectorAll('.form-input.highlighted').forEach(el => {
          el.style.animation = 'glowGently 1s infinite alternate';
        });
      }, 1000);
    }
  }, 40);
}

function resetFormFields() {
  document.getElementById('form-sender-ruc').value = '';
  document.getElementById('form-sender-name').value = '';
  document.getElementById('form-sender-doc').value = '';
  document.getElementById('form-sender-date').value = '';
  document.getElementById('form-start-point').value = '';
  document.getElementById('form-end-point').value = '';
  document.getElementById('form-recipient-ruc').value = '';
  document.getElementById('form-recipient-name').value = '';
  document.getElementById('form-carrier-weight').value = '';
  
  if (currentRole === 'carrier') {
    document.getElementById('form-carrier-driver').value = '';
    document.getElementById('form-carrier-license').value = '';
    document.getElementById('form-carrier-plate').value = '';
  } else {
    document.getElementById('form-carrier-name').value = '';
    document.getElementById('form-carrier-ruc').value = '';
    document.getElementById('form-items-body').innerHTML = '';
  }
}

function resetScan() {
  clearInterval(window.scanInterval);
  document.getElementById('scan-playground').style.display = 'none';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('drop-zone').style.display = 'flex';
  document.getElementById('samples-panel').style.display = 'flex';
  activeData = null;
}

// 6. EMIT DOCUMENT TO SERVER SQLITE (OR MOCK IF INACTIVE)
async function emitGRE() {
  const btn = document.getElementById('btn-submit-gre');
  
  let driverText = '';
  let licenseText = '';
  let plateText = '';
  let carrierNameText = '';
  let carrierRucText = '';
  
  if (currentRole === 'carrier') {
    driverText = document.getElementById('form-carrier-driver').value;
    plateText = document.getElementById('form-carrier-plate').value;
    licenseText = document.getElementById('form-carrier-license').value;
    if (!driverText || !plateText) {
      alert('⚠️ Ingresa Conductor y Placa de tracto para emitir la GRT.');
      return;
    }
    carrierNameText = 'TRANSAGUI CORP S.A.C.';
    carrierRucText = '20948271031';
  } else {
    carrierNameText = document.getElementById('form-carrier-name').value;
    carrierRucText = document.getElementById('form-carrier-ruc').value;
    if (!carrierNameText) {
      alert('⚠️ Especifica la empresa de transportes (Carrier) para emitir la GRR.');
      return;
    }
  }
  
  const emisorRuc = document.getElementById('form-sender-ruc').value || '20549281042';
  const emisorName = document.getElementById('form-sender-name').value || 'LABORATORIO HOFARM S.A.C.';
  const docNumRef = document.getElementById('form-sender-doc').value || 'OC-REF';
  const docDateRef = document.getElementById('form-sender-date').value || '31/05/2026';
  const startPoint = document.getElementById('form-start-point').value || 'Origen';
  const endPoint = document.getElementById('form-end-point').value || 'Destino';
  const destRuc = document.getElementById('form-recipient-ruc').value || '20104829103';
  const destName = document.getElementById('form-recipient-name').value || 'DIFARMA S.A.';
  const weight = document.getElementById('form-carrier-weight').value || '0';

  // Read items list from UI
  const items = [];
  if (currentRole === 'sender') {
    const rows = document.getElementById('form-items-body').querySelectorAll('tr');
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      if (inputs.length >= 3) {
        items.push({
          descripcion: inputs[0].value,
          cantidad: Number(inputs[1].value),
          unidad_medida: inputs[2].value
        });
      }
    });
  } else {
    // Default mock items for GRT preview
    items.push({ descripcion: 'Carga General Declarada', cantidad: 1, unidad_medida: 'KG' });
  }

  btn.disabled = true;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 5px;">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 2a10 10 0 0 1 10 10"></path>
    </svg>
    Firmando XML y Reportando a SUNAT...
  `;

  // IF LOCAL SERVER RUNNING: Post to SQLite!
  if (isServerActive) {
    try {
      const payload = {
        doc_type: currentRole,
        sender_ruc: emisorRuc,
        sender_name: emisorName,
        doc_number: docNumRef,
        doc_date: docDateRef,
        start_point: startPoint,
        end_point: endPoint,
        recipient_ruc: destRuc,
        recipient_name: destName,
        carrier_name: carrierNameText,
        carrier_ruc: carrierRucText,
        driver_name: driverText,
        driver_license: licenseText,
        vehicle_plate: plateText,
        weight_kg: weight,
        items: items
      };

      const response = await fetch(`${SERVER_URL}/api/emit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Error guardando guía en base de datos.");

      const result = await response.json();
      
      document.getElementById('scan-playground').style.display = 'none';
      showSuccessScreen(result.gre_number, emisorRuc, emisorName, destName, driverText, plateText, carrierNameText, weight, result.date);
      
      // Refresh persistent SQL history and Dashboard counters
      checkServerStatus();

      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Emitir Guía de Remisión (GRE)`;
      return;
    } catch (e) {
      console.error(e);
      alert("⚠️ Hubo un problema guardando en el servidor local. Se emitirá en modo local temporal.");
    }
  }

  // MOCK EMISSION FALLBACK
  setTimeout(() => {
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const newDocNum = currentRole === 'carrier' ? `GRT-2026-0${randomSuffix}` : `GRR-00${randomSuffix}`;
    const dateNow = new Date().toLocaleString();
    
    document.getElementById('scan-playground').style.display = 'none';
    showSuccessScreen(newDocNum, emisorRuc, emisorName, destName, driverText, plateText, carrierNameText, weight, dateNow);
    
    // Add row to offline UI table
    const historyBody = document.getElementById('history-table-body');
    const tr = document.createElement('tr');
    
    if (currentRole === 'carrier') {
      tr.innerHTML = `
        <td style="padding: 0.75rem; color: var(--text-muted);">31/05/2026</td>
        <td style="padding: 0.75rem;"><strong>${newDocNum}</strong></td>
        <td style="padding: 0.75rem;">${emisorName}</td>
        <td style="padding: 0.75rem;">${driverText} • ${plateText}</td>
        <td style="padding: 0.75rem;">${weight} Kg</td>
        <td style="padding: 0.75rem;"><span class="status-pill pill-success">Aceptado</span></td>
      `;
    } else {
      tr.innerHTML = `
        <td style="padding: 0.75rem; color: var(--text-muted);">31/05/2026</td>
        <td style="padding: 0.75rem;"><strong>${newDocNum}</strong></td>
        <td style="padding: 0.75rem;">${destName}</td>
        <td style="padding: 0.75rem;">${carrierNameText}</td>
        <td style="padding: 0.75rem;">${docNumRef}</td>
        <td style="padding: 0.75rem;"><span class="status-pill pill-success">Aceptado</span></td>
      `;
    }
    historyBody.insertBefore(tr, historyBody.firstChild);

    // Update Dashboard counter
    const counter = document.getElementById('metric-processed');
    if (counter) {
      const val = parseInt(counter.textContent.replace(',', ''));
      counter.textContent = (val + 1).toLocaleString();
    }
    
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Emitir Guía de Remisión (GRE)`;
  }, 2000);
}

// SUCCESS SCREEN POPULATOR
function showSuccessScreen(greNum, emisorRuc, emisorName, destName, driver, plate, carrier, weight, date) {
  const ticketDetails = document.getElementById('success-ticket-details');
  
  if (currentRole === 'carrier') {
    document.getElementById('success-screen-title').textContent = '¡Guía Transportista (GRT) Emitida!';
    document.getElementById('success-screen-desc').textContent = 'Se firmó el XML de transporte, reportando el viaje de rampa a la SUNAT de forma automatizada.';
    
    ticketDetails.innerHTML = `
      <div class="ticket-row">
        <span class="ticket-label">N° de Guía Emitida (GRT):</span>
        <span class="ticket-value">${greNum}</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Transportista Emisor:</span>
        <span class="ticket-value">${emisorName} (20948271031)</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">RUC Cliente Remitente:</span>
        <span class="ticket-value">${emisorRuc}</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Conductor / Placa:</span>
        <span class="ticket-value">${driver.split(' ')[0]} / ${plate}</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Peso Total Registrado:</span>
        <span class="ticket-value">${Number(weight).toLocaleString()} Kg</span>
      </div>
      <div class="ticket-row" style="margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.5rem;">
        <span class="ticket-label" style="color: var(--success);">Validación SUNAT:</span>
        <span class="ticket-value" style="color: var(--success); font-weight: 700;">APROBADO (CDR Aceptado)</span>
      </div>
    `;
  } else {
    document.getElementById('success-screen-title').textContent = '¡Guía Remitente (GRR) Emitida!';
    document.getElementById('success-screen-desc').textContent = 'Se generó la Guía Remitente, descontando el stock del almacén y notificando al carrier contratado.';
    
    ticketDetails.innerHTML = `
      <div class="ticket-row">
        <span class="ticket-label">N° de Guía Emitida (GRR):</span>
        <span class="ticket-value">${greNum}</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Empresa Emisora:</span>
        <span class="ticket-value">${emisorName} (${emisorRuc})</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Destinatario Final:</span>
        <span class="ticket-value">${destName}</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Carrier Contratado:</span>
        <span class="ticket-value">${carrier}</span>
      </div>
      <div class="ticket-row">
        <span class="ticket-label">Peso Total Registrado:</span>
        <span class="ticket-value">${Number(weight).toLocaleString()} Kg</span>
      </div>
      <div class="ticket-row" style="margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.5rem;">
        <span class="ticket-label" style="color: var(--success);">Validación SUNAT:</span>
        <span class="ticket-value" style="color: var(--success); font-weight: 700;">REGISTRADO Y FIRMADO</span>
      </div>
    `;
  }
  
  document.getElementById('success-screen').style.display = 'flex';
}

// ON WINDOW LOAD INITIALIZER
window.onload = function() {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes glowGently { 
      0% { box-shadow: 0 0 2px rgba(139, 92, 246, 0.2); border-color: rgba(139, 92, 246, 0.4); } 
      100% { box-shadow: 0 0 8px rgba(139, 92, 246, 0.5); border-color: var(--secondary); } 
    }
  `;
  document.head.appendChild(style);

  // Initialize and check local backend
  checkServerStatus();
};
