// ==========================================
// Campus Virtual - Docentes Brown
// Frontend script.js (reconstruido)
// ==========================================

// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzm4PKtttlamu3mCWi6HRDkflThXS8Dx9UNMx3TIXc3q3MI_aDETFCthtyg6gGpoPnE9Q/exec";
const WHATSAPP_NUMBER = "5491153196358";

// --- CONSTANTES UI ---
const NEW_DOCS_DAYS_WINDOW = 6; // luz roja si hay docs en los últimos 6 días

// --- VARIABLES GLOBALES ---
let globalDocs = [];              // docs desde backend
let allDocentesCache = [];        // docentes simples cache
let allAppsCache = [];            // apps cache
let allStudentPublications = [];  // publicaciones estudiantes cache
let allStudentTutorials = [];     // tutoriales estudiantes cache

let currentEditingTallerId = null;
let currentEditingMaterialTallerId = null;
let selectedTallerIdForLink = null;

let userFavorites = [];           // array de IDs (strings) de favoritos
let talleresAdminCache = [];      // cache de talleres admin (para editar participantes/material)
let myTalleresCache = [];         // cache de talleres docente

// ==========================================
// BOOT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM Cargado. Iniciando sistema...");

  // 1) Eventos (siempre primero)
  setupEventListeners();

  // 2) Splash + sesión
  const splashScreen = document.getElementById('splash-screen');
  const appContainer = document.getElementById('app-container');

  setTimeout(() => {
    splashScreen?.classList.add('hidden');
    if (appContainer) appContainer.style.display = 'block';
    checkSession();
  }, 2000);
});

// ==========================================
// HELPERS GENERALES
// ==========================================
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

function postAction(action, payload = {}) {
  // CORS-safe: NO seteamos headers Content-Type
  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload })
  }).then(r => r.json());
}

function el(id) { return document.getElementById(id); }

function parseDate(dateInput) {
  if (!dateInput) return new Date(0);
  let str = String(dateInput).trim();

  // si viene con ISO
  if (str.includes('T')) str = str.split('T')[0];

  // dd/MM/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/').map(n => parseInt(n, 10));
    return new Date(yyyy, mm - 1, dd);
  }

  // yyyy-MM-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-').map(n => parseInt(n, 10));
    return new Date(yyyy, mm - 1, dd);
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function formatDateDisplay(dateInput) {
  const d = parseDate(dateInput);
  return d.toLocaleDateString('es-AR');
}

function ensureFavoritosOption() {
  const select = el('filter-cat');
  if (!select) return;

  const exists = Array.from(select.options).some(o => o.value === 'favoritos');
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = 'favoritos';
    opt.textContent = '⭐ Favoritos';
    // lo ponemos arriba (después del "Todas")
    if (select.options.length > 0) select.insertBefore(opt, select.options[1]);
    else select.appendChild(opt);
  }
}

