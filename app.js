// ============================================================
// Apiari v1.2 — Gestione apiari, famiglie e visite apistiche
// Copyright (c) 2026 Lazzaro Serva - Centola
// Via Tasso, 28 – 84051 CENTOLA (SA) – Italia
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================

// ---------------------------------------------------------------
// Splash Screen — durata minima 3.2s, poi dissolvenza
// ---------------------------------------------------------------
const SPLASH_MIN_MS = 3200;
const __splashStart = Date.now();
function hideSplash() {
  const elapsed = Date.now() - __splashStart;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
  setTimeout(() => {
    const el = document.getElementById('splashScreen');
    if (!el) return;
    el.classList.add('hide');
    setTimeout(() => el.remove(), 650);
  }, wait);
}

const STORAGE_KEY = 'apiari_data_v1';

let apiari = [];
let famiglie = [];
let visite = [];
let settings = { operatore: '' };

let currentView = 'dashboard';
let currentApiarioId = null;
let currentFamigliaId = null;
let editingApiarioId = null;
let editingFamigliaId = null;
let editingVisitaId = null;
let currentFiltroStato = '';

let afFotoData = null;
let vfFotoData = null;

let starsValues = {};
let segValues = {};

let swRegistration = null;

// ---------------------------------------------------------------
// Util
// ---------------------------------------------------------------
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function daysBetween(dateStr, refStr) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date((refStr || todayStr()) + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ---------------------------------------------------------------
// Persistenza
// ---------------------------------------------------------------
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiari, famiglie, visite, settings }));
}
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.apiari) apiari = parsed.apiari;
    if (parsed.famiglie) famiglie = parsed.famiglie;
    if (parsed.visite) visite = parsed.visite;
    if (parsed.settings) settings = { ...settings, ...parsed.settings };
  } catch (e) { console.warn('[loadData] errore parsing:', e); }
}

// ---------------------------------------------------------------
// Logica apistica
// ---------------------------------------------------------------
function reginaColore(anno) {
  if (!anno) return null;
  const d = anno % 10;
  if (d === 1 || d === 6) return { nome: 'Bianco', hex: '#f5f5f5', border: '#bbb' };
  if (d === 2 || d === 7) return { nome: 'Giallo', hex: '#fdd835', border: '#c9a800' };
  if (d === 3 || d === 8) return { nome: 'Rosso', hex: '#e53935', border: '#b71c1c' };
  if (d === 4 || d === 9) return { nome: 'Verde', hex: '#43a047', border: '#1b5e20' };
  return { nome: 'Blu', hex: '#1e88e5', border: '#0d47a1' };
}
function ultimaVisitaOf(famigliaId) {
  const list = visite.filter(v => v.famigliaId === famigliaId).sort((a, b) => b.data.localeCompare(a.data));
  return list[0] || null;
}
function visitaCritica(v) {
  if (!v) return false;
  if (v.reginaVista === false) return true;
  if (v.scorteMiele != null && v.scorteMiele > 0 && v.scorteMiele <= 2) return true;
  if (v.patologie && (v.patologie.varroa || v.patologie.peste || v.patologie.nosema)) return true;
  return false;
}
function computeFamigliaStato(famigliaId) {
  const f = famiglie.find(x => x.id === famigliaId);
  if (!f) return 'grigio';
  if (f.stato !== 'attiva') return 'grigio';
  const ultima = ultimaVisitaOf(famigliaId);
  if (!ultima) return 'rosso';
  if (visitaCritica(ultima)) return 'rosso';
  const giorni = daysBetween(ultima.data);
  if (giorni <= 21) return 'verde';
  if (giorni <= 35) return 'giallo';
  return 'rosso';
}
function computeApiarioStato(apiarioId) {
  const ospitate = famiglie.filter(f => f.apiarioId === apiarioId && f.stato === 'attiva');
  if (!ospitate.length) return 'grigio';
  const stati = ospitate.map(f => computeFamigliaStato(f.id));
  if (stati.includes('rosso')) return 'rosso';
  if (stati.includes('giallo')) return 'giallo';
  return 'verde';
}
function statoLabel(s) {
  return { verde: 'OK', giallo: 'Da ricontrollare', rosso: 'Urgente', grigio: 'Nessuna attiva' }[s] || '';
}
function famigliaStatoLabel(stato) {
  return { attiva: 'Attiva', orfana: 'Orfana', unita: 'Unita', morta: 'Morta', venduta: 'Venduta' }[stato] || stato;
}

// ---------------------------------------------------------------
// Toast / Modali / Conferma
// ---------------------------------------------------------------
let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showConfirm(text, onConfirm) {
  document.getElementById('confirmText').textContent = text;
  openModal('modalConfirm');
  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.onclick = () => { closeModal('modalConfirm'); onConfirm(); };
}
document.getElementById('confirmCancelBtn').addEventListener('click', () => closeModal('modalConfirm'));

// ---------------------------------------------------------------
// Foto: compressione + preview
// ---------------------------------------------------------------
function compressImage(file, maxW = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function renderPhotoPreview(wrapId, dataUrl, onRemove) {
  const wrap = document.getElementById(wrapId);
  if (!dataUrl) { wrap.innerHTML = '<div class="photo-placeholder">📷 Nessuna foto</div>'; return; }
  wrap.innerHTML = `<div style="position:relative;margin-bottom:10px;">
    <img src="${dataUrl}" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px;">
    <button type="button" id="${wrapId}RemoveBtn" class="btn btn-sm btn-danger" style="position:absolute;top:8px;right:8px;">✕</button>
  </div>`;
  document.getElementById(wrapId + 'RemoveBtn').addEventListener('click', onRemove);
}

// ---------------------------------------------------------------
// Dettatura vocale
// ---------------------------------------------------------------
function setupDictation(btn) {
  const targetId = btn.dataset.target;
  const ta = document.getElementById(targetId);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.style.display = 'none'; return; }
  let rec = null, recording = false, baseText = '';
  btn.addEventListener('click', () => {
    if (!recording) {
      rec = new SR();
      rec.lang = 'it-IT'; rec.continuous = true; rec.interimResults = true;
      baseText = ta.value ? ta.value + ' ' : '';
      rec.onresult = e => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t + ' '; else interim += t;
        }
        if (final) baseText += final;
        ta.value = baseText + interim;
      };
      rec.onend = () => { if (recording) rec.start(); };
      rec.onerror = e => { if (e.error !== 'no-speech') { recording = false; btn.classList.remove('recording'); } };
      rec.start(); recording = true; btn.classList.add('recording');
    } else {
      recording = false;
      if (rec) { rec.onend = null; rec.stop(); }
      btn.classList.remove('recording');
    }
  });
}

