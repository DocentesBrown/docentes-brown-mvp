// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw4fbq5XjHnqc_Cmw3kQ-JXrOT9QifRMO3zjZQA6GNDCCkR66Wa6OKBkSy_azXMd_Dc7w/exec";
const WHATSAPP_NUMBER = "5491153196358"; 

// --- VARIABLES GLOBALES ---
let globalDocs = [];
let allDocentesCache = [];
let currentEditingTallerId = null; 
let currentTallerInvitedIds = []; 
let selectedTallerIdForLink = null;
let userFavorites = []; 
let adminTalleresCache = []; // cache para edición rápida

// Cache docs para selección de materiales
let docsLoadedOnce = false;

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
        document.getElementById('modal-admin-list-talleres').classList.add('hidden');
        document.getElementById('modal-create-taller').classList.remove('hidden');
        document.getElementById('form-create-taller').reset();
        document.getElementById('taller-msg').innerText = "";
        document.getElementById('count-selected').innerText = "0";
        document.getElementById('count-selected-docs').innerText = "0";
        currentTallerInvitedIds = []; 
        loadDocentesForSelection('docentes-checklist');
        loadDocsForSelection('docs-checklist');
    });

    // ADMIN: Submit Crear Taller
    document.getElementById('form-create-taller')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = document.getElementById('taller-msg');
        const checked = document.querySelectorAll('#docentes-checklist input:checked');
        const selectedIds = Array.from(checked).map(cb => cb.value);

        const checkedDocs = document.querySelectorAll('#docs-checklist input:checked');
        const selectedDocIds = Array.from(checkedDocs).map(cb => cb.value);

        msg.innerText = "Creando..."; msg.classList.remove('hidden');
        
        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({
                action: 'createTaller',
                titulo: document.getElementById('taller-titulo').value,
                fechaTaller: document.getElementById('taller-fecha').value,
                invitados: selectedIds,
                materialIds: selectedDocIds
            })
        })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') {
                msg.innerText = "Listo."; msg.style.color = "green";
                setTimeout(() => { 
                    document.getElementById('modal-create-taller').classList.add('hidden'); 
                    document.getElementById('modal-admin-list-talleres').classList.remove('hidden'); 
                    loadAdminTalleresList(); 
                }, 1000);
            } else { msg.innerText = json.message; }
        });
    });

    // ADMIN: Confirmar Editar Material de Estudio
    document.getElementById('btn-confirm-edit-materials')?.addEventListener('click', () => {
        const msg = document.getElementById('edit-materials-msg');
        const checked = document.querySelectorAll('#edit-materials-checklist input:checked');
        const selectedDocIds = Array.from(checked).map(cb => cb.value);

        msg.innerText = "Guardando material...";
        msg.style.color = "var(--primary)";
        msg.classList.remove('hidden');

        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'saveTallerMaterials',
                tallerId: currentEditingTallerId,
                materialIds: selectedDocIds
            })
        })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') {
                msg.innerText = "Material actualizado.";
                msg.style.color = "green";
                setTimeout(() => {
                    document.getElementById('modal-edit-materials').classList.add('hidden');
                    document.getElementById('modal-admin-list-talleres').classList.remove('hidden');
                    loadAdminTalleresList();
                }, 900);
            } else {
                msg.innerText = "Error: " + json.message;
                msg.style.color = "red";
            }
        })
        .catch(err => {
            console.error(err);
            msg.innerText = "Error de conexión.";
            msg.style.color = "red";
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
    document.getElementById('btn-view-docs')?.addEventListener('click', () => {
        document.getElementById('modal-view-docs').classList.remove('hidden');
        document.getElementById('filter-search').value = "";
        document.getElementById('filter-cat').value = "todos";
        const newDocs = globalDocs.filter(doc => doc.isNew);
        if (newDocs.length > 0) renderDocsList(newDocs);
        else document.getElementById('docs-list-container').innerHTML = `<div class="empty-state-msg"><p>No hay material nuevo.</p><small>Explora las categorías.</small></div>`;
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
    document.getElementById('search-edit-material-input')?.addEventListener('keyup', (e) => filterDocsChecklist(e.target.value, 'edit-materials-checklist'));

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
        const msg = document.getElementById('upload-msg');
        const file = document.getElementById('doc-file').files[0];
        if(!file) {
            if(msg) {
                msg.innerText = "Seleccioná un PDF.";
                msg.style.color = "red";
                msg.classList.remove('hidden');
            }
            return;
        }

        if(msg) {
            msg.innerText = "Leyendo archivo...";
            msg.style.color = "var(--primary)";
            msg.classList.remove('hidden');
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function() {
            if(msg) msg.innerText = "Subiendo a Drive...";
            fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'uploadDocument',
                    categoria: document.getElementById('doc-cat').value,
                    numero: document.getElementById('doc-num').value,
                    titulo: document.getElementById('doc-title').value,
                    resumen: document.getElementById('doc-desc').value,
                    fileName: file.name,
                    mimeType: file.type,
                    fileData: String(reader.result).split(',')[1]
                })
            })
            .then(r => r.json())
            .then(json => {
                if(!msg) return;
                msg.innerText = json.message || "Proceso finalizado.";
                msg.style.color = (json.result === 'success') ? "green" : "red";
                msg.classList.remove('hidden');
                // Refrescamos cache de docs para selección de materiales
                if(json.result === 'success') {
                    docsLoadedOnce = false;
                }
            })
            .catch(err => {
                console.error(err);
                if(msg) {
                    msg.innerText = "Error de conexión.";
                    msg.style.color = "red";
                    msg.classList.remove('hidden');
                }
            });
        };
    });

    document.getElementById('form-profile')?.addEventListener('submit', (e) => {
        e.preventDefault(); const user = JSON.parse(sessionStorage.getItem('db_user'));
        fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'updateProfile', userId: user.id, dni: document.getElementById('prof-dni').value, telefono: document.getElementById('prof-tel').value, institucion: document.getElementById('prof-inst').value }) }).then(r => r.json()).then(json => { document.getElementById('profile-msg').innerText = json.message; });
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
    const container = document.getElementById('admin-talleres-list');
    container.innerHTML = '<p>Cargando talleres...</p>';
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllTalleres' }) })
    .then(r => r.json())
    .then(json => {
        adminTalleresCache = Array.isArray(json.data) ? json.data : [];
        if(json.data.length === 0) { container.innerHTML = '<p>No hay talleres creados.</p>'; return; }
        let html = '<ul class="taller-list">';
        json.data.forEach(t => {
            const safeTitle = String(t.titulo || '').replace(/'/g, "&#39;");
            const materialsCount = Array.isArray(t.materiales) ? t.materiales.length : 0;
            html += `
            <li class="taller-item">
                <div class="taller-info">
                    <strong>${t.titulo}</strong> <small>(${t.fechaTaller})</small><br>
                    <span style="font-size:0.85rem; color:#666;">Invitados: ${t.invitados ? t.invitados.length : 0}</span>
                    <span style="font-size:0.85rem; color:#666; margin-left:10px;">📚 Material: ${materialsCount}</span>
                    <div style="margin-top:5px;">
                       ${t.link ? `<a href="${t.link}" target="_blank" class="link-tag">Enlace Meet Activo</a>` : '<span class="no-link">Sin enlace</span>'}
                    </div>
                </div>
                <div class="taller-actions">
                     <button class="btn-sm" onclick="openAddParticipants(${t.id}, '${safeTitle}')">👥 Asistentes</button>
                     <button class="btn-sm" onclick="openEditMaterials(${t.id}, '${safeTitle}')">📚 Material</button>
                     <button class="btn-sm btn-secondary" onclick="openAddLink(${t.id})">🔗 Link</button>
                </div>
            </li>`;
        });
        html += '</ul>';
        container.innerHTML = html;
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

// --- DOCUMENTACIÓN: Cargar para seleccionar Material de Estudio ---
function ensureDocsLoaded(force = false) {
    if(docsLoadedOnce && !force && Array.isArray(globalDocs) && globalDocs.length > 0) {
        return Promise.resolve(globalDocs);
    }

    return fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getDocuments' }) })
        .then(r => r.json())
        .then(json => {
            docsLoadedOnce = true;
            globalDocs = Array.isArray(json.data) ? json.data.map(d => ({ ...d, isNew: false })) : [];
            return globalDocs;
        });
}

function loadDocsForSelection(containerId, preselectedIds = []) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '<p>Cargando documentación...</p>';

    ensureDocsLoaded()
        .then(docs => {
            renderDocsChecklist(docs, containerId, preselectedIds);
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<p style="color:red;">No se pudo cargar la documentación.</p>';
        });
}

function renderDocsChecklist(docs, containerId, preselectedIds = []) {
    const container = document.getElementById(containerId);
    if(!container) return;
    if(!Array.isArray(docs) || docs.length === 0) {
        container.innerHTML = '<p>No hay documentos cargados.</p>';
        return;
    }

    const selectedSet = new Set((preselectedIds || []).map(String));
    let html = '';
    docs.forEach(doc => {
        const id = String(doc.id);
        const title = doc.titulo || 'Sin título';
        const cat = doc.categoria || 'Sin categoría';
        const num = doc.numero || 'S/N';
        const isChecked = selectedSet.has(id) ? 'checked' : '';
        html += `<label class="checklist-item"><input type="checkbox" value="${id}" ${isChecked}> <strong>${escapeHtml_(title)}</strong> <small>(${cat} · ${num})</small></label>`;
    });
    container.innerHTML = html;

    // Contadores
    const countSpanCreate = document.getElementById('count-selected-docs');
    const countSpanEdit = null;
    const updateCount = () => {
        const cnt = container.querySelectorAll('input:checked').length;
        if(containerId === 'docs-checklist' && countSpanCreate) countSpanCreate.innerText = String(cnt);
    };
    updateCount();
    container.querySelectorAll('input').forEach(cb => cb.addEventListener('change', updateCount));
}

function filterDocsChecklist(text, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    const labels = container.querySelectorAll('.checklist-item');
    const term = String(text || '').toLowerCase();
    labels.forEach(lbl => {
        const txt = lbl.innerText.toLowerCase();
        lbl.style.display = txt.includes(term) ? 'flex' : 'none';
    });
}

function escapeHtml_(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function openEditMaterials(tallerId, titulo) {
    currentEditingTallerId = tallerId;
    document.getElementById('modal-admin-list-talleres').classList.add('hidden');
    document.getElementById('modal-edit-materials').classList.remove('hidden');
    const subtitle = document.getElementById('edit-materials-subtitle');
    if(subtitle) subtitle.innerText = "Taller: " + titulo;
    const msg = document.getElementById('edit-materials-msg');
    if(msg) { msg.innerText = ""; msg.classList.add('hidden'); }

    // Preseleccionados desde cache
    const t = (adminTalleresCache || []).find(x => String(x.id) === String(tallerId));
    const preselected = t && Array.isArray(t.materiales) ? t.materiales.map(String) : [];

    // Render
    loadDocsForSelection('edit-materials-checklist', preselected);
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
    const term = document.getElementById('filter-search').value.toLowerCase();
    const cat = document.getElementById('filter-cat').value;
    const filtered = globalDocs.filter(doc => {
        const matchesText = doc.titulo.toLowerCase().includes(term) || doc.resumen.toLowerCase().includes(term);
        const matchesCat = cat === 'todos' || doc.categoria === cat;
        return matchesText && matchesCat;
    });
    renderDocsList(filtered);
}

function checkNewDocuments() {
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getDocuments' }) })
    .then(r => r.json())
    .then(json => {
        const lastViewed = localStorage.getItem('last_docs_view_date');
        const now = new Date();
        let hasNew = false;
        
        docsLoadedOnce = true;
        globalDocs = json.data.map(d => {
            const docDate = parseDate(d.fecha);
            // Consideramos nuevo si es posterior a la ultima visita (o ultimos 7 dias si es la primera vez)
            let isNew = false;
            if(!lastViewed) {
                const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                isNew = docDate > oneWeekAgo;
            } else {
                isNew = docDate > new Date(lastViewed);
            }
            if(isNew) hasNew = true;
            return { ...d, isNew: isNew };
        });

        if(hasNew) {
            document.getElementById('notification-badge').classList.remove('hidden');
        }
        
        // Actualizamos fecha de vista al cargar (o mejor al abrir el modal, pero simplificamos aqui)
        localStorage.setItem('last_docs_view_date', now.toISOString());
    });
}

function loadMyTalleres(userId) {
    const container = document.getElementById('talleres-container');
    container.innerHTML = '<p>Buscando talleres...</p>';
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getMyTalleres', userId: userId }) })
    .then(r => r.json())
    .then(json => {
        if(json.data.length === 0) {
            container.innerHTML = `<div class="empty-state-msg"><p>No estás inscripto en talleres activos.</p></div>`;
            return;
        }
        let html = '';
        json.data.forEach(t => {
            const safeTitle = String(t.titulo || '').replace(/'/g, "&#39;");
            const safeLink = String(t.link || '').replace(/'/g, "&#39;");
            const materialsCount = Array.isArray(t.materiales) ? t.materiales.length : 0;
            const materialsAttr = encodeURIComponent(JSON.stringify(Array.isArray(t.materiales) ? t.materiales : []));
            html += `
            <div class="card card-taller" onclick="showTallerInfo('${safeTitle}', '${safeLink}', '${materialsAttr}')">
                <h3>${t.titulo}</h3>
                <p>📅 ${t.fechaTaller}</p>
                <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
                    ${t.link ? '<span class="badge-link">Enlace Disponible</span>' : ''}
                    ${materialsCount > 0 ? `<span class="badge" style="background: var(--cream); color: var(--primary);">📚 Material: ${materialsCount}</span>` : ''}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    });
}

function showTallerInfo(titulo, link, materialsEncoded) {
    document.getElementById('modal-taller-info').classList.remove('hidden');
    document.getElementById('info-taller-titulo').innerText = titulo;
    const actionContainer = document.getElementById('taller-action-container');
    const materialsContainer = document.getElementById('taller-materials-container');
    if(materialsContainer) materialsContainer.innerHTML = "";
    if(link) {
        actionContainer.innerHTML = `<a href="${link}" target="_blank" class="btn-primary" style="display:block; text-align:center; text-decoration:none;">Unirse a la Reunión</a>`;
    } else {
        actionContainer.innerHTML = `<p style="color:#777; font-style:italic;">El enlace de la reunión aún no está disponible.</p>`;
    }

    // Materiales
    let materialIds = [];
    try {
        if(materialsEncoded) materialIds = JSON.parse(decodeURIComponent(materialsEncoded));
    } catch(e) { materialIds = []; }

    if(materialIds && materialIds.length > 0) {
        ensureDocsLoaded().then(docs => {
            const map = new Map(docs.map(d => [String(d.id), d]));
            const listItems = materialIds
                .map(id => map.get(String(id)))
                .filter(Boolean);

            if(listItems.length === 0) {
                if(materialsContainer) {
                    materialsContainer.innerHTML = `<div class="materials-box"><h4>📚 Material de Estudio</h4><p style="margin:0; color:#666;">No se encontraron documentos asociados.</p></div>`;
                }
                return;
            }

            let html = `<div class="materials-box"><h4>📚 Material de Estudio</h4><ul class="materials-list">`;
            listItems.forEach(d => {
                const meta = `${d.categoria || 'Sin categoría'} · ${(d.numero || 'S/N')}`;
                html += `
                <li class="material-item">
                    <div class="material-meta">
                        <strong>${escapeHtml_(d.titulo || 'Documento')}</strong>
                        <small>${escapeHtml_(meta)}</small>
                    </div>
                    <a class="btn-mini" href="${d.url}" target="_blank" rel="noopener">Abrir PDF</a>
                </li>`;
            });
            html += `</ul></div>`;
            if(materialsContainer) materialsContainer.innerHTML = html;
        });
    } else {
        if(materialsContainer) {
            materialsContainer.innerHTML = `<div class="materials-box"><h4>📚 Material de Estudio</h4><p style="margin:0; color:#666;">Aún no hay material cargado para este taller.</p></div>`;
        }
    }
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