// ==========================================
// EVENTOS UI
// ==========================================
function setupEventListeners() {
  // -------------------------
  // ADMIN: Talleres
  // -------------------------
  el('btn-admin-talleres')?.addEventListener('click', () => {
    el('modal-admin-list-talleres')?.classList.remove('hidden');
    loadAdminTalleresList();
  });

  el('btn-open-create-taller')?.addEventListener('click', () => {
    el('modal-admin-list-talleres')?.classList.add('hidden');
    el('modal-create-taller')?.classList.remove('hidden');

    el('form-create-taller')?.reset();
    const msg = el('taller-msg');
    if (msg) { msg.innerText = ""; msg.style.color = ""; msg.classList.add('hidden'); }
    const count = el('count-selected');
    if (count) count.innerText = "0";

    loadDocentesForSelection('docentes-checklist');
    // Si el HTML tiene checklist de docs para material, lo cargamos
    loadDocsForSelectionIfExists('docs-checklist');
  });

  el('form-create-taller')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const msg = el('taller-msg');
    if (msg) { msg.innerText = "Creando..."; msg.style.color = "var(--primary)"; msg.classList.remove('hidden'); }

    const selectedIds = Array.from(document.querySelectorAll('#docentes-checklist input:checked')).map(cb => cb.value);

    // Material (si existe el checklist)
    const materialIds = Array.from(document.querySelectorAll('#docs-checklist input:checked')).map(cb => cb.value);

    postAction('createTaller', {
      titulo: el('taller-titulo')?.value || "",
      fechaTaller: el('taller-fecha')?.value || "",
      invitados: selectedIds,
      materialIds: materialIds
    })
    .then(json => {
      if (json.result === 'success') {
        if (msg) { msg.innerText = "Listo."; msg.style.color = "green"; }
        setTimeout(() => {
          el('modal-create-taller')?.classList.add('hidden');
          el('modal-admin-list-talleres')?.classList.remove('hidden');
          loadAdminTalleresList();
        }, 900);
      } else {
        if (msg) { msg.innerText = json.message || "Error."; msg.style.color = "red"; }
      }
    })
    .catch(err => {
      console.error(err);
      if (msg) { msg.innerText = "Error de conexión."; msg.style.color = "red"; msg.classList.remove('hidden'); }
    });
  });

  el('btn-confirm-add-participants')?.addEventListener('click', () => {
    const msg = el('add-part-msg');
    if (msg) { msg.innerText = "Guardando cambios..."; msg.style.color = "var(--primary)"; msg.classList.remove('hidden'); }

    const newIds = Array.from(document.querySelectorAll('#add-docentes-checklist input:checked')).map(cb => cb.value);

    postAction('saveTallerParticipants', { tallerId: currentEditingTallerId, ids: newIds })
      .then(json => {
        if (json.result === 'success') {
          if (msg) { msg.innerText = "Lista actualizada."; msg.style.color = "green"; }
          setTimeout(() => {
            el('modal-add-participants')?.classList.add('hidden');
            el('modal-admin-list-talleres')?.classList.remove('hidden');
            loadAdminTalleresList();
          }, 900);
        } else {
          if (msg) { msg.innerText = "Error: " + (json.message || "No se pudo guardar."); msg.style.color = "red"; }
        }
      })
      .catch(err => {
        console.error(err);
        if (msg) { msg.innerText = "Error de conexión."; msg.style.color = "red"; }
      });
  });

  // Editar material (si existe UI)
  el('btn-confirm-material')?.addEventListener('click', () => {
    const msg = el('material-msg');
    if (msg) { msg.innerText = "Guardando material..."; msg.style.color = "var(--primary)"; msg.classList.remove('hidden'); }

    const materialIds = Array.from(document.querySelectorAll('#material-docs-checklist input:checked')).map(cb => cb.value);

    postAction('saveTallerMaterials', { tallerId: currentEditingMaterialTallerId, materialIds })
      .then(json => {
        if (json.result === 'success') {
          if (msg) { msg.innerText = "Material actualizado."; msg.style.color = "green"; }
          setTimeout(() => {
            el('modal-edit-material')?.classList.add('hidden');
            el('modal-admin-list-talleres')?.classList.remove('hidden');
            loadAdminTalleresList();
          }, 800);
        } else {
          if (msg) { msg.innerText = "Error: " + (json.message || "No se pudo guardar."); msg.style.color = "red"; }
        }
      })
      .catch(err => {
        console.error(err);
        if (msg) { msg.innerText = "Error de conexión."; msg.style.color = "red"; }
      });
  });

  // Link meet
  el('btn-save-link')?.addEventListener('click', () => {
    const link = el('meet-link-input')?.value || "";
    if (!link) return;

    postAction('updateTallerLink', { tallerId: selectedTallerIdForLink, link })
      .then(() => {
        el('modal-add-link')?.classList.add('hidden');
        loadAdminTalleresList();
      })
      .catch(console.error);
  });

  // -------------------------
  // DOCENTE: Documentación
  // -------------------------
  el('btn-view-docs')?.addEventListener('click', () => {
    el('modal-view-docs')?.classList.remove('hidden');

    const search = el('filter-search');
    if (search) search.value = "";

    ensureFavoritosOption();

    // Por defecto: Favoritos
    const filterCat = el('filter-cat');
    if (filterCat) filterCat.value = 'favoritos';

    // Al abrir, marcamos como visto (pero badge depende de últimos 6 días)
    localStorage.setItem('last_docs_view_date', new Date().toISOString());
    el('notification-badge')?.classList.add('hidden');

    // Si no tenemos docs cargados, los pedimos
    if (!globalDocs || globalDocs.length === 0) {
      refreshDocuments().then(() => applyFilters());
    } else {
      applyFilters();
    }
  });

  // filtros docs
  el('filter-search')?.addEventListener('keyup', applyFilters);
  el('filter-cat')?.addEventListener('change', applyFilters);

  // -------------------------
  // DOCENTE: Perfil
  // -------------------------
  el('btn-view-profile')?.addEventListener('click', () => {
    el('modal-profile')?.classList.remove('hidden');
    const user = safeJsonParse(sessionStorage.getItem('db_user'), null);
    if (!user) return;

    el('static-nombre').value = user.nombre || "";
    el('static-email').value = user.email || "";

    postAction('getProfile', { userId: user.id })
      .then(json => {
        if (json.result === 'success') {
          el('prof-dni').value = json.data.dni || "";
          el('prof-tel').value = json.data.telefono || "";
          el('prof-inst').value = json.data.institucion || "";
        }
      })
      .catch(console.error);
  });

  el('form-profile')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = safeJsonParse(sessionStorage.getItem('db_user'), null);
    if (!user) return;

    postAction('updateProfile', {
      userId: user.id,
      dni: el('prof-dni')?.value || "",
      telefono: el('prof-tel')?.value || "",
      institucion: el('prof-inst')?.value || ""
    })
    .then(json => {
      const pm = el('profile-msg');
      if (pm) {
        pm.classList.remove('hidden');
        pm.style.color = (json.result === 'success') ? 'green' : 'red';
        pm.innerText = json.message || "Listo.";
      }
    })
    .catch(err => {
      console.error(err);
      const pm = el('profile-msg');
      if (pm) { pm.classList.remove('hidden'); pm.style.color = 'red'; pm.innerText = "Error de conexión."; }
    });
  });

  // -------------------------
  // ADMIN: Subir documentación
  // -------------------------
  el('btn-admin-docs')?.addEventListener('click', () => el('modal-upload-docs')?.classList.remove('hidden'));

  el('form-upload-docs')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const msg = el('upload-msg');
    const fileInput = el('doc-file');
    const file = fileInput?.files?.[0];

    if (msg) {
      msg.classList.remove('hidden');
      msg.style.color = "var(--primary)";
      msg.innerText = "";
    }

    if (!file) {
      if (msg) { msg.style.color = "red"; msg.innerText = "Seleccioná un archivo antes de subir."; }
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerText : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Subiendo..."; }

    if (msg) msg.innerText = "Leyendo archivo...";

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = () => {
      const base64 = String(reader.result || "").split(',')[1];
      if (!base64) {
        if (msg) { msg.style.color = "red"; msg.innerText = "No se pudo leer el archivo."; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
        return;
      }

      if (msg) msg.innerText = "Subiendo a Drive...";

      postAction('uploadDocument', {
        categoria: el('doc-cat')?.value || "",
        numero: el('doc-num')?.value || "",
        titulo: el('doc-title')?.value || "",
        resumen: el('doc-desc')?.value || "",
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        fileData: base64
      })
      .then(json => {
        if (json.result === 'success') {
          if (msg) { msg.style.color = "green"; msg.innerText = json.message || "Documento subido correctamente."; }
          e.target.reset();
          // refrescar docs + badge de últimos 6 días
          refreshDocuments().then(() => checkNewDocumentsBadge());
        } else {
          if (msg) { msg.style.color = "red"; msg.innerText = json.message || "No se pudo subir el documento."; }
        }
      })
      .catch(err => {
        console.error(err);
        if (msg) { msg.style.color = "red"; msg.innerText = "Error de conexión al subir el documento."; }
      })
      .finally(() => {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
      });
    };

    reader.onerror = () => {
      if (msg) { msg.style.color = "red"; msg.innerText = "No se pudo leer el archivo."; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
    };
  });

  // -------------------------
  // Login / Registro / Logout
  // -------------------------
  el('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msgBox = el('login-message');
    if (msgBox) { msgBox.innerText = "Entrando..."; msgBox.style.color = ""; msgBox.classList.remove('hidden'); }

    postAction('login', {
      email: el('login-email')?.value || "",
      password: el('login-pass')?.value || ""
    })
    .then(json => {
      if (json.result === 'success') {
        sessionStorage.setItem('db_user', JSON.stringify(json.user));
        renderDashboard(json.user);
      } else {
        if (msgBox) { msgBox.innerText = json.message || "Credenciales incorrectas."; msgBox.style.color = "red"; }
      }
    })
    .catch(err => {
      console.error(err);
      if (msgBox) { msgBox.innerText = "Error de conexión."; msgBox.style.color = "red"; }
    });
  });

  el('logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('db_user');
    location.reload();
  });

  el('open-register-modal')?.addEventListener('click', (e) => {
    e.preventDefault();
    el('register-modal')?.classList.remove('hidden');
    el('register-form')?.classList.remove('hidden');
    el('register-form')?.reset();
    el('register-title')?.classList.remove('hidden');
    el('msg-exito-registro')?.classList.add('hidden');
    el('register-msg')?.classList.add('hidden');
  });

  el('register-form')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const p1 = el('reg-pass')?.value || "";
    const p2 = el('reg-pass-confirm')?.value || "";
    const msgBox = el('register-msg');

    if (p1 !== p2) {
      if (msgBox) { msgBox.innerText = "Las contraseñas no coinciden."; msgBox.style.color = "red"; msgBox.classList.remove('hidden'); }
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerText : "";
    if (btn) { btn.innerText = "Enviando solicitud..."; btn.disabled = true; }
    msgBox?.classList.add('hidden');

    postAction('register', {
      nombre: el('reg-nombre')?.value || "",
      email: el('reg-email')?.value || "",
      rol: el('reg-rol')?.value || "",
      password: p1
    })
    .then(json => {
      if (json.result === 'success') {
        el('register-form')?.classList.add('hidden');
        el('register-title')?.classList.add('hidden');
        el('msg-exito-registro')?.classList.remove('hidden');
      } else {
        if (msgBox) { msgBox.innerText = "Error: " + (json.message || "No se pudo registrar."); msgBox.style.color = "red"; msgBox.classList.remove('hidden'); }
        if (btn) { btn.innerText = originalText; btn.disabled = false; }
      }
    })
    .catch(err => {
      console.error(err);
      if (msgBox) { msgBox.innerText = "Error de conexión. Intente nuevamente."; msgBox.style.color = "red"; msgBox.classList.remove('hidden'); }
      if (btn) { btn.innerText = originalText; btn.disabled = false; }
    });
  });

  // -------------------------
  // Cerrar modales
  // -------------------------
  document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal')?.classList.add('hidden');
    });
  });

  // -------------------------
  // Whatsapp
  // -------------------------
  el('whatsapp-float')?.addEventListener('click', () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=Hola,%20tengo%20una%20consulta%20sobre%20el%20Campus.`, '_blank');
  });

  // -------------------------
  // Buscadores en checklists (si existen)
  // -------------------------
  el('search-docente-input')?.addEventListener('keyup', (e) => filterChecklist(e.target.value, 'docentes-checklist'));
  el('search-add-input')?.addEventListener('keyup', (e) => filterChecklist(e.target.value, 'add-docentes-checklist'));
  el('search-docs-input')?.addEventListener('keyup', (e) => filterDocsChecklist(e.target.value, 'docs-checklist'));
  el('search-material-input')?.addEventListener('keyup', (e) => filterDocsChecklist(e.target.value, 'material-docs-checklist'));

  // -------------------------
  // Apps / Estudiantes (si existe UI en tu HTML)
  // -------------------------
  // Estos listeners son opcionales; no rompen si el HTML no está.
  el('btn-view-apps')?.addEventListener('click', () => {
    el('modal-apps')?.classList.remove('hidden');
    loadApps();
  });

  el('form-create-app')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = el('app-msg');
    if (msg) { msg.classList.remove('hidden'); msg.style.color = "var(--primary)"; msg.innerText = "Guardando..."; }

    postAction('createApp', {
      nombre: el('app-nombre')?.value || "",
      enlace: el('app-enlace')?.value || "",
      funciones: el('app-funciones')?.value || ""
    })
    .then(json => {
      if (json.result === 'success') {
        if (msg) { msg.style.color = "green"; msg.innerText = json.message || "Aplicación guardada."; }
        e.target.reset();
        loadApps(true);
      } else {
        if (msg) { msg.style.color = "red"; msg.innerText = json.message || "No se pudo guardar."; }
      }
    })
    .catch(err => {
      console.error(err);
      if (msg) { msg.style.color = "red"; msg.innerText = "Error de conexión."; }
    });
  });

  el('btn-student-publications')?.addEventListener('click', () => {
    el('modal-students')?.classList.remove('hidden');
    setStudentTab('publicaciones');
    loadStudentPublications();
  });

  el('btn-student-tutorials')?.addEventListener('click', () => {
    el('modal-students')?.classList.remove('hidden');
    setStudentTab('tutoriales');
    loadStudentTutorials();
  });

  el('form-student-publication')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = el('student-msg');
    if (msg) { msg.classList.remove('hidden'); msg.style.color = "var(--primary)"; msg.innerText = "Guardando..."; }

    postAction('createStudentPublication', {
      titulo: el('pub-titulo')?.value || "",
      enlace: el('pub-enlace')?.value || "",
      descripcion: el('pub-desc')?.value || ""
    })
    .then(json => {
      if (json.result === 'success') {
        if (msg) { msg.style.color = "green"; msg.innerText = json.message || "Publicación guardada."; }
        e.target.reset();
        loadStudentPublications(true);
      } else {
        if (msg) { msg.style.color = "red"; msg.innerText = json.message || "No se pudo guardar."; }
      }
    })
    .catch(err => {
      console.error(err);
      if (msg) { msg.style.color = "red"; msg.innerText = "Error de conexión."; }
    });
  });

  el('form-student-tutorial')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = el('student-msg');
    if (msg) { msg.classList.remove('hidden'); msg.style.color = "var(--primary)"; msg.innerText = "Guardando..."; }

    postAction('createStudentTutorial', {
      titulo: el('tut-titulo')?.value || "",
      enlace: el('tut-enlace')?.value || "",
      descripcion: el('tut-desc')?.value || ""
    })
    .then(json => {
      if (json.result === 'success') {
        if (msg) { msg.style.color = "green"; msg.innerText = json.message || "Tutorial guardado."; }
        e.target.reset();
        loadStudentTutorials(true);
      } else {
        if (msg) { msg.style.color = "red"; msg.innerText = json.message || "No se pudo guardar."; }
      }
    })
    .catch(err => {
      console.error(err);
      if (msg) { msg.style.color = "red"; msg.innerText = "Error de conexión."; }
    });
  });
}

// ==========================================
// SESIÓN / DASH
// ==========================================
function checkSession() {
  const storedUser = sessionStorage.getItem('db_user');
  if (storedUser) renderDashboard(safeJsonParse(storedUser, null));
  else showLogin();
}

function showLogin() {
  el('login-view')?.classList.remove('hidden');
  el('dashboard-view')?.classList.add('hidden');
  el('main-header')?.classList.add('hidden');
  el('whatsapp-float')?.classList.add('hidden');
}

function renderDashboard(user) {
  if (!user) return showLogin();

  el('login-view')?.classList.add('hidden');
  el('dashboard-view')?.classList.remove('hidden');
  el('main-header')?.classList.remove('hidden');
  el('whatsapp-float')?.classList.remove('hidden');

  el('user-name-display').innerText = user.nombre || "";
  el('user-role-display').innerText = String(user.rol || "").toUpperCase();

  document.querySelectorAll('.role-dash').forEach(d => d.classList.add('hidden'));

  let dashId = `dash-${String(user.rol || '').toLowerCase()}`;
  if (String(user.rol || '').toLowerCase() === 'admin' || String(user.rol || '').toLowerCase() === 'administrador') {
    dashId = 'dash-administrador';
  }
  el(dashId)?.classList.remove('hidden');

  // Carga base por rol
  if (String(user.rol || '').toLowerCase() === 'docente') {
    postAction('getProfile', { userId: user.id })
      .then(json => {
        if (json.result === 'success') userFavorites = Array.isArray(json.data?.favoritos) ? json.data.favoritos.map(String) : [];
      })
      .finally(() => {
        refreshDocuments().then(() => checkNewDocumentsBadge());
        loadMyTalleres(user.id);
      });
  } else {
    // Admin también puede ver badge de docs recientes si quiere
    refreshDocuments().then(() => checkNewDocumentsBadge());
  }
}

// ==========================================
// DOCUMENTACIÓN
// ==========================================
function refreshDocuments() {
  return postAction('getDocuments')
    .then(json => {
      globalDocs = Array.isArray(json.data) ? json.data : [];
      return globalDocs;
    })
    .catch(err => {
      console.error(err);
      globalDocs = [];
      return globalDocs;
    });
}

function checkNewDocumentsBadge() {
  // Luz roja si hay docs cargados en los últimos 6 días.
  const badge = el('notification-badge');
  if (!badge) return;

  const now = new Date();
  const windowStart = new Date();
  windowStart.setDate(now.getDate() - NEW_DOCS_DAYS_WINDOW);

  const hasRecent = (globalDocs || []).some(d => parseDate(d.fecha) >= windowStart);
  if (hasRecent) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

function applyFilters() {
  const term = (el('filter-search')?.value || "").toLowerCase();
  const cat = el('filter-cat')?.value || "todos";

  let filtered = (globalDocs || []).filter(doc => {
    const t = String(doc.titulo || "").toLowerCase();
    const r = String(doc.resumen || "").toLowerCase();
    const matchesText = t.includes(term) || r.includes(term);
    return matchesText;
  });

  if (cat === 'favoritos') {
    filtered = filtered.filter(doc => userFavorites.includes(String(doc.id)));
  } else if (cat !== 'todos') {
    filtered = filtered.filter(doc => String(doc.categoria || "") === String(cat));
  }

  renderDocsList(filtered);
}

function renderDocsList(docs) {
  const container = el('docs-list-container');
  if (!container) return;

  if (!docs || docs.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No se encontraron documentos.</p></div>`;
    return;
  }

  // Orden: favoritos primero si estás en favoritos; sino por título
  const cat = el('filter-cat')?.value || "todos";
  const list = [...docs];

  if (cat !== 'favoritos') {
    list.sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || "")));
  }

  let html = '<ul>';
  list.forEach(doc => {
    const isFav = userFavorites.includes(String(doc.id));
    const heartClass = isFav ? 'fav-btn fav-active' : 'fav-btn';
    const heartSymbol = isFav ? '♥' : '♡';

    html += `
      <li class="doc-item">
        <div class="doc-info">
          <strong>${escapeHtml(doc.titulo || "")}</strong>
          <br>
          <small>(${escapeHtml(doc.numero || "S/N")} - ${escapeHtml(formatDateDisplay(doc.fecha))})</small>
          <br>
          <span class="badge">${escapeHtml(doc.categoria || "")}</span>
          <p>${escapeHtml(doc.resumen || "")}</p>
        </div>
        <div class="doc-actions">
          <button class="${heartClass}" onclick="toggleDocFavorite('${String(doc.id)}', this)" title="Marcar Favorito">${heartSymbol}</button>
          <a href="${String(doc.url || "#")}" target="_blank" class="btn-download">Ver PDF</a>
        </div>
      </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleDocFavorite(docId, btn) {
  const user = safeJsonParse(sessionStorage.getItem('db_user'), null);
  if (!user) return;

  // Optimistic UI
  const isActive = btn.classList.contains('fav-active');
  if (isActive) { btn.classList.remove('fav-active'); btn.innerHTML = '♡'; }
  else { btn.classList.add('fav-active'); btn.innerHTML = '♥'; }

  postAction('toggleFavorite', { userId: user.id, docId })
    .then(json => {
      if (json.result === 'success') {
        userFavorites = Array.isArray(json.favoritos) ? json.favoritos.map(String) : [];
        // si estamos en favoritos, refrescamos lista
        if ((el('filter-cat')?.value || "") === 'favoritos') applyFilters();
      }
    })
    .catch(err => {
      console.error(err);
      // revertimos si falla
      if (isActive) { btn.classList.add('fav-active'); btn.innerHTML = '♥'; }
      else { btn.classList.remove('fav-active'); btn.innerHTML = '♡'; }
    });
}

// ==========================================
// TALLERES
// ==========================================
function loadAdminTalleresList() {
  const container = el('admin-talleres-list');
  if (!container) return;

  container.innerHTML = '<p>Cargando talleres...</p>';

  postAction('getAllTalleres')
    .then(json => {
      const data = Array.isArray(json.data) ? json.data : [];
      talleresAdminCache = data;

      if (data.length === 0) {
        container.innerHTML = '<p>No hay talleres creados.</p>';
        return;
      }

      let html = '<ul class="taller-list">';
      data.forEach(t => {
        const invitadosCount = Array.isArray(t.invitados) ? t.invitados.length : 0;
        html += `
          <li class="taller-item">
            <div class="taller-info">
              <strong>${escapeHtml(t.titulo || "")}</strong> <small>(${escapeHtml(t.fechaTaller || "")})</small><br>
              <span style="font-size:0.85rem; color:#666;">Invitados: ${invitadosCount}</span>
              <div style="margin-top:5px;">
                ${t.link ? `<a href="${String(t.link)}" target="_blank" class="link-tag">Enlace Meet Activo</a>` : '<span class="no-link">Sin enlace</span>'}
              </div>
            </div>
            <div class="taller-actions">
              <button class="btn-sm" onclick="openAddParticipants(${Number(t.id)}, '${escapeQuotes(t.titulo || "")}')">👥 Asistentes</button>
              <button class="btn-sm btn-secondary" onclick="openAddLink(${Number(t.id)})">🔗 Link</button>
              ${el('modal-edit-material') ? `<button class="btn-sm" onclick="openEditMaterial(${Number(t.id)}, '${escapeQuotes(t.titulo || "")}')">📚 Material</button>` : ''}
            </div>
          </li>`;
      });
      html += '</ul>';
      container.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = '<p style="color:red;">Error cargando talleres.</p>';
    });
}

function escapeQuotes(s) {
  return String(s).replaceAll("'", "\\'").replaceAll('"', '\\"');
}

function loadDocentesForSelection(containerId) {
  const container = el(containerId);
  if (!container) return;

  container.innerHTML = '<p>Cargando lista...</p>';

  if (allDocentesCache.length > 0) {
    renderChecklist(allDocentesCache, containerId);
    return;
  }

  postAction('getAllDocentesSimple')
    .then(json => {
      allDocentesCache = Array.isArray(json.data) ? json.data : [];
      renderChecklist(allDocentesCache, containerId);
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = '<p style="color:red;">Error cargando docentes.</p>';
    });
}

function renderChecklist(list, containerId, preselectedIds = []) {
  const container = el(containerId);
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = "<p>No hay docentes registrados.</p>";
    return;
  }

  const pre = new Set((preselectedIds || []).map(String));

  let html = '';
  list.forEach(d => {
    const isChecked = pre.has(String(d.id)) ? 'checked' : '';
    html += `<label class="checklist-item"><input type="checkbox" value="${String(d.id)}" ${isChecked}> ${escapeHtml(d.nombre || "")} <small>(DNI: ${escapeHtml(d.dni || "S/D")})</small></label>`;
  });
  container.innerHTML = html;

  // contador solo para el create modal
  const countSpan = el('count-selected');
  if (containerId === 'docentes-checklist' && countSpan) {
    const updateCount = () => { countSpan.innerText = String(container.querySelectorAll('input:checked').length); };
    container.querySelectorAll('input').forEach(cb => cb.addEventListener('change', updateCount));
    updateCount();
  }
}

function openAddParticipants(id, titulo) {
  currentEditingTallerId = id;

  el('modal-admin-list-talleres')?.classList.add('hidden');
  el('modal-add-participants')?.classList.remove('hidden');

  el('edit-taller-subtitle').innerText = "Taller: " + titulo;
  const msg = el('add-part-msg');
  if (msg) { msg.innerText = ""; msg.classList.add('hidden'); }
  const checklist = el('add-docentes-checklist');
  if (checklist) checklist.innerHTML = "<p>Cargando...</p>";

  // buscamos el taller en cache, si no existe lo recargamos
  const t = talleresAdminCache.find(x => String(x.id) === String(id));
  if (t) {
    const invited = Array.isArray(t.invitados) ? t.invitados.map(String) : [];
    if (allDocentesCache.length > 0) renderChecklist(allDocentesCache, 'add-docentes-checklist', invited);
    else loadDocentesAndRenderAdd(invited);
  } else {
    postAction('getAllTalleres').then(json => {
      talleresAdminCache = Array.isArray(json.data) ? json.data : [];
      const taller = talleresAdminCache.find(x => String(x.id) === String(id));
      const invited = Array.isArray(taller?.invitados) ? taller.invitados.map(String) : [];
      if (allDocentesCache.length > 0) renderChecklist(allDocentesCache, 'add-docentes-checklist', invited);
      else loadDocentesAndRenderAdd(invited);
    });
  }
}

function loadDocentesAndRenderAdd(invited) {
  postAction('getAllDocentesSimple').then(json => {
    allDocentesCache = Array.isArray(json.data) ? json.data : [];
    renderChecklist(allDocentesCache, 'add-docentes-checklist', invited);
  });
}

function openAddLink(id) {
  selectedTallerIdForLink = id;
  el('modal-admin-list-talleres')?.classList.add('hidden');
  el('modal-add-link')?.classList.remove('hidden');
  if (el('meet-link-input')) el('meet-link-input').value = "";
}

function loadMyTalleres(userId) {
  const container = el('talleres-container');
  if (!container) return;

  container.innerHTML = '<p>Buscando talleres...</p>';

  postAction('getMyTalleres', { userId })
    .then(json => {
      const data = Array.isArray(json.data) ? json.data : [];
      myTalleresCache = data;

      if (data.length === 0) {
        container.innerHTML = `<div class="empty-state-msg"><p>No estás inscripto en talleres activos.</p></div>`;
        return;
      }

      let html = '';
      data.forEach(t => {
        html += `
          <div class="card card-taller" onclick="showTallerInfo('${escapeQuotes(t.titulo || "")}', '${escapeQuotes(t.link || "")}', '${String(t.id)}')">
            <h3>${escapeHtml(t.titulo || "")}</h3>
            <p>📅 ${escapeHtml(t.fechaTaller || "")}</p>
            ${t.link ? '<span class="badge-link">Enlace Disponible</span>' : ''}
          </div>`;
      });
      container.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = '<p style="color:red;">Error cargando talleres.</p>';
    });
}

function showTallerInfo(titulo, link, tallerId) {
  el('modal-taller-info')?.classList.remove('hidden');
  el('info-taller-titulo').innerText = titulo;

  const actionContainer = el('taller-action-container');
  if (actionContainer) {
    if (link) {
      actionContainer.innerHTML = `<a href="${link}" target="_blank" class="btn-primary" style="display:block; text-align:center; text-decoration:none;">Unirse a la Reunión</a>`;
    } else {
      actionContainer.innerHTML = `<p style="color:#777; font-style:italic;">El enlace de la reunión aún no está disponible.</p>`;
    }
  }

  // Material del taller (si existe contenedor en tu HTML)
  const materialContainer = el('taller-material-container');
  if (materialContainer) {
    const taller = myTalleresCache.find(t => String(t.id) === String(tallerId));
    const materialIds = Array.isArray(taller?.materiales) ? taller.materiales.map(String) : []; // backend debe devolver 'materiales' o similar
    renderTallerMaterial(materialContainer, materialIds);
  }
}

function renderTallerMaterial(container, materialIds) {
  if (!container) return;

  if (!materialIds || materialIds.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No hay material asignado para este taller.</p></div>`;
    return;
  }

  const docsById = new Map((globalDocs || []).map(d => [String(d.id), d]));
  const items = materialIds.map(id => docsById.get(String(id))).filter(Boolean);

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No se encontró el material en Documentación.</p></div>`;
    return;
  }

  let html = '<ul class="material-list">';
  items.forEach(doc => {
    html += `
      <li class="material-item">
        <div>
          <strong>${escapeHtml(doc.titulo || "")}</strong><br>
          <small>${escapeHtml(doc.categoria || "")} • ${escapeHtml(formatDateDisplay(doc.fecha))}</small>
        </div>
        <div>
          <a href="${String(doc.url || "#")}" target="_blank" class="btn-download">Abrir</a>
        </div>
      </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

// Material selection helpers (solo si existen en HTML)
function loadDocsForSelectionIfExists(containerId) {
  const container = el(containerId);
  if (!container) return;
  container.innerHTML = '<p>Cargando documentación...</p>';
  if (globalDocs && globalDocs.length > 0) {
    renderDocsChecklist(globalDocs, containerId);
    return;
  }
  refreshDocuments().then(docs => renderDocsChecklist(docs, containerId));
}

function renderDocsChecklist(docs, containerId, preselectedIds = []) {
  const container = el(containerId);
  if (!container) return;
  if (!docs || docs.length === 0) { container.innerHTML = "<p>No hay documentación cargada.</p>"; return; }

  const pre = new Set((preselectedIds || []).map(String));
  const sorted = [...docs].sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || "")));

  let html = '';
  sorted.forEach(d => {
    const checked = pre.has(String(d.id)) ? 'checked' : '';
    html += `<label class="checklist-item"><input type="checkbox" value="${String(d.id)}" ${checked}> ${escapeHtml(d.titulo || "")} <small>(${escapeHtml(d.categoria || "")})</small></label>`;
  });
  container.innerHTML = html;
}