// ---------------------------------------------------------------
// Navigazione viste
// ---------------------------------------------------------------
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const fab = document.getElementById('fab');
  if (view === 'apiari' || view === 'famiglie') fab.classList.remove('hidden');
  else fab.classList.add('hidden');
  if (view === 'dashboard') renderDashboard();
  if (view === 'apiari') renderApiariList();
  if (view === 'famiglie') renderFamiglieList();
}
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

document.getElementById('fab').addEventListener('click', () => {
  if (currentView === 'apiari') openApiarioForm(null);
  else if (currentView === 'famiglie') {
    if (!apiari.length) { toast('Crea prima almeno un apiario'); return; }
    openFamigliaForm(null, null);
  }
});

// ---------------------------------------------------------------
// Select apiari condivisi
// ---------------------------------------------------------------
function refreshApiarioSelects() {
  const sorted = apiari.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  ['ffApiario', 'spNuovoApiario'].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = sorted.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
    if (sorted.some(a => a.id === prev)) sel.value = prev;
  });
  const filterSel = document.getElementById('filterApiario');
  const prevF = filterSel.value;
  filterSel.innerHTML = '<option value="">Tutti gli apiari</option>' +
    sorted.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  filterSel.value = prevF;
}

// ---------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------
function renderDashboard() {
  document.getElementById('statApiari').textContent = apiari.length;
  const attive = famiglie.filter(f => f.stato === 'attiva');
  document.getElementById('statFamiglie').textContent = attive.length;
  const critiche = attive.filter(f => computeFamigliaStato(f.id) === 'rosso');
  document.getElementById('statCritiche').textContent = critiche.length;
  document.getElementById('statVisite30').textContent = visite.filter(v => daysBetween(v.data) <= 30).length;

  const dashCritiche = document.getElementById('dashCritiche');
  if (!critiche.length) {
    dashCritiche.innerHTML = '<div class="empty-hint">Nessuna situazione critica al momento 🎉</div>';
  } else {
    dashCritiche.innerHTML = critiche.map(f => {
      const a = apiari.find(x => x.id === f.apiarioId);
      const ultima = ultimaVisitaOf(f.id);
      const sub = ultima ? `${daysBetween(ultima.data)} giorni dall'ultima visita` : 'Mai visitata';
      return `<div class="mini-item" data-fam="${f.id}"><span class="mi-txt"><strong>${esc(f.codice)}</strong> — ${esc(a ? a.nome : '—')}<br><span style="color:var(--danger);font-weight:700;">${sub}</span></span><span class="dot rosso"></span></div>`;
    }).join('');
    dashCritiche.querySelectorAll('.mini-item').forEach(el => el.addEventListener('click', () => openFamigliaDetail(el.dataset.fam)));
  }

  const dashApiari = document.getElementById('dashApiari');
  if (!apiari.length) {
    dashApiari.innerHTML = '<div class="empty-hint">Nessun apiario creato. Vai su "Apiari" per aggiungerne uno.</div>';
  } else {
    dashApiari.innerHTML = apiari.map(a => apiarioCardHTML(a)).join('');
    dashApiari.querySelectorAll('.item-card').forEach(el => el.addEventListener('click', () => openApiarioDetail(el.dataset.id)));
  }

  const recenti = visite.slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
  const dashVisiteRecenti = document.getElementById('dashVisiteRecenti');
  if (!recenti.length) {
    dashVisiteRecenti.innerHTML = '<div class="empty-hint">Nessuna visita ancora registrata.</div>';
  } else {
    dashVisiteRecenti.innerHTML = recenti.map(v => {
      const f = famiglie.find(x => x.id === v.famigliaId);
      const a = f ? apiari.find(x => x.id === f.apiarioId) : null;
      return `<div class="mini-item" data-fam="${v.famigliaId}"><span class="mi-txt"><strong>${esc(f ? f.codice : '—')}</strong> — ${esc(a ? a.nome : '—')}</span><span class="mi-date">${fmtDate(v.data)}</span></div>`;
    }).join('');
    dashVisiteRecenti.querySelectorAll('.mini-item').forEach(el => el.addEventListener('click', () => openFamigliaDetail(el.dataset.fam)));
  }
}

function apiarioCardHTML(a) {
  const stato = computeApiarioStato(a.id);
  const nFam = famiglie.filter(f => f.apiarioId === a.id && f.stato === 'attiva').length;
  return `<div class="item-card" data-id="${a.id}">
    <div class="ic-icon">📍</div>
    <div class="ic-body">
      <div class="ic-title">${esc(a.nome)}</div>
      <div class="ic-sub">${nFam} famigli${nFam === 1 ? 'a' : 'e'} ospitat${nFam === 1 ? 'a' : 'e'}</div>
    </div>
    <div class="ic-right"><span class="badge ${stato}"><span class="dot ${stato}"></span>${statoLabel(stato)}</span></div>
  </div>`;
}

// ---------------------------------------------------------------
// APIARI — lista
// ---------------------------------------------------------------
function renderApiariList() {
  const q = (document.getElementById('searchApiari').value || '').toLowerCase().trim();
  const list = apiari.filter(a => !q || a.nome.toLowerCase().includes(q));
  const el = document.getElementById('apiariList');
  if (!apiari.length) {
    el.innerHTML = '<div class="empty-hint">Nessun apiario. Tocca ＋ per crearne uno.</div>';
    return;
  }
  if (!list.length) { el.innerHTML = '<div class="empty-hint">Nessun risultato.</div>'; return; }
  el.innerHTML = list.map(a => apiarioCardHTML(a)).join('');
  el.querySelectorAll('.item-card').forEach(card => card.addEventListener('click', () => openApiarioDetail(card.dataset.id)));
}
document.getElementById('searchApiari').addEventListener('input', renderApiariList);

