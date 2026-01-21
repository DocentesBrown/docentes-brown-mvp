// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzm4PKtttlamu3mCWi6HRDkflThXS8Dx9UNMx3TIXc3q3MI_aDETFCthtyg6gGpoPnE9Q/exec";
const WHATSAPP_NUMBER = "5491153196358"; 

// --- VARIABLES GLOBALES ---
let globalDocs = [];
let allDocentesCache = [];
let currentEditingTallerId = null;
let currentEditingMaterialTallerId = null;
let adminTalleresCache = [];
let myTalleresCache = []; 
let currentTallerInvitedIds = []; 
let selectedTallerIdForLink = null;
let userFavorites = []; 

// --- INICIO SEGURO ---
// Esperamos a que todo el HTML esté cargado antes de asignar funciones
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Cargado. Iniciando sistema...");
    
    // 1. Asignar todos los eventos de botones
    setupEventListeners();

    // 2. Manejar Splash y Sesión
    const splashScreen = document.getElementById('splash-screen');
    const appContainer = document.getElementById('app-container');
    
    setTimeout(() => {
        if(splashScreen) splashScreen.classList.add('hidden');
        if(appContainer) appContainer.style.display = 'block';
        checkSession();
    }, 2000);
});

// --- FUNCIÓN CENTRAL DE EVENTOS ---
function setupEventListeners() {
    // ADMIN: Botón Talleres
    const btnAdminTalleres = document.getElementById('btn-admin-talleres');
    if (btnAdminTalleres) {
        btnAdminTalleres.addEventListener('click', () => {
            console.log("Click en Admin Talleres");
            document.getElementById('modal-admin-list-talleres').classList.remove('hidden');
            loadAdminTalleresList();
        });
    }

    // ADMIN: Botón Crear Taller (dentro del modal)
    document.getElementById('btn-open-create-taller')?.addEventListener('click', () => {
        document.getElementById('modal-admin-list-talleres')?.classList.add('hidden');
        document.getElementById('modal-create-taller')?.classList.remove('hidden');
        document.getElementById('form-create-taller')?.reset();
        document.getElementById('taller-msg') && (document.getElementById('taller-msg').innerText = "");
        document.getElementById('count-selected') && (document.getElementById('count-selected').innerText = "0");

        loadDocentesForSelection('docentes-checklist');

        // Material de estudio
        loadDocsForSelection('docs-checklist');
    });


    // ADMIN: Submit Crear Taller
    document.getElementById('form-create-taller')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = document.getElementById('taller-msg');

        const checked = document.querySelectorAll('#docentes-checklist input:checked');
        const selectedIds = Array.from(checked).map(cb => cb.value);

        const checkedDocs = document.querySelectorAll('#docs-checklist input:checked');
        const materialIds = Array.from(checkedDocs).map(cb => cb.value);

        if (msg) { msg.innerText = "Creando..."; msg.classList.remove('hidden'); msg.style.color = "var(--primary)"; }

        apiPost({
          action: 'createTaller',
          titulo: document.getElementById('taller-titulo')?.value || "",
          fechaTaller: document.getElementById('taller-fecha')?.value || "",
          invitados: selectedIds,
          materialIds: materialIds
        })
        .then(json => {
            if(json.result === 'success') {
                if (msg) { msg.innerText = "Listo."; msg.style.color = "green"; }
                setTimeout(() => { 
                    document.getElementById('modal-create-taller')?.classList.add('hidden'); 
                    document.getElementById('modal-admin-list-talleres')?.classList.remove('hidden'); 
                    loadAdminTalleresList(); 
                }, 800);
            } else { 
                if (msg) { msg.innerText = json.message || "Error."; msg.style.color = "red"; }
            }
        })
        .catch(err => {
            console.error(err);
            if (msg) { msg.innerText = "Error de conexión."; msg.style.color = "red"; }
        });
    });

    });

    // ADMIN: Confirmar Editar Participantes
    document.getElementById('btn-confirm-add-participants')?.addEventListener('click', () => {
        const msg = document.getElementById('add-part-msg');
        const checked = document.querySelectorAll('#add-docentes-checklist input:checked');
        const newIds = Array.from(checked).map(cb => cb.value); 

        msg.innerText = "Guardando cambios..."; msg.style.color = "var(--primary)"; msg.classList.remove('hidden');

        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'saveTallerParticipants', 
                tallerId: currentEditingTallerId, 
                ids: newIds 
            }) 
        })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') {
                msg.innerText = "Lista actualizada."; msg.style.color = "green";
                setTimeout(() => {
                    document.getElementById('modal-add-participants').classList.add('hidden');
                    document.getElementById('modal-admin-list-talleres').classList.remove('hidden');
                    loadAdminTalleresList(); 
                }, 1000);
            } else { msg.innerText = "Error: " + json.message; msg.style.color = "red"; }
        });
    });

    // DOCENTE: Ver Documentos
  document.getElementById("btn-view-docs")?.addEventListener("click", () => {
    const modal = document.getElementById("modal-view-docs");
    if (modal) modal.classList.remove("hidden");

    const search = document.getElementById("filter-search");
    if (search) search.value = "";

    const sel = document.getElementById("filter-cat");
    if (sel) {
      // Asegurar opción Favoritos
      const hasFavOpt = Array.from(sel.options).some(o => String(o.value) === "favoritos");
      if (!hasFavOpt) {
        const opt = document.createElement("option");
        opt.value = "favoritos";
        opt.textContent = "⭐ Favoritos";
        sel.insertBefore(opt, sel.firstChild);
      }
      sel.value = "favoritos"; // por defecto
    }

    // Marcamos que se abrió, pero el puntito rojo depende de últimos 6 días
    localStorage.setItem("last_docs_view_date", new Date().toISOString());
    document.getElementById("notification-badge")?.classList.add("hidden");

    applyFilters();
  });


    // DOCENTE: Ver Perfil
    document.getElementById('btn-view-profile')?.addEventListener('click', () => {
        document.getElementById('modal-profile').classList.remove('hidden');
        const user = JSON.parse(sessionStorage.getItem('db_user'));
        document.getElementById('static-nombre').value = user.nombre;
        document.getElementById('static-email').value = user.email;
        fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getProfile', userId: user.id }) }).then(r => r.json()).then(json => { if(json.result === 'success') { document.getElementById('prof-dni').value = json.data.dni; document.getElementById('prof-tel').value = json.data.telefono; document.getElementById('prof-inst').value = json.data.institucion; } });
    });

    // ADMIN: Documentos
    document.getElementById('btn-admin-docs')?.addEventListener('click', () => document.getElementById('modal-upload-docs').classList.remove('hidden'));

    // FILTROS
    document.getElementById('filter-search')?.addEventListener('keyup', applyFilters);
    document.getElementById('filter-cat')?.addEventListener('change', applyFilters);
    document.getElementById('search-docente-input')?.addEventListener('keyup', (e) => filterChecklist(e.target.value, 'docentes-checklist'));
    document.getElementById('search-add-input')?.addEventListener('keyup', (e) => filterChecklist(e.target.value, 'add-docentes-checklist'));
    document.getElementById('search-docs-input')?.addEventListener('keyup', (e) => filterDocsChecklist(e.target.value, 'docs-checklist'));
    document.getElementById('search-material-input')?.addEventListener('keyup', (e) => filterDocsChecklist(e.target.value, 'material-docs-checklist'));

    // LINK MEET
    document.getElementById('btn-save-link')?.addEventListener('click', () => {
        const link = document.getElementById('meet-link-input').value;
        if(!link) return;
        fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'updateTallerLink', tallerId: selectedTallerIdForLink, link: link }) })
        .then(r => r.json()).then(json => { document.getElementById('modal-add-link').classList.add('hidden'); loadAdminTalleresList(); });
    });

    // LOGIN
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const msgBox = document.getElementById('login-message'); msgBox.innerText = "Entrando..."; msgBox.classList.remove('hidden');
            fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'login', email: document.getElementById('login-email').value, password: document.getElementById('login-pass').value }) })
            .then(r => r.json()).then(json => {
                if (json.result === 'success') { sessionStorage.setItem('db_user', JSON.stringify(json.user)); renderDashboard(json.user); } 
                else { msgBox.innerText = json.message; msgBox.style.color = "red"; }
            });
        });
    }

    // LOGOUT & MODAL REGISTRO
    document.getElementById('logout-btn')?.addEventListener('click', () => { sessionStorage.removeItem('db_user'); location.reload(); });
    
    document.getElementById('open-register-modal')?.addEventListener('click', (e) => { 
        e.preventDefault(); 
        // Resetear visualización al abrir
        document.getElementById('register-modal').classList.remove('hidden'); 
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('register-form').reset();
        const title = document.getElementById('register-title');
        if(title) title.classList.remove('hidden');
        document.getElementById('msg-exito-registro').classList.add('hidden');
        document.getElementById('register-msg').classList.add('hidden');
    });
    
    // --- LÓGICA DE REGISTRO NUEVA ---
    document.getElementById('register-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // 1. Validar Contraseñas
        const p1 = document.getElementById('reg-pass').value;
        const p2 = document.getElementById('reg-pass-confirm').value;
        const msgBox = document.getElementById('register-msg');
        
        if(p1 !== p2) {
            msgBox.innerText = "Las contraseñas no coinciden.";
            msgBox.style.color = "red";
            msgBox.classList.remove('hidden');
            return;
        }

        // 2. Estado de Carga (UX)
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.innerText = "Enviando solicitud...";
        btn.disabled = true;
        msgBox.classList.add('hidden');

        // 3. Petición al Backend
        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'register', 
                nombre: document.getElementById('reg-nombre').value, 
                email: document.getElementById('reg-email').value, 
                rol: document.getElementById('reg-rol').value, 
                password: p1 
            }) 
        })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') {
                // EXITO: Ocultar form y título, mostrar mensaje de éxito
                document.getElementById('register-form').classList.add('hidden');
                
                const title = document.getElementById('register-title');
                if(title) title.classList.add('hidden');

                document.getElementById('msg-exito-registro').classList.remove('hidden');
            } else {
                // ERROR del Backend
                msgBox.innerText = "Error: " + json.message; 
                msgBox.style.color = "red";
                msgBox.classList.remove('hidden');
                btn.innerText = originalText;
                btn.disabled = false;
            }
        })
        .catch(err => {
            console.error(err);
            msgBox.innerText = "Error de conexión. Intente nuevamente.";
            msgBox.style.color = "red";
            msgBox.classList.remove('hidden');
            btn.innerText = originalText;
            btn.disabled = false;
        });
    });

    document.getElementById('form-upload-docs')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const file = document.getElementById('doc-file').files[0]; 
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = function() { fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'uploadDocument', categoria: document.getElementById('doc-cat').value, numero: document.getElementById('doc-num').value, titulo: document.getElementById('doc-title').value, resumen: document.getElementById('doc-desc').value, fileName: file.name, mimeType: file.type, fileData: reader.result.split(',')[1] }) }).then(r => r.json()).then(json => { document.getElementById('upload-msg').innerText = json.message; }); };
    });

    document.getElementById('form-profile')?.addEventListener('submit', (e) => {
        e.preventDefault(); const user = JSON.parse(sessionStorage.getItem('db_user'));
        fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'updateProfile', userId: user.id, dni: document.getElementById('prof-dni').value, telefono: document.getElementById('prof-tel').value, institucion: document.getElementById('prof-inst').value }) }).then(r => r.json()).then(json => { document.getElementById('profile-msg').innerText = json.message; });
    });

    
  // ADMIN: Guardar material de estudio del taller
  document.getElementById("btn-confirm-material")?.addEventListener("click", () => {
    const msg = document.getElementById("material-msg");
    const checked = document.querySelectorAll("#material-docs-checklist input:checked");
    const materialIds = Array.from(checked).map(cb => cb.value);

    if (!currentEditingMaterialTallerId) {
      showMessage(msg, "No hay taller seleccionado.", "red");
      return;
    }

    showMessage(msg, "Guardando material...");

    apiPost({
      action: "saveTallerMaterials",
      tallerId: currentEditingMaterialTallerId,
      materialIds: materialIds
    })
    .then(json => {
      if (json.result === "success") {
        showMessage(msg, "Material actualizado.", "green");
        // refrescar cache admin
        loadAdminTalleresList();
        setTimeout(() => {
          document.getElementById("modal-edit-material")?.classList.add("hidden");
          document.getElementById("modal-admin-list-talleres")?.classList.remove("hidden");
        }, 700);
      } else {
        showMessage(msg, "Error: " + (json.message || "No se pudo guardar."), "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error de conexión.", "red");
    });
  });

// CERRAR MODALES (Genérico)
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            e.target.closest('.modal').classList.add('hidden'); 
        }); 
    });

    // WHATSAPP
    document.getElementById('whatsapp-float')?.addEventListener('click', () => {
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=Hola,%20tengo%20una%20consulta%20sobre%20el%20Campus.`, '_blank');
    });
}

// --- SESIÓN Y DASHBOARD ---
function checkSession() {
    const storedUser = sessionStorage.getItem('db_user');
    if (storedUser) { renderDashboard(JSON.parse(storedUser)); } else { showLogin(); }
}

function showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('main-header').classList.add('hidden');
}

function renderDashboard(user) {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('main-header').classList.remove('hidden');
    document.getElementById('whatsapp-float').classList.remove('hidden');
    
    document.getElementById('user-name-display').innerText = user.nombre;
    document.getElementById('user-role-display').innerText = user.rol.toUpperCase();
    
    document.querySelectorAll('.role-dash').forEach(d => d.classList.add('hidden'));
    
    let dashId = `dash-${user.rol.toLowerCase()}`;
    if (user.rol.toLowerCase() === 'admin' || user.rol === 'administrador') dashId = 'dash-administrador';
    
    const targetDash = document.getElementById(dashId);
    if (targetDash) targetDash.classList.remove('hidden');
    
    if (user.rol.toLowerCase() === 'docente') {
        fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getProfile', userId: user.id }) })
        .then(r => r.json()).then(json => { 
            if(json.result === 'success' && json.data.favoritos) { userFavorites = json.data.favoritos; }
            checkNewDocuments(); 
            loadMyTalleres(user.id);
        });
    }
}

// --- FUNCIONES DE CARGA DE DATOS ---
function loadAdminTalleresList() {
  const container = document.getElementById("admin-talleres-list");
  if (container) container.innerHTML = "<p>Cargando talleres...</p>";

  apiPost({ action: "getAllTalleres" })
    .then(json => {
      adminTalleresCache = (json && json.data) ? json.data : [];

      if (!adminTalleresCache || adminTalleresCache.length === 0) {
        if (container) container.innerHTML = "<p>No hay talleres creados.</p>";
        return;
      }

      let html = '<ul class="taller-list">';
      adminTalleresCache.forEach(t => {
        html += `
          <li class="taller-item">
            <div class="taller-info">
              <strong>${escapeHtml(t.titulo)}</strong> <small>(${escapeHtml(t.fechaTaller)})</small><br>
              <span style="font-size:0.85rem; color:#666;">Invitados: ${t.invitados ? t.invitados.length : 0}</span>
              <div style="margin-top:5px;">
                ${t.link ? `<a href="${t.link}" target="_blank" class="link-tag" rel="noopener">Enlace Meet Activo</a>` : '<span class="no-link">Sin enlace</span>'}
              </div>
              <div style="margin-top:6px; font-size:0.85rem; color:#666;">
                📚 Material: <b>${(t.materialIds && t.materialIds.length) ? t.materialIds.length : 0}</b>
              </div>
            </div>
            <div class="taller-actions">
              <button class="btn-sm" onclick="openAddParticipants(${t.id}, '${escapeAttr(t.titulo)}')">👥 Asistentes</button>
              <button class="btn-sm" onclick="openEditMaterial(${t.id}, '${escapeAttr(t.titulo)}')">📚 Material</button>
              <button class="btn-sm btn-secondary" onclick="openAddLink(${t.id})">🔗 Link</button>
            </div>
          </li>
        `;
      });
      html += "</ul>";
      if (container) container.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      if (container) container.innerHTML = "<p style='color:red;'>Error al cargar talleres.</p>";
    });
}


function loadDocentesForSelection(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<p>Cargando lista...</p>';
    if(allDocentesCache.length > 0) { renderChecklist(allDocentesCache, containerId); return; }
    
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllDocentesSimple' }) })
    .then(r => r.json())
    .then(json => {
        allDocentesCache = json.data;
        renderChecklist(allDocentesCache, containerId);
    });
}

function renderChecklist(list, containerId, preselectedIds = []) {
    const container = document.getElementById(containerId);
    if(list.length === 0) { container.innerHTML = "<p>No hay docentes registrados.</p>"; return; }
    let html = '';
    list.forEach(d => {
        const isChecked = preselectedIds.includes(String(d.id)) ? 'checked' : '';
        html += `<label class="checklist-item"><input type="checkbox" value="${d.id}" ${isChecked}> ${d.nombre} <small>(DNI: ${d.dni})</small></label>`;
    });
    container.innerHTML = html;
    
    const countSpan = document.getElementById('count-selected');
    if(containerId === 'docentes-checklist' && countSpan) {
        container.querySelectorAll('input').forEach(cb => {
            cb.addEventListener('change', () => {
                countSpan.innerText = container.querySelectorAll('input:checked').length;
            });
        });
    }
}


// --- DOCS: checklist para Material de Taller ---
function loadDocsForSelection(containerId, preselectedIds = []) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = "<p>Cargando documentación...</p>";

  // si ya tenemos docs cargados
  if (globalDocs && globalDocs.length > 0) {
    renderDocsChecklist(globalDocs, containerId, preselectedIds);
    return;
  }

  apiPost({ action: "getDocuments" })
    .then(json => {
      globalDocs = (json && json.data) ? json.data.map(d => ({ ...d, isNew: false })) : [];
      renderDocsChecklist(globalDocs, containerId, preselectedIds);
    })
    .catch(err => {
      console.error(err);
      if (container) container.innerHTML = "<p style='color:red;'>Error al cargar documentación.</p>";
    });
}

function renderDocsChecklist(docs, containerId, preselectedIds = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!docs || docs.length === 0) {
    container.innerHTML = "<p>No hay documentación cargada.</p>";
    return;
  }

  const pre = (preselectedIds || []).map(String);
  let html = "";
  docs.forEach(doc => {
    const id = String(doc.id);
    const checked = pre.includes(id) ? "checked" : "";
    const label = `${escapeHtml(doc.titulo || "")} <small>(${escapeHtml(doc.categoria || "")}${doc.numero ? " - " + escapeHtml(doc.numero) : ""})</small>`;
    html += `<label class="checklist-item"><input type="checkbox" value="${id}" ${checked}> ${label}</label>`;
  });
  container.innerHTML = html;
}

function filterDocsChecklist(text, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const labels = container.querySelectorAll(".checklist-item");
  const term = String(text || "").toLowerCase().trim();
  labels.forEach(lbl => {
    const txt = lbl.innerText.toLowerCase();
    lbl.style.display = txt.includes(term) ? "flex" : "none";
  });
}

// Abrir modal editar material
function openEditMaterial(tallerId, titulo) {
  currentEditingMaterialTallerId = tallerId;

  document.getElementById("modal-admin-list-talleres")?.classList.add("hidden");
  document.getElementById("modal-edit-material")?.classList.remove("hidden");

  const sub = document.getElementById("material-subtitle");
  if (sub) sub.innerText = "Taller: " + (titulo || "");

  hideMessage(document.getElementById("material-msg"));

  const taller = (adminTalleresCache || []).find(t => String(t.id) === String(tallerId));
  const preselected = (taller && Array.isArray(taller.materialIds)) ? taller.materialIds.map(String) : [];

  loadDocsForSelection("material-docs-checklist", preselected);
}


function openAddParticipants(id, titulo) {
    currentEditingTallerId = id;
    document.getElementById('modal-admin-list-talleres').classList.add('hidden');
    document.getElementById('modal-add-participants').classList.remove('hidden');
    document.getElementById('edit-taller-subtitle').innerText = "Taller: " + titulo;
    document.getElementById('add-part-msg').innerText = "";
    document.getElementById('add-docentes-checklist').innerHTML = "<p>Cargando...</p>";
    
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllTalleres' }) })
    .then(r => r.json())
    .then(json => {
        const taller = json.data.find(t => t.id == id);
        const invited = taller.invitados || [];
        // Cargamos docentes y marcamos los que ya están
        if(allDocentesCache.length > 0) renderChecklist(allDocentesCache, 'add-docentes-checklist', invited.map(String));
        else {
             fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllDocentesSimple' }) })
             .then(rr => rr.json()).then(jj => {
                 allDocentesCache = jj.data;
                 renderChecklist(allDocentesCache, 'add-docentes-checklist', invited.map(String));
             });
        }
    });
}

function openAddLink(id) {
    selectedTallerIdForLink = id;
    document.getElementById('modal-admin-list-talleres').classList.add('hidden');
    document.getElementById('modal-add-link').classList.remove('hidden');
    document.getElementById('meet-link-input').value = ""; 
}

function filterChecklist(text, containerId) {
    const container = document.getElementById(containerId);
    const labels = container.querySelectorAll('.checklist-item');
    const term = text.toLowerCase();
    labels.forEach(lbl => {
        const txt = lbl.innerText.toLowerCase();
        if(txt.includes(term)) lbl.style.display = 'flex';
        else lbl.style.display = 'none';
    });
}

function applyFilters() {
  const term = String(document.getElementById("filter-search")?.value || "").toLowerCase().trim();
  const cat = String(document.getElementById("filter-cat")?.value || "todos");

  const filtered = globalDocs.filter(doc => {
    const matchesText =
      (doc.titulo || "").toLowerCase().includes(term) ||
      (doc.resumen || "").toLowerCase().includes(term);

    const matchesCat =
      cat === "todos" ||
      (cat === "favoritos" ? userFavorites.includes(String(doc.id)) : doc.categoria === cat);

    return matchesText && matchesCat;
  });

  renderDocsList(filtered);
}


function checkNewDocuments() {
  apiPost({ action: "getDocuments" })
    .then(json => {
      const now = new Date();
      const sixDaysAgo = new Date(now);
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

      globalDocs = (json.data || []).map(d => {
        const docDate = parseDate(d.fecha);
        const isNew = docDate >= sixDaysAgo; // últimos 6 días (incluye hoy)
        return { ...d, isNew };
      });

      const hasRecent = globalDocs.some(d => d.isNew);
      if (hasRecent) document.getElementById("notification-badge")?.classList.remove("hidden");
      else document.getElementById("notification-badge")?.classList.add("hidden");

      // Si el modal está abierto, re-aplicar filtros
      if (!document.getElementById("modal-view-docs")?.classList.contains("hidden")) {
        applyFilters();
      }
    })
    .catch(err => console.error(err));
}


function loadMyTalleres(userId) {
  const container = document.getElementById("talleres-container");
  if (container) container.innerHTML = "<p>Buscando talleres...</p>";

  apiPost({ action: "getMyTalleres", userId })
    .then(json => {
      myTalleresCache = (json && json.data) ? json.data : [];

      if (!myTalleresCache || myTalleresCache.length === 0) {
        if (container) container.innerHTML = `<div class="empty-state-msg"><p>No estás inscripto en talleres activos.</p></div>`;
        return;
      }

      let html = "";
      myTalleresCache.forEach(t => {
        html += `
          <div class="card card-taller" onclick="showTallerInfo('${escapeAttr(t.id)}')">
            <h3>${escapeHtml(t.titulo)}</h3>
            <p>📅 ${escapeHtml(t.fechaTaller)}</p>
            ${t.link ? '<span class="badge-link">Enlace Disponible</span>' : ''}
          </div>
        `;
      });
      if (container) container.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      if (container) container.innerHTML = "<p style='color:red;'>Error al cargar talleres.</p>";
    });
}


function showTallerInfo(tallerId) {
  const taller = (myTalleresCache || []).find(t => String(t.id) === String(tallerId));
  if (!taller) return;

  document.getElementById("modal-taller-info")?.classList.remove("hidden");
  document.getElementById("info-taller-titulo").innerText = taller.titulo || "Taller";

  const actionContainer = document.getElementById("taller-action-container");
  if (taller.link) {
    actionContainer.innerHTML = `<a href="${taller.link}" target="_blank" class="btn-primary" style="display:block; text-align:center; text-decoration:none;" rel="noopener">Unirse a la Reunión</a>`;
  } else {
    actionContainer.innerHTML = `<p style="color:#777; font-style:italic;">El enlace de la reunión aún no está disponible.</p>`;
  }

  // Material de estudio
  const render = () => renderTallerMaterials(taller.materialIds || []);
  if (globalDocs && globalDocs.length > 0) render();
  else {
    apiPost({ action: "getDocuments" })
      .then(json => {
        globalDocs = (json && json.data) ? json.data.map(d => ({ ...d, isNew: false })) : [];
        render();
      })
      .catch(err => {
        console.error(err);
        renderTallerMaterials([], true);
      });
  }
}

function renderTallerMaterials(materialIds, isError = false) {
  const container = document.getElementById("taller-material-container");
  if (!container) return;

  if (isError) {
    container.innerHTML = `<div class="material-box"><h4>📚 Material de estudio</h4><p style="color:red; margin:0;">No se pudo cargar la documentación.</p></div>`;
    return;
  }

  const ids = (materialIds || []).map(String);
  if (!ids.length) {
    container.innerHTML = `<div class="material-box"><h4>📚 Material de estudio</h4><p style="margin:0; color:#666;">Aún no hay material asignado para este taller.</p></div>`;
    return;
  }

  const items = (globalDocs || []).filter(d => ids.includes(String(d.id)));
  if (!items.length) {
    container.innerHTML = `<div class="material-box"><h4>📚 Material de estudio</h4><p style="margin:0; color:#666;">No se encontró el material en la base.</p></div>`;
    return;
  }

  let html = `<div class="material-box"><h4>📚 Material de estudio</h4><ul class="material-list">`;
  items.forEach(doc => {
    html += `
      <li class="material-item">
        <div>
          <div class="title">${escapeHtml(doc.titulo || "")}</div>
          <div class="meta">${escapeHtml(doc.categoria || "")}${doc.numero ? " · " + escapeHtml(doc.numero) : ""}</div>
        </div>
        <a class="btn-download" href="${doc.url}" target="_blank" rel="noopener">Ver</a>
      </li>
    `;
  });
  html += `</ul></div>`;
  container.innerHTML = html;
}


function renderDocsList(docs) {
    const container = document.getElementById('docs-list-container');
    if(docs.length === 0) { container.innerHTML = '<p>No se encontraron documentos.</p>'; return; }
    let html = '<ul>';
    docs.forEach(doc => {
        const isFav = userFavorites.includes(String(doc.id));
        const heartClass = isFav ? 'fav-btn fav-active' : 'fav-btn';
        const heartSymbol = isFav ? '♥' : '♡';
        html += `<li class="doc-item"><div class="doc-info"><strong>${doc.titulo}</strong> ${doc.isNew ? '<span class="badge-new">NUEVO</span>' : ''} <br><small>(${doc.numero || 'S/N'} - ${formatDateDisplay(doc.fecha)})</small><br><span class="badge">${doc.categoria}</span><p>${doc.resumen}</p></div><div class="doc-actions"><button class="${heartClass}" onclick="toggleDocFavorite('${doc.id}', this)" title="Marcar Favorito">${heartSymbol}</button><a href="${doc.url}" target="_blank" class="btn-download">Ver PDF</a></div></li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
}

function parseDate(dateInput) {
    if (!dateInput) return new Date(0);
    let str = String(dateInput).trim();
    if (str.includes('T')) str = str.split('T')[0];
    if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) { const parts = str.split('/'); return new Date(parts[2], parts[1] - 1, parts[0]); }
    if (str.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) { const parts = str.split('-'); return new Date(parts[0], parts[1] - 1, parts[2]); }
    return new Date(str);
}

function formatDateDisplay(dateInput) {
    const d = parseDate(dateInput);
    return d.toLocaleDateString('es-AR');
}

function toggleDocFavorite(docId, btn) {
    const user = JSON.parse(sessionStorage.getItem('db_user'));
    // Optimistic UI update
    const isActive = btn.classList.contains('fav-active');
    if(isActive) { btn.classList.remove('fav-active'); btn.innerHTML = '♡'; }
    else { btn.classList.add('fav-active'); btn.innerHTML = '♥'; }
    
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'toggleFavorite', userId: user.id, docId: docId }) })
    .then(r => r.json()).then(json => {
        if(json.result === 'success') { userFavorites = json.favoritos; }
    });
}