function filterDocsChecklist(text, containerId) {
  const container = el(containerId);
  if (!container) return;

  const labels = container.querySelectorAll('.checklist-item');
  const term = String(text || "").toLowerCase();

  labels.forEach(lbl => {
    const txt = lbl.innerText.toLowerCase();
    lbl.style.display = txt.includes(term) ? 'flex' : 'none';
  });
}

function openEditMaterial(tallerId, titulo) {
  currentEditingMaterialTallerId = tallerId;

  el('modal-admin-list-talleres')?.classList.add('hidden');
  el('modal-edit-material')?.classList.remove('hidden');
  el('material-taller-subtitle') && (el('material-taller-subtitle').innerText = "Taller: " + titulo);

  const msg = el('material-msg');
  if (msg) { msg.innerText = ""; msg.classList.add('hidden'); msg.style.color = ""; }

  const checklist = el('material-docs-checklist');
  if (checklist) checklist.innerHTML = "<p>Cargando...</p>";

  // Preselección: si el backend devuelve materiales en getAllTalleres
  const taller = talleresAdminCache.find(t => String(t.id) === String(tallerId));
  const preselected = Array.isArray(taller?.materiales) ? taller.materiales.map(String) : [];

  loadDocsForSelectionIfExists('material-docs-checklist');
  // Una vez cargado, re-render con preselected (para no depender del orden de promesas)
  refreshDocuments().then(docs => renderDocsChecklist(docs, 'material-docs-checklist', preselected));
}