// ---------------------------------------------------------------
// APIARIO — dettaglio
// ---------------------------------------------------------------
function openApiarioDetail(id) {
  currentApiarioId = id;
  const a = apiari.find(x => x.id === id);
  if (!a) return;
  document.getElementById('adTitle').textContent = a.nome;
  const ospitate = famiglie.filter(f => f.apiarioId === id);
  const mapsLink = (a.lat && a.lng) ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(a.lat)},${encodeURIComponent(a.lng)}" target="_blank" rel="noopener">${esc(a.lat)}, ${esc(a.lng)} 🗺️</a>` : '—';

  document.getElementById('adBody').innerHTML = `
    ${a.foto ? `<img class="detail-photo" src="${a.foto}">` : ''}
    <div class="info-row"><div class="ir-k">Coordinate</div><div class="ir-v">${mapsLink}</div></div>
    <div class="info-row"><div class="ir-k">Accesso</div><div class="ir-v">${esc(a.accesso) || '—'}</div></div>
    <div class="info-row"><div class="ir-k">Flora / fonti</div><div class="ir-v">${esc(a.flora) || '—'}</div></div>
    <div class="info-row"><div class="ir-k">Note</div><div class="ir-v">${esc(a.note) || '—'}</div></div>
    <div class="dash-block" style="margin-top:16px;">
      <h3>🐝 Famiglie ospitate (${ospitate.length})</h3>
      <div class="card-list" id="adFamiglieList"></div>
    </div>
    <button class="btn btn-ghost btn-block" id="adCumulBtn" style="margin-top:6px;">📋 Trattamento cumulato per tutte le famiglie</button>
    <button class="btn btn-danger btn-block" id="adDeleteBtnInline" style="margin-top:10px;">🗑️ Elimina apiario</button>
  `;

  const listEl = document.getElementById('adFamiglieList');
  if (!ospitate.length) {
    listEl.innerHTML = '<div class="empty-hint">Nessuna famiglia ospitata qui.</div>';
  } else {
    listEl.innerHTML = ospitate.map(f => famigliaCardHTML(f)).join('');
    listEl.querySelectorAll('.item-card').forEach(card => card.addEventListener('click', () => openFamigliaDetail(card.dataset.id)));
  }

  document.getElementById('adCumulBtn').addEventListener('click', () => registraTrattamentoCumulato(id));
  document.getElementById('adDeleteBtnInline').addEventListener('click', () => eliminaApiario(id));

  openModal('modalApiarioDetail');
}
document.getElementById('closeApiarioDetail').addEventListener('click', () => closeModal('modalApiarioDetail'));
document.getElementById('adEditBtn').addEventListener('click', () => { closeModal('modalApiarioDetail'); openApiarioForm(currentApiarioId); });
document.getElementById('adAddFamigliaBtn').addEventListener('click', () => { closeModal('modalApiarioDetail'); openFamigliaForm(null, currentApiarioId); });

function registraTrattamentoCumulato(apiarioId) {
  const ospitateAttive = famiglie.filter(f => f.apiarioId === apiarioId && f.stato === 'attiva');
  if (!ospitateAttive.length) { toast('Nessuna famiglia attiva in questo apiario'); return; }
  const testo = window.prompt(`Registra un trattamento/nota per tutte le ${ospitateAttive.length} famiglie attive di questo apiario:`);
  if (testo === null || !testo.trim()) return;
  const oggi = todayStr();
  ospitateAttive.forEach(f => {
    visite.push({
      id: uuid(), famigliaId: f.id, apiarioId: apiarioId, data: oggi,
      meteo: null, operatore: settings.operatore || '', tipo: 'cumulato',
      reginaVista: null, covataFresca: null, celleReali: null, forza: null,
      scorteMiele: null, scortePolline: null, temperamento: null,
      patologie: {}, trattamenti: testo.trim(), melariPos: 0, melariRit: 0, kgRaccolti: 0,
      note: 'Trattamento cumulato registrato per l\'intero apiario.', foto: null,
      creato: new Date().toISOString()
    });
  });
  saveData();
  toast(`Trattamento registrato per ${ospitateAttive.length} famiglie`);
  openApiarioDetail(apiarioId);
  renderDashboard();
}

function eliminaApiario(id) {
  const ospitate = famiglie.filter(f => f.apiarioId === id);
  if (ospitate.length) { toast('Sposta o elimina prima le famiglie ospitate qui'); return; }
  showConfirm('Eliminare definitivamente questo apiario?', () => {
    apiari = apiari.filter(a => a.id !== id);
    saveData();
    closeModal('modalApiarioDetail');
    refreshApiarioSelects();
    renderAll();
    toast('Apiario eliminato');
  });
}

// ---------------------------------------------------------------
// APIARIO — form
// ---------------------------------------------------------------
function openApiarioForm(id) {
  editingApiarioId = id;
  const a = id ? apiari.find(x => x.id === id) : null;
  document.getElementById('apiarioFormTitle').textContent = a ? 'Modifica apiario' : 'Nuovo apiario';
  document.getElementById('afNome').value = a?.nome || '';
  document.getElementById('afLat').value = a?.lat || '';
  document.getElementById('afLng').value = a?.lng || '';
  document.getElementById('afAccesso').value = a?.accesso || '';
  document.getElementById('afFlora').value = a?.flora || '';
  document.getElementById('afNote').value = a?.note || '';
  afFotoData = a?.foto || null;
  renderPhotoPreview('afFotoPreviewWrap', afFotoData, () => { afFotoData = null; renderPhotoPreview('afFotoPreviewWrap', null); });
  document.getElementById('afFoto').value = '';
  openModal('modalApiarioForm');
}
document.getElementById('closeApiarioForm').addEventListener('click', () => closeModal('modalApiarioForm'));
document.getElementById('cancelApiarioForm').addEventListener('click', () => closeModal('modalApiarioForm'));

document.getElementById('afFoto').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    afFotoData = await compressImage(f);
    renderPhotoPreview('afFotoPreviewWrap', afFotoData, () => { afFotoData = null; renderPhotoPreview('afFotoPreviewWrap', null); });
  } catch { toast('Errore nella lettura della foto'); }
});

document.getElementById('btnGeoloc').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Geolocalizzazione non supportata'); return; }
  toast('Rilevamento posizione in corso...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('afLat').value = pos.coords.latitude.toFixed(5);
      document.getElementById('afLng').value = pos.coords.longitude.toFixed(5);
      toast('Posizione rilevata');
    },
    () => toast('Impossibile rilevare la posizione'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

document.getElementById('saveApiarioForm').addEventListener('click', () => {
  const nome = document.getElementById('afNome').value.trim();
  if (!nome) { toast('Inserisci il nome della postazione'); return; }
  let obj;
  if (editingApiarioId) obj = apiari.find(x => x.id === editingApiarioId);
  else { obj = { id: uuid(), creato: new Date().toISOString() }; apiari.push(obj); }
  obj.nome = nome;
  obj.lat = document.getElementById('afLat').value.trim();
  obj.lng = document.getElementById('afLng').value.trim();
  obj.accesso = document.getElementById('afAccesso').value.trim();
  obj.flora = document.getElementById('afFlora').value.trim();
  obj.note = document.getElementById('afNote').value.trim();
  obj.foto = afFotoData;
  obj.aggiornato = new Date().toISOString();
  saveData();
  refreshApiarioSelects();
  closeModal('modalApiarioForm');
  toast('Apiario salvato');
  renderAll();
});

// ---------------------------------------------------------------
// FAMIGLIE — lista
// ---------------------------------------------------------------
function famigliaCardHTML(f) {
  const a = apiari.find(x => x.id === f.apiarioId);
  const stato = computeFamigliaStato(f.id);
  const rc = reginaColore(f.reginaAnno);
  return `<div class="item-card" data-id="${f.id}">
    <div class="ic-icon">🐝</div>
    <div class="ic-body">
      <div class="ic-title">${esc(f.codice)}</div>
      <div class="ic-sub">${esc(a ? a.nome : '—')} · ${famigliaStatoLabel(f.stato)}${rc ? ' · Regina ' + rc.nome : ''}</div>
    </div>
    <div class="ic-right"><span class="badge ${stato}"><span class="dot ${stato}"></span>${statoLabel(stato)}</span></div>
  </div>`;
}
function renderFamiglieList() {
  const q = (document.getElementById('searchFamiglie').value || '').toLowerCase().trim();
  const apiarioFiltro = document.getElementById('filterApiario').value;
  let list = famiglie.filter(f =>
    (!q || f.codice.toLowerCase().includes(q) || (f.note || '').toLowerCase().includes(q)) &&
    (!apiarioFiltro || f.apiarioId === apiarioFiltro) &&
    (!currentFiltroStato || f.stato === currentFiltroStato)
  );
  const el = document.getElementById('famiglieList');
  if (!famiglie.length) { el.innerHTML = '<div class="empty-hint">Nessuna famiglia. Tocca ＋ per crearne una.</div>'; return; }
  if (!list.length) { el.innerHTML = '<div class="empty-hint">Nessun risultato.</div>'; return; }
  el.innerHTML = list.map(f => famigliaCardHTML(f)).join('');
  el.querySelectorAll('.item-card').forEach(card => card.addEventListener('click', () => openFamigliaDetail(card.dataset.id)));
}
document.getElementById('searchFamiglie').addEventListener('input', renderFamiglieList);
document.getElementById('filterApiario').addEventListener('change', renderFamiglieList);
document.querySelectorAll('#filterStatoRow .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#filterStatoRow .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFiltroStato = chip.dataset.stato;
    renderFamiglieList();
  });
});