// ==========================================
// APPS / ESTUDIANTES (opcionales si tu HTML los tiene)
// ==========================================
function loadApps(force = false) {
  const container = el('apps-list-container');
  if (!container) return;

  if (!force && allAppsCache.length > 0) {
    renderAppsList(allAppsCache);
    return;
  }

  container.innerHTML = "<p>Cargando...</p>";
  postAction('getApps')
    .then(json => {
      allAppsCache = Array.isArray(json.data) ? json.data : [];
      renderAppsList(allAppsCache);
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = "<p style='color:red;'>Error cargando aplicaciones.</p>";
    });
}

function renderAppsList(items) {
  const container = el('apps-list-container');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No hay aplicaciones cargadas.</p></div>`;
    return;
  }

  let html = '<ul>';
  items.forEach(a => {
    html += `
      <li class="doc-item">
        <div class="doc-info">
          <strong>${escapeHtml(a.nombre || "")}</strong><br>
          <small>${escapeHtml(a.fecha || "")}</small>
          <p>${escapeHtml(a.funciones || "")}</p>
        </div>
        <div class="doc-actions">
          <a href="${String(a.enlace || "#")}" target="_blank" class="btn-download">Abrir</a>
        </div>
      </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

function setStudentTab(tab) {
  // opcional: si tenés pestañas en HTML
  el('student-tab-publicaciones')?.classList.toggle('active', tab === 'publicaciones');
  el('student-tab-tutoriales')?.classList.toggle('active', tab === 'tutoriales');
  el('student-publications-panel') && (el('student-publications-panel').style.display = tab === 'publicaciones' ? 'block' : 'none');
  el('student-tutorials-panel') && (el('student-tutorials-panel').style.display = tab === 'tutoriales' ? 'block' : 'none');
}

function loadStudentPublications(force = false) {
  const container = el('student-publications-list');
  if (!container) return;

  if (!force && allStudentPublications.length > 0) {
    renderStudentItems(container, allStudentPublications);
    return;
  }

  container.innerHTML = "<p>Cargando...</p>";
  postAction('getStudentPublications')
    .then(json => {
      allStudentPublications = Array.isArray(json.data) ? json.data : [];
      renderStudentItems(container, allStudentPublications);
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = "<p style='color:red;'>Error cargando publicaciones.</p>";
    });
}

function loadStudentTutorials(force = false) {
  const container = el('student-tutorials-list');
  if (!container) return;

  if (!force && allStudentTutorials.length > 0) {
    renderStudentItems(container, allStudentTutorials);
    return;
  }

  container.innerHTML = "<p>Cargando...</p>";
  postAction('getStudentTutorials')
    .then(json => {
      allStudentTutorials = Array.isArray(json.data) ? json.data : [];
      renderStudentItems(container, allStudentTutorials);
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = "<p style='color:red;'>Error cargando tutoriales.</p>";
    });
}

function renderStudentItems(container, items) {
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No hay elementos cargados.</p></div>`;
    return;
  }

  let html = '<ul>';
  items.forEach(it => {
    html += `
      <li class="doc-item">
        <div class="doc-info">
          <strong>${escapeHtml(it.titulo || "")}</strong><br>
          <small>${escapeHtml(it.fecha || "")}</small>
          <p>${escapeHtml(it.descripcion || "")}</p>
        </div>
        <div class="doc-actions">
          <a href="${String(it.enlace || "#")}" target="_blank" class="btn-download">Abrir</a>
        </div>
      </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

// ==========================================
// UTIL: filtros checklist docentes
// ==========================================
function filterChecklist(text, containerId) {
  const container = el(containerId);
  if (!container) return;

  const labels = container.querySelectorAll('.checklist-item');
  const term = String(text || "").toLowerCase();

  labels.forEach(lbl => {
    const txt = lbl.innerText.toLowerCase();
    lbl.style.display = txt.includes(term) ? 'flex' : 'none';
  });
}

// Exponer funciones usadas en inline onclick
window.openAddParticipants = openAddParticipants;
window.openAddLink = openAddLink;
window.toggleDocFavorite = toggleDocFavorite;
window.showTallerInfo = showTallerInfo;
window.openEditMaterial = openEditMaterial;