// ---------------------------------------------------------------
// FAMIGLIA — dettaglio
// ---------------------------------------------------------------
function openFamigliaDetail(id) {
  currentFamigliaId = id;
  const f = famiglie.find(x => x.id === id);
  if (!f) return;
  document.getElementById('fdTitle').textContent = f.codice;
  const a = apiari.find(x => x.id === f.apiarioId);
  const rc = reginaColore(f.reginaAnno);
  const stato = computeFamigliaStato(f.id);

  document.getElementById('fdBody').innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px;">
      <button class="btn btn-sm btn-secondary" id="fdEditBtnInline">✏️ Modifica</button>
      <button class="btn btn-sm btn-danger" id="fdDeleteBtnInline">🗑️ Elimina</button>
    </div>
    <div class="info-row"><div class="ir-k">Stato</div><div class="ir-v"><span class="badge ${stato}"><span class="dot ${stato}"></span>${statoLabel(stato)}</span> &nbsp; ${famigliaStatoLabel(f.stato)}</div></div>
    <div class="info-row"><div class="ir-k">Apiario attuale</div><div class="ir-v">${esc(a ? a.nome : '—')}</div></div>
    <div class="info-row"><div class="ir-k">Origine</div><div class="ir-v">${esc(originaLabel(f.origine))}</div></div>
    <div class="info-row"><div class="ir-k">Regina</div><div class="ir-v">${f.reginaAnno ? f.reginaAnno + (rc ? ' — colore ' + rc.nome : '') : '—'}${f.reginaNote ? '<br><span style="color:var(--text2);">' + esc(f.reginaNote) + '</span>' : ''}</div></div>
    <div class="info-row"><div class="ir-k">Note</div><div class="ir-v">${esc(f.note) || '—'}</div></div>
  `;
  document.getElementById('fdEditBtnInline').addEventListener('click', () => { closeModal('modalFamigliaDetail'); openFamigliaForm(id); });
  document.getElementById('fdDeleteBtnInline').addEventListener('click', () => eliminaFamiglia(id));

  renderFamigliaVisiteTab(id);
  renderFamigliaSpostamentiTab(f);

  openModal('modalFamigliaDetail');
}
function originaLabel(o) {
  return { sciame: 'Sciame', acquisto: 'Acquisto', scissione: 'Scissione', altro: 'Altro' }[o] || o || '—';
}
document.getElementById('closeFamigliaDetail').addEventListener('click', () => closeModal('modalFamigliaDetail'));

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('fdTabVisite').classList.toggle('hidden', btn.dataset.tab !== 'visite');
    document.getElementById('fdTabSpostamenti').classList.toggle('hidden', btn.dataset.tab !== 'spostamenti');
  });
});

function renderFamigliaVisiteTab(famigliaId) {
  const list = visite.filter(v => v.famigliaId === famigliaId).sort((a, b) => b.data.localeCompare(a.data));
  const el = document.getElementById('fdTabVisite');
  if (!list.length) { el.innerHTML = '<div class="empty-hint">Nessuna visita registrata.</div>'; return; }
  el.innerHTML = list.map(v => visitaRowHTML(v)).join('');
  el.querySelectorAll('.visita-row').forEach(row => row.addEventListener('click', () => openVisitaDetail(row.dataset.id)));
}
function visitaRowHTML(v) {
  const tags = [];
  if (v.tipo === 'cumulato') tags.push('<span class="tag">📋 Cumulata</span>');
  if (v.reginaVista === false) tags.push('<span class="tag danger">👑 Regina non vista</span>');
  if (v.reginaVista === true) tags.push('<span class="tag ok">👑 Regina vista</span>');
  if (v.patologie && (v.patologie.varroa || v.patologie.peste || v.patologie.nosema)) tags.push('<span class="tag danger">⚠️ Patologie</span>');
  if (v.scorteMiele != null && v.scorteMiele > 0 && v.scorteMiele <= 2) tags.push('<span class="tag danger">🍯 Scorte basse</span>');
  return `<div class="visita-row" data-id="${v.id}">
    <div class="vr-top"><span>${fmtDate(v.data)}</span><span>${v.forza != null ? v.forza + ' telaini' : ''}</span></div>
    <div style="font-size:12px;color:var(--text2);">${esc(v.operatore) || 'Operatore non specificato'}</div>
    <div class="vr-tags">${tags.join('')}</div>
  </div>`;
}
function renderFamigliaSpostamentiTab(f) {
  const list = (f.storicoSpostamenti || []).slice().sort((a, b) => b.data.localeCompare(a.data));
  const el = document.getElementById('fdTabSpostamenti');
  if (!list.length) { el.innerHTML = '<div class="empty-hint">Nessuno spostamento registrato.</div>'; return; }
  el.innerHTML = list.map(s => {
    const da = apiari.find(a => a.id === s.daApiarioId);
    const aa = apiari.find(a => a.id === s.aApiarioId);
    return `<div class="mini-item"><span class="mi-txt">${esc(da ? da.nome : '—')} → <strong>${esc(aa ? aa.nome : '—')}</strong>${s.motivo ? '<br><span style="color:var(--text2);">' + esc(s.motivo) + '</span>' : ''}</span><span class="mi-date">${fmtDate(s.data)}</span></div>`;
  }).join('');
}

function eliminaFamiglia(id) {
  showConfirm('Eliminare questa famiglia e tutto il suo storico visite?', () => {
    famiglie = famiglie.filter(f => f.id !== id);
    visite = visite.filter(v => v.famigliaId !== id);
    saveData();
    closeModal('modalFamigliaDetail');
    renderAll();
    toast('Famiglia eliminata');
  });
}

// ---------------------------------------------------------------
// FAMIGLIA — form
// ---------------------------------------------------------------
function suggestCodice() {
  let n = famiglie.length + 1;
  let code = 'FAM-' + String(n).padStart(3, '0');
  while (famiglie.some(f => f.codice === code)) { n++; code = 'FAM-' + String(n).padStart(3, '0'); }
  return code;
}
function openFamigliaForm(id, presetApiarioId) {
  editingFamigliaId = id;
  const f = id ? famiglie.find(x => x.id === id) : null;
  document.getElementById('ffFormTitle').textContent = f ? 'Modifica famiglia' : 'Nuova famiglia';
  refreshApiarioSelects();
  document.getElementById('ffCodice').value = f?.codice || suggestCodice();
  document.getElementById('ffApiario').value = f?.apiarioId || presetApiarioId || (apiari[0]?.id || '');
  document.getElementById('ffOrigine').value = f?.origine || 'sciame';
  document.getElementById('ffReginaAnno').value = f?.reginaAnno || new Date().getFullYear();
  document.getElementById('ffReginaNote').value = f?.reginaNote || '';
  document.getElementById('ffStato').value = f?.stato || 'attiva';
  document.getElementById('ffNote').value = f?.note || '';
  openModal('modalFamigliaForm');
}
document.getElementById('closeFamigliaForm').addEventListener('click', () => closeModal('modalFamigliaForm'));
document.getElementById('cancelFamigliaForm').addEventListener('click', () => closeModal('modalFamigliaForm'));

document.getElementById('saveFamigliaForm').addEventListener('click', () => {
  const codice = document.getElementById('ffCodice').value.trim();
  if (!codice) { toast('Inserisci un codice identificativo'); return; }
  const apiarioId = document.getElementById('ffApiario').value;
  if (!apiarioId) { toast('Crea prima un apiario'); return; }

  let obj;
  if (editingFamigliaId) {
    obj = famiglie.find(x => x.id === editingFamigliaId);
    if (obj.apiarioId !== apiarioId) {
      obj.storicoSpostamenti = obj.storicoSpostamenti || [];
      obj.storicoSpostamenti.push({ data: todayStr(), daApiarioId: obj.apiarioId, aApiarioId: apiarioId, motivo: 'Modifica scheda famiglia' });
      obj.apiarioId = apiarioId;
    }
  } else {
    obj = { id: uuid(), apiarioId, storicoSpostamenti: [], creato: new Date().toISOString() };
    famiglie.push(obj);
  }
  obj.codice = codice;
  obj.origine = document.getElementById('ffOrigine').value;
  obj.reginaAnno = parseInt(document.getElementById('ffReginaAnno').value) || null;
  obj.reginaNote = document.getElementById('ffReginaNote').value.trim();
  obj.stato = document.getElementById('ffStato').value;
  obj.note = document.getElementById('ffNote').value.trim();
  obj.aggiornato = new Date().toISOString();

  saveData();
  closeModal('modalFamigliaForm');
  toast('Famiglia salvata');
  renderAll();
});

// ---------------------------------------------------------------
// SPOSTA FAMIGLIA
// ---------------------------------------------------------------
document.getElementById('fdSpostaBtn').addEventListener('click', () => {
  refreshApiarioSelects();
  document.getElementById('spMotivo').value = '';
  openModal('modalSposta');
});
document.getElementById('closeSposta').addEventListener('click', () => closeModal('modalSposta'));
document.getElementById('cancelSposta').addEventListener('click', () => closeModal('modalSposta'));
document.getElementById('confirmSposta').addEventListener('click', () => {
  const f = famiglie.find(x => x.id === currentFamigliaId);
  const nuovoApiarioId = document.getElementById('spNuovoApiario').value;
  if (!nuovoApiarioId) { toast('Seleziona un apiario'); return; }
  if (nuovoApiarioId === f.apiarioId) { toast('La famiglia è già in questo apiario'); return; }
  const motivo = document.getElementById('spMotivo').value.trim() || 'Non specificato';
  f.storicoSpostamenti = f.storicoSpostamenti || [];
  f.storicoSpostamenti.push({ data: todayStr(), daApiarioId: f.apiarioId, aApiarioId: nuovoApiarioId, motivo });
  f.apiarioId = nuovoApiarioId;
  f.aggiornato = new Date().toISOString();
  saveData();
  closeModal('modalSposta');
  toast('Famiglia spostata');
  openFamigliaDetail(currentFamigliaId);
  renderDashboard();
});

// ---------------------------------------------------------------
// STELLINE E SEGMENTED CONTROL (form visita)
// ---------------------------------------------------------------
function setStars(target, val) {
  starsValues[target] = val;
  document.querySelectorAll(`.stars-input[data-target="${target}"] .star-btn`).forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.v) <= val);
  });
}
document.querySelectorAll('.stars-input').forEach(group => {
  const target = group.dataset.target;
  group.querySelectorAll('.star-btn').forEach(b => {
    b.addEventListener('click', () => setStars(target, parseInt(b.dataset.v)));
  });
});
function setSeg(groupId, val) {
  segValues[groupId] = val;
  document.querySelectorAll(`#${groupId} .seg-btn`).forEach(b => b.classList.toggle('active', b.dataset.val === val));
}
document.querySelectorAll('.seg-control').forEach(group => {
  group.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => setSeg(group.id, b.dataset.val)));
});

// ---------------------------------------------------------------
// VISITA — form
// ---------------------------------------------------------------
document.getElementById('fdVisitaBtn').addEventListener('click', () => openVisitaForm(currentFamigliaId, null));

function openVisitaForm(famigliaId, visitaId) {
  currentFamigliaId = famigliaId;
  editingVisitaId = visitaId || null;
  const v = visitaId ? visite.find(x => x.id === visitaId) : null;
  document.getElementById('vfTitle').textContent = v ? 'Modifica visita' : 'Nuova visita';
  document.getElementById('vfData').value = v?.data || todayStr();
  document.getElementById('vfMeteo').value = v?.meteo || 'soleggiato';
  document.getElementById('vfOperatore').value = v?.operatore || settings.operatore || '';
  document.getElementById('vfReginaVista').checked = v ? !!v.reginaVista : true;
  document.getElementById('vfCovataFresca').checked = v ? !!v.covataFresca : true;
  document.getElementById('vfCelleReali').value = v?.celleReali || 'nessuna';
  document.getElementById('vfForza').value = v?.forza ?? '';
  setStars('vfScorteMiele', v?.scorteMiele || 0);
  setStars('vfScortePolline', v?.scortePolline || 0);
  setSeg('vfTemperamento', v?.temperamento || 'normale');
  document.getElementById('vfVarroa').checked = !!v?.patologie?.varroa;
  document.getElementById('vfPeste').checked = !!v?.patologie?.peste;
  document.getElementById('vfNosema').checked = !!v?.patologie?.nosema;
  document.getElementById('vfPatologiaAltro').value = v?.patologie?.altro || '';
  document.getElementById('vfTrattamenti').value = v?.trattamenti || '';
  document.getElementById('vfMelariPos').value = v?.melariPos ?? '';
  document.getElementById('vfMelariRit').value = v?.melariRit ?? '';
  document.getElementById('vfKgRaccolti').value = v?.kgRaccolti ?? '';
  document.getElementById('vfNote').value = v?.note || '';
  vfFotoData = v?.foto || null;
  renderPhotoPreview('vfFotoPreviewWrap', vfFotoData, () => { vfFotoData = null; renderPhotoPreview('vfFotoPreviewWrap', null); });
  document.getElementById('vfFoto').value = '';
  closeModal('modalFamigliaDetail');
  openModal('modalVisitaForm');
}
document.getElementById('closeVisitaForm').addEventListener('click', () => { closeModal('modalVisitaForm'); openFamigliaDetail(currentFamigliaId); });
document.getElementById('cancelVisitaForm').addEventListener('click', () => { closeModal('modalVisitaForm'); openFamigliaDetail(currentFamigliaId); });

document.getElementById('vfFoto').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    vfFotoData = await compressImage(f);
    renderPhotoPreview('vfFotoPreviewWrap', vfFotoData, () => { vfFotoData = null; renderPhotoPreview('vfFotoPreviewWrap', null); });
  } catch { toast('Errore nella lettura della foto'); }
});

document.getElementById('saveVisitaForm').addEventListener('click', () => {
  const data = document.getElementById('vfData').value;
  if (!data) { toast('Inserisci la data della visita'); return; }
  const famiglia = famiglie.find(f => f.id === currentFamigliaId);
  if (!famiglia) return;

  let obj;
  if (editingVisitaId) obj = visite.find(x => x.id === editingVisitaId);
  else { obj = { id: uuid(), famigliaId: currentFamigliaId, apiarioId: famiglia.apiarioId, creato: new Date().toISOString() }; visite.push(obj); }

  obj.tipo = 'ispezione';
  obj.data = data;
  obj.meteo = document.getElementById('vfMeteo').value;
  obj.operatore = document.getElementById('vfOperatore').value.trim();
  obj.reginaVista = document.getElementById('vfReginaVista').checked;
  obj.covataFresca = document.getElementById('vfCovataFresca').checked;
  obj.celleReali = document.getElementById('vfCelleReali').value;
  obj.forza = document.getElementById('vfForza').value !== '' ? parseInt(document.getElementById('vfForza').value) : null;
  obj.scorteMiele = starsValues['vfScorteMiele'] || 0;
  obj.scortePolline = starsValues['vfScortePolline'] || 0;
  obj.temperamento = segValues['vfTemperamento'] || 'normale';
  obj.patologie = {
    varroa: document.getElementById('vfVarroa').checked,
    peste: document.getElementById('vfPeste').checked,
    nosema: document.getElementById('vfNosema').checked,
    altro: document.getElementById('vfPatologiaAltro').value.trim()
  };
  obj.trattamenti = document.getElementById('vfTrattamenti').value.trim();
  obj.melariPos = parseInt(document.getElementById('vfMelariPos').value) || 0;
  obj.melariRit = parseInt(document.getElementById('vfMelariRit').value) || 0;
  obj.kgRaccolti = parseFloat(document.getElementById('vfKgRaccolti').value) || 0;
  obj.note = document.getElementById('vfNote').value.trim();
  obj.foto = vfFotoData;

  saveData();
  closeModal('modalVisitaForm');
  toast('Visita registrata');
  openFamigliaDetail(currentFamigliaId);
  renderDashboard();
});

// ---------------------------------------------------------------
// VISITA — dettaglio
// ---------------------------------------------------------------
function openVisitaDetail(id) {
  const v = visite.find(x => x.id === id);
  if (!v) return;
  const f = famiglie.find(x => x.id === v.famigliaId);
  const a = apiari.find(x => x.id === v.apiarioId);
  const meteoLabel = { soleggiato: '☀️ Soleggiato', nuvoloso: '☁️ Nuvoloso', ventoso: '💨 Ventoso', piovoso: '🌧️ Piovoso' }[v.meteo] || '—';
  const celleLabel = { nessuna: 'Nessuna', emergenza: 'Emergenza', sciamatura: 'Sciamatura', sostituzione: 'Sostituzione' }[v.celleReali] || '—';
  const temperLabel = { docile: '😊 Docile', normale: '😐 Normale', aggressivo: '😠 Aggressivo' }[v.temperamento] || '—';
  const patologieTxt = v.patologie ? [
    v.patologie.varroa ? 'Varroa' : null, v.patologie.peste ? 'Peste' : null,
    v.patologie.nosema ? 'Nosema' : null, v.patologie.altro || null
  ].filter(Boolean).join(', ') : '';

  document.getElementById('vdBody').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
      <button class="btn btn-sm btn-secondary" id="vdEditBtnInline">✏️ Modifica</button>
    </div>
    ${v.foto ? `<img class="detail-photo" src="${v.foto}">` : ''}
    <div class="info-row"><div class="ir-k">Data</div><div class="ir-v">${fmtDate(v.data)}${v.tipo === 'cumulato' ? ' · Trattamento cumulato' : ''}</div></div>
    <div class="info-row"><div class="ir-k">Famiglia</div><div class="ir-v">${esc(f ? f.codice : '—')}</div></div>
    <div class="info-row"><div class="ir-k">Apiario</div><div class="ir-v">${esc(a ? a.nome : '—')}</div></div>
    ${v.meteo ? `<div class="info-row"><div class="ir-k">Meteo</div><div class="ir-v">${meteoLabel}</div></div>` : ''}
    <div class="info-row"><div class="ir-k">Operatore</div><div class="ir-v">${esc(v.operatore) || '—'}</div></div>
    ${v.reginaVista != null ? `<div class="info-row"><div class="ir-k">Regina</div><div class="ir-v">${v.reginaVista ? '👑 Vista' : '❌ Non vista'}${v.covataFresca ? ' · 🥚 Covata fresca' : ''}</div></div>` : ''}
    ${v.celleReali ? `<div class="info-row"><div class="ir-k">Celle reali</div><div class="ir-v">${celleLabel}</div></div>` : ''}
    ${v.forza != null ? `<div class="info-row"><div class="ir-k">Forza</div><div class="ir-v">${v.forza} telaini</div></div>` : ''}
    ${v.scorteMiele != null && v.scorteMiele > 0 ? `<div class="info-row"><div class="ir-k">Scorte miele</div><div class="ir-v">${'🍯'.repeat(v.scorteMiele)}</div></div>` : ''}
    ${v.scortePolline != null && v.scortePolline > 0 ? `<div class="info-row"><div class="ir-k">Scorte polline</div><div class="ir-v">${'🟡'.repeat(v.scortePolline)}</div></div>` : ''}
    ${v.temperamento ? `<div class="info-row"><div class="ir-k">Temperamento</div><div class="ir-v">${temperLabel}</div></div>` : ''}
    ${patologieTxt ? `<div class="info-row"><div class="ir-k">Patologie</div><div class="ir-v" style="color:var(--danger);font-weight:700;">${esc(patologieTxt)}</div></div>` : ''}
    ${v.trattamenti ? `<div class="info-row"><div class="ir-k">Trattamenti</div><div class="ir-v">${esc(v.trattamenti)}</div></div>` : ''}
    ${(v.melariPos || v.melariRit) ? `<div class="info-row"><div class="ir-k">Melari</div><div class="ir-v">Posizionati: ${v.melariPos || 0} · Ritirati: ${v.melariRit || 0}</div></div>` : ''}
    ${v.kgRaccolti ? `<div class="info-row"><div class="ir-k">Kg raccolti</div><div class="ir-v">${v.kgRaccolti} kg</div></div>` : ''}
    ${v.note ? `<div class="info-row"><div class="ir-k">Note</div><div class="ir-v">${esc(v.note)}</div></div>` : ''}
  `;
  document.getElementById('vdEditBtnInline').addEventListener('click', () => { closeModal('modalVisitaDetail'); openVisitaForm(v.famigliaId, v.id); });
  document.getElementById('vdDeleteBtn').onclick = () => {
    showConfirm('Eliminare questa visita?', () => {
      visite = visite.filter(x => x.id !== id);
      saveData();
      closeModal('modalVisitaDetail');
      openFamigliaDetail(v.famigliaId);
      renderDashboard();
      toast('Visita eliminata');
    });
  };
  openModal('modalVisitaDetail');
}
document.getElementById('closeVisitaDetail').addEventListener('click', () => closeModal('modalVisitaDetail'));

// ---------------------------------------------------------------
// IMPOSTAZIONI
// ---------------------------------------------------------------
document.getElementById('setOperatore').addEventListener('change', e => {
  settings.operatore = e.target.value.trim();
  saveData();
});

document.getElementById('btnExport').addEventListener('click', () => {
  const payload = { app: 'Apiari', version: '1.2', exportedAt: new Date().toISOString(), apiari, famiglie, visite, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const stamp = todayStr().replace(/-/g, '');
  triggerDownload(blob, `apiari-backup-${stamp}.json`);
  toast('Backup esportato');
});

document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());

let pendingImport = null;

document.getElementById('importFile').addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  Promise.all(files.map(f => f.text())).then(texts => {
    let combined = { apiari: [], famiglie: [], visite: [] };
    let errors = 0;
    texts.forEach(txt => {
      try {
        const parsed = JSON.parse(txt);
        if (parsed && Array.isArray(parsed.apiari) && Array.isArray(parsed.famiglie)) {
          combined.apiari.push(...parsed.apiari);
          combined.famiglie.push(...parsed.famiglie);
          combined.visite.push(...(parsed.visite || []));
        } else errors++;
      } catch { errors++; }
    });
    if (!combined.apiari.length && !combined.famiglie.length) {
      toast(errors ? 'File non valido o non riconosciuto' : 'Il file non contiene dati');
      return;
    }
    pendingImport = combined;
    document.getElementById('importChoiceInfo').textContent =
      `Il file selezionato contiene ${combined.apiari.length} apiari, ${combined.famiglie.length} famiglie e ${combined.visite.length} visite. Come vuoi procedere?`;
    openModal('modalImportChoice');
  });

  e.target.value = '';
});

document.getElementById('closeImportChoice').addEventListener('click', () => closeModal('modalImportChoice'));
document.getElementById('importCancelBtn').addEventListener('click', () => closeModal('modalImportChoice'));

document.getElementById('importAppendBtn').addEventListener('click', () => {
  if (!pendingImport) return;
  mergeImportData(pendingImport);
  closeModal('modalImportChoice');
});

document.getElementById('importReplaceBtn').addEventListener('click', () => {
  if (!pendingImport) return;
  closeModal('modalImportChoice');
  showConfirm('Sostituire TUTTI i dati attuali con quelli del file? L\'operazione non è reversibile.', () => {
    apiari = pendingImport.apiari || [];
    famiglie = pendingImport.famiglie || [];
    visite = pendingImport.visite || [];
    saveData();
    refreshApiarioSelects();
    renderAll();
    toast('Backup importato (sostituzione completa)');
  });
});

// Unisce apiari/famiglie/visite importati a quelli esistenti, rigenerando gli ID
// per evitare collisioni e ricollegando correttamente i riferimenti incrociati.
function mergeImportData(data) {
  const idMapApiari = {};
  const idMapFamiglie = {};

  const newApiari = (data.apiari || []).map(a => {
    const newId = uuid();
    idMapApiari[a.id] = newId;
    return { ...a, id: newId };
  });

  const newFamiglie = (data.famiglie || []).map(f => {
    const newId = uuid();
    idMapFamiglie[f.id] = newId;
    const newStorico = (f.storicoSpostamenti || []).map(s => ({
      ...s,
      daApiarioId: idMapApiari[s.daApiarioId] || s.daApiarioId,
      aApiarioId: idMapApiari[s.aApiarioId] || s.aApiarioId
    }));
    return { ...f, id: newId, apiarioId: idMapApiari[f.apiarioId] || f.apiarioId, storicoSpostamenti: newStorico };
  });

  const newVisite = (data.visite || []).map(v => ({
    ...v,
    id: uuid(),
    famigliaId: idMapFamiglie[v.famigliaId] || v.famigliaId,
    apiarioId: idMapApiari[v.apiarioId] || v.apiarioId
  }));

  apiari = apiari.concat(newApiari);
  famiglie = famiglie.concat(newFamiglie);
  visite = visite.concat(newVisite);
  saveData();
  refreshApiarioSelects();
  renderAll();
  pendingImport = null;
  toast(`Aggiunti ${newApiari.length} apiari, ${newFamiglie.length} famiglie e ${newVisite.length} visite`);
}

document.getElementById('btnClearCache').addEventListener('click', () => {
  showConfirm('Svuotare la cache e ricaricare l\'app? I dati salvati non verranno toccati.', async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) { /* silenzioso */ }
    window.location.reload();
  });
});

document.getElementById('btnResetData').addEventListener('click', () => {
  showConfirm('Cancellare TUTTI i dati (apiari, famiglie, visite)? L\'operazione non è reversibile.', () => {
    apiari = []; famiglie = []; visite = [];
    saveData();
    refreshApiarioSelects();
    renderAll();
    toast('Tutti i dati sono stati cancellati');
  });
});

// ---------------------------------------------------------------
// MANUALE / HELP
// ---------------------------------------------------------------
document.getElementById('helpBtn').addEventListener('click', () => openModal('modalHelp'));
document.getElementById('closeHelp').addEventListener('click', () => closeModal('modalHelp'));

// ---------------------------------------------------------------
// Render globale
// ---------------------------------------------------------------
function renderAll() {
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'apiari') renderApiariList();
  else if (currentView === 'famiglie') renderFamiglieList();
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function init() {
  loadData();
  document.getElementById('setOperatore').value = settings.operatore || '';
  refreshApiarioSelects();
  document.querySelectorAll('.dict-btn').forEach(setupDictation);
  renderDashboard();
  hideSplash();
}
init();

// ---------------------------------------------------------------
// Service Worker — cache offline + banner aggiornamento
// ---------------------------------------------------------------
function showUpdateBanner() { document.getElementById('updateBanner').classList.add('visible'); }
function hideUpdateBanner() { document.getElementById('updateBanner').classList.remove('visible'); }
document.getElementById('updateNowBtn').addEventListener('click', () => {
  if (swRegistration && swRegistration.waiting) swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
});
document.getElementById('updateDismissBtn').addEventListener('click', hideUpdateBanner);
navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(reg => {
      swRegistration = reg;
      if (reg.waiting) showUpdateBanner();
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    })
    .catch(() => {});
}
