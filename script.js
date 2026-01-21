// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzm4PKtttlamu3mCWi6HRDkflThXS8Dx9UNMx3TIXc3q3MI_aDETFCthtyg6gGpoPnE9Q/exec";
const WHATSAPP_NUMBER = "5491153196358";


// --- VARIABLES GLOBALES ---
let globalDocs = [];
let allDocentesCache = [];
let currentEditingTallerId = null; 
let currentTallerInvitedIds = []; 
let selectedTallerIdForLink = null;
let userFavorites = [];
let currentTallerMaterialIds = [];
let globalMyTalleres = [];

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
    if(btnAdminTalleres) {
        btnAdminTalleres.addEventListener('click', () => {
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
        currentTallerInvitedIds = [];
        currentTallerMaterialIds = [];
        document.getElementById('search-docs-input').value = '';
        loadDocentesForSelection('docentes-checklist');
        loadDocsForSelection('docs-checklist-taller');
    });

    // ADMIN: Submit Crear Taller
    document.getElementById('form-create-taller')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = document.getElementById('taller-msg');
        const checked = document.querySelectorAll('#docentes-checklist input:checked');
        const selectedIds = Array.from(checked).map(cb => cb.value);
        const checkedDocs = document.querySelectorAll('#docs-checklist-taller input:checked');
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

    // ADMIN: Confirmar Editar Participantes
    document.getElementById('btn-confirm-add-participants')?.addEventListener('click', () => {
        const msg = document.getElementById('add-part-msg');
        const checked = document.querySelectorAll('#add-docentes-checklist input:checked');
        const newIds = Array.from(checked).map(cb => cb.value);
        const checkedDocs = document.querySelectorAll('#add-docs-checklist input:checked');
        const newMaterialIds = Array.from(checkedDocs).map(cb => cb.value);

        msg.innerText = "Guardando cambios..."; msg.style.color = "var(--primary)"; msg.classList.remove('hidden');

        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'saveTallerParticipants', 
                tallerId: currentEditingTallerId, 
                ids: newIds,
                materialIds: newMaterialIds
            }) 
        })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') {
                msg.innerText = "Taller actualizado."; msg.style.color = "green";
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
        // Por defecto: mostrar favoritos primero (y marcar NUEVO si corresponde)
        const ordered = sortDocsDefault(globalDocs);
        renderDocsList(ordered);
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
    document.getElementById('search-docs-input')?.addEventListener('keyup', (e) => filterChecklist(e.target.value, 'docs-checklist-taller'));
    document.getElementById('search-add-docs-input')?.addEventListener('keyup', (e) => filterChecklist(e.target.value, 'add-docs-checklist'));

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

        // 3. Enviar al Backend
        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'register', 
                nombre: document.getElementById('reg-nombre').value,
                email: document.getElementById('reg-email').value,
                password: p1,
                rol: document.getElementById('reg-rol').value
            }) 
        })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') {
                // 4. Mostrar mensaje de éxito
                document.getElementById('register-form').classList.add('hidden');
                const title = document.getElementById('register-title');
                if(title) title.classList.add('hidden');
                document.getElementById('msg-exito-registro').classList.remove('hidden');
            } else {
                msgBox.innerText = json.message || "Error al registrar.";
                msgBox.style.color = "red";
                msgBox.classList.remove('hidden');
            }
        })
        .catch(err => {
            console.error(err);
            msgBox.innerText = "Error de conexión.";
            msgBox.style.color = "red";
            msgBox.classList.remove('hidden');
        })
        .finally(() => {
            btn.innerText = originalText;
            btn.disabled = false;
        });
    });

    // WHATSAPP HELP
    document.getElementById('btn-whatsapp-help')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank');
    });

    // ADMIN: Modales cerrar (x)
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        });
    });

    // DOCENTE: Mis Talleres
    document.getElementById('btn-my-talleres')?.addEventListener('click', () => {
        const user = JSON.parse(sessionStorage.getItem('db_user'));
        document.getElementById('modal-taller-info')?.classList.add('hidden');
        loadMyTalleres(user.id);
    });

    // SUBIR DOCUMENTO
    document.getElementById("form-upload-docs")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const msg = document.getElementById("upload-msg");
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;

        const file = document.getElementById("doc-file").files[0];
        if (!file) {
            showMessage(msg, "Seleccioná un PDF.", "red");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = "Subiendo...";

        showMessage(msg, "Leyendo archivo...");

        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = function () {
            const base64 = String(reader.result || "").split(",")[1];
            if (!base64) {
                showMessage(msg, "No se pudo leer el archivo.", "red");
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
                return;
            }

            showMessage(msg, "Subiendo a Drive...");

            apiPost({
                action: "uploadDocument",
                categoria: document.getElementById("doc-cat").value,
                numero: document.getElementById("doc-num").value,
                titulo: document.getElementById("doc-title").value,
                resumen: document.getElementById("doc-desc").value,
                fileName: file.name,
                mimeType: file.type || "application/pdf",
                fileData: base64
            })
            .then(json => {
                if (json.result === "success") {
                    showMessage(msg, json.message || "Documento subido correctamente.", "green");
                    e.target.reset();
                    // refrescar docs + badge nuevo por últimos 6 días
                    checkNewDocuments();
                } else {
                    showMessage(msg, json.message || "Error al subir.", "red");
                }
            })
            .catch(err => {
                console.error(err);
                showMessage(msg, "Error de conexión al subir el documento.", "red");
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
            });
        };

        reader.onerror = function () {
            showMessage(msg, "No se pudo leer el archivo (FileReader).", "red");
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        };
    });

    // PERFIL
    document.getElementById("form-profile")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const user = JSON.parse(sessionStorage.getItem("db_user"));
        const msg = document.getElementById("profile-msg");

        apiPost({
            action: "updateProfile",
            userId: user.id,
            dni: document.getElementById("prof-dni").value,
            telefono: document.getElementById("prof-tel").value,
            institucion: document.getElementById("prof-inst").value
        })
        .then(json => {
            if (json.result === "success") showMessage(msg, json.message || "Perfil actualizado.", "green");
            else showMessage(msg, json.message || "Error al actualizar.", "red");
        })
        .catch(err => {
            console.error(err);
            showMessage(msg, "Error de conexión.", "red");
        });
    });
}

// --- SESIÓN ---
function checkSession() {
    const user = sessionStorage.getItem('db_user');
    if(user) renderDashboard(JSON.parse(user));
}

function renderDashboard(user) {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('welcome-title').innerText = `Hola, ${user.nombre}`;

    // reset badge
    document.getElementById('notification-badge')?.classList.add('hidden');

    if(user.rol && user.rol.includes('admin')) {
        document.getElementById('admin-panel').classList.remove('hidden');
    } else {
        document.getElementById('docente-panel').classList.remove('hidden');
        // traer favoritos del docente
        fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getProfile', userId: user.id }) })
        .then(r => r.json())
        .then(json => {
            if(json.result === 'success') userFavorites = (json.data.favoritos || []).map(String);
        })
        .finally(() => {
            // chequeo de "luz" por material de los últimos 6 días
            checkNewDocuments();
        });
    }
}

// --- API HELPER ---
function apiPost(payload) {
    return fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(r => r.json());
}

function showMessage(el, text, color) {
    if(!el) return;
    el.innerText = text;
    el.classList.remove('hidden');
    if(color) el.style.color = color;
}

// --- ADMIN: TALLERES ---
function loadAdminTalleresList() {
    const container = document.getElementById('admin-talleres-list');
    container.innerHTML = '<p>Cargando talleres...</p>';
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllTalleres' }) })
    .then(r => r.json())
    .then(json => {
        if(json.data.length === 0) { container.innerHTML = '<p>No hay talleres creados.</p>'; return; }
        let html = '<ul class="taller-list">';
        json.data.forEach(t => {
            html += `
            <li class="taller-item">
                <div class="taller-info">
                    <strong>${t.titulo}</strong> <small>(${t.fechaTaller})</small><br>
                    <span style="font-size:0.85rem; color:#666;">Invitados: ${t.invitados ? t.invitados.length : 0}</span>
                    ${t.materialIds && t.materialIds.length ? `<span style="font-size:0.85rem; color:#666; margin-left:8px;">📚 Biblio: ${t.materialIds.length}</span>` : ''}
                    <div style="margin-top:5px;">
                       ${t.link ? `<a href="${t.link}" target="_blank" class="link-tag">Enlace Meet Activo</a>` : '<span class="no-link">Sin enlace</span>'}
                    </div>
                </div>
                <div class="taller-actions">
                     <button class="btn-sm" onclick="openAddParticipants(${t.id}, '${t.titulo}')">👥 Asistentes</button>
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

function sortDocsDefault(docs) {
    const arr = Array.isArray(docs) ? [...docs] : [];
    arr.sort((a, b) => {
        const aFav = userFavorites.includes(String(a.id)) ? 1 : 0;
        const bFav = userFavorites.includes(String(b.id)) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav; // favoritos primero
        return String(a.titulo || '').localeCompare(String(b.titulo || ''));
    });
    return arr;
}

function renderDocsChecklist(docs, containerId, preselectedIds = []) {
    const container = document.getElementById(containerId);
    if(!container) return;
    if(!Array.isArray(docs) || docs.length === 0) { container.innerHTML = "<p>No hay documentación disponible.</p>"; return; }

    const pre = (preselectedIds || []).map(String);
    let html = '';
    docs.forEach(doc => {
        const isChecked = pre.includes(String(doc.id)) ? 'checked' : '';
        html += `<label class="checklist-item"><input type="checkbox" value="${doc.id}" ${isChecked}> ${doc.titulo} <small>(${doc.categoria || 'Sin categoría'})</small></label>`;
    });
    container.innerHTML = html;
}

function loadDocsForSelection(containerId, preselectedIds = []) {
    const container = document.getElementById(containerId);
    if(container) container.innerHTML = "<p>Cargando documentación...</p>";

    const afterLoad = (docs) => {
        const ordered = [...docs].sort((a,b) => String(a.titulo||'').localeCompare(String(b.titulo||'')));
        renderDocsChecklist(ordered, containerId, preselectedIds);
    };

    if(Array.isArray(globalDocs) && globalDocs.length > 0) {
        afterLoad(globalDocs);
        return;
    }

    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getDocuments' }) })
    .then(r => r.json())
    .then(json => {
        const sixDaysAgo = new Date(); sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
        globalDocs = (json.data || []).map(d => {
            const docDate = parseDate(d.fecha);
            return { ...d, isNew: docDate >= sixDaysAgo };
        });
        afterLoad(globalDocs);
    })
    .catch(err => {
        console.error(err);
        if(container) container.innerHTML = "<p>Error al cargar documentación.</p>";
    });
}

function openAddParticipants(id, titulo) {
    currentEditingTallerId = id;
    document.getElementById('modal-admin-list-talleres').classList.add('hidden');
    document.getElementById('modal-add-participants').classList.remove('hidden');
    document.getElementById('edit-taller-subtitle').innerText = "Taller: " + titulo;
    document.getElementById('add-part-msg').innerText = "";
    document.getElementById('add-docentes-checklist').innerHTML = "<p>Cargando...</p>";
    document.getElementById('add-docs-checklist').innerHTML = "<p>Cargando...</p>";
    document.getElementById('search-add-docs-input').value = "";
    
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllTalleres' }) })
    .then(r => r.json())
    .then(json => {
        const taller = json.data.find(t => t.id == id);
        const invited = taller.invitados || [];
        const materials = taller.materialIds || [];
        // Cargamos docentes y marcamos los que ya están
        if(allDocentesCache.length > 0) renderChecklist(allDocentesCache, 'add-docentes-checklist', invited.map(String));
        else {
             fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getAllDocentesSimple' }) })
             .then(rr => rr.json()).then(jj => {
                 allDocentesCache = jj.data;
                 renderChecklist(allDocentesCache, 'add-docentes-checklist', invited.map(String));
             });
        }

        // Cargamos documentación y marcamos bibliografía seleccionada
        loadDocsForSelection('add-docs-checklist', materials.map(String));

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

// --- DOCS: FILTROS + RENDER ---
function applyFilters() {
    const term = document.getElementById('filter-search').value.toLowerCase();
    const cat = document.getElementById('filter-cat').value;
    const filtered = globalDocs.filter(doc => {
        const matchesText = doc.titulo.toLowerCase().includes(term) || doc.resumen.toLowerCase().includes(term);
        const matchesCat = cat === 'todos' || doc.categoria === cat;
        return matchesText && matchesCat;
    });
    renderDocsList(sortDocsDefault(filtered));
}

function checkNewDocuments() {
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getDocuments' }) })
    .then(r => r.json())
    .then(json => {
        const now = new Date();
        const sixDaysAgo = new Date();
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

        let hasNew = false;
        globalDocs = (json.data || []).map(d => {
            const docDate = parseDate(d.fecha);
            const isNew = docDate >= sixDaysAgo;
            if (isNew) hasNew = true;
            return { ...d, isNew: isNew };
        });

        if(hasNew) {
            document.getElementById('notification-badge')?.classList.remove('hidden');
        } else {
            document.getElementById('notification-badge')?.classList.add('hidden');
        }
    })
    .catch(err => console.error('checkNewDocuments error', err));
}

function loadMyTalleres(userId) {
    const container = document.getElementById('talleres-container');
    container.innerHTML = '<p>Buscando talleres...</p>';
    fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getMyTalleres', userId: userId }) })
    .then(r => r.json())
    .then(json => {
        globalMyTalleres = json.data || [];
        if(globalMyTalleres.length === 0) {
            container.innerHTML = `<div class="empty-state-msg"><p>No estás inscripto en talleres activos.</p></div>`;
            return;
        }
        let html = '';
        globalMyTalleres.forEach(t => {
            const hasBiblio = Array.isArray(t.materialIds) && t.materialIds.length > 0;
            html += `
            <div class="card card-taller" onclick="showTallerInfoById('${t.id}')">
                <h3>${t.titulo}</h3>
                <p>📅 ${t.fechaTaller}</p>
                ${t.link ? '<span class="badge-link">Enlace Disponible</span>' : ''}
                ${hasBiblio ? '<span class="badge" style="margin-left:6px;">📚 Bibliografía</span>' : ''}
            </div>`;
        });
        container.innerHTML = html;
    })
    .catch(err => {
        console.error(err);
        container.innerHTML = `<div class="empty-state-msg"><p>Error al cargar talleres.</p></div>`;
    });
}

function showTallerInfoById(tallerId) {
    const taller = (globalMyTalleres || []).find(t => String(t.id) === String(tallerId));
    if (!taller) return;
    showTallerInfo(taller);
}

function ensureDocsLoaded() {
    if (Array.isArray(globalDocs) && globalDocs.length > 0) return Promise.resolve(globalDocs);
    return fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'getDocuments' }) })
        .then(r => r.json())
        .then(json => {
            const sixDaysAgo = new Date(); sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
            globalDocs = (json.data || []).map(d => {
                const docDate = parseDate(d.fecha);
                return { ...d, isNew: docDate >= sixDaysAgo };
            });
            return globalDocs;
        });
}

function showTallerInfo(taller) {
    document.getElementById('modal-taller-info').classList.remove('hidden');
    document.getElementById('info-taller-titulo').innerText = taller.titulo || "Taller";

    const actionContainer = document.getElementById('taller-action-container');
    if(taller.link) {
        actionContainer.innerHTML = `<a href="${taller.link}" target="_blank" class="btn-primary" style="display:block; text-align:center; text-decoration:none;">Unirse a la Reunión</a>`;
    } else {
        actionContainer.innerHTML = `<p style="color:#777; font-style:italic;">El enlace de la reunión aún no está disponible.</p>`;
    }

    const biblioContainer = document.getElementById('taller-biblio-container');
    const ids = Array.isArray(taller.materialIds) ? taller.materialIds.map(String) : [];
    if(!biblioContainer) return;

    if(ids.length === 0) {
        biblioContainer.innerHTML = `<p style="color:#777; font-style:italic;">No hay bibliografía asignada.</p>`;
        return;
    }

    biblioContainer.innerHTML = `<p>Cargando bibliografía...</p>`;
    ensureDocsLoaded().then(docs => {
        const selected = docs.filter(d => ids.includes(String(d.id)));
        if(selected.length === 0) {
            biblioContainer.innerHTML = `<p style="color:#777; font-style:italic;">No se encontró la bibliografía asignada.</p>`;
            return;
        }
        let html = '<ul style="list-style:none; padding-left:0; margin:0;">';
        selected.forEach(doc => {
            html += `<li style="padding:8px 0; border-bottom:1px solid #eee;">
                        <a href="${doc.url}" target="_blank" style="text-decoration:none; font-weight:700;">${doc.titulo}</a>
                        ${doc.isNew ? '<span class="badge-new" style="margin-left:6px;">NUEVO</span>' : ''}
                        <div style="font-size:0.85rem; color:#666; margin-top:2px;">
                            <span class="badge">${doc.categoria}</span>
                            <span style="margin-left:6px;">${doc.numero || 'S/N'} · ${formatDateDisplay(doc.fecha)}</span>
                        </div>
                    </li>`;
        });
        html += '</ul>';
        biblioContainer.innerHTML = html;
    });
}

// --- DOCS: LISTA ---
function renderDocsList(docs) {
    const container = document.getElementById('docs-list-container');
    if(docs.length === 0) { container.innerHTML = '<p>No se encontraron documentos.</p>'; return; }
    let html = '<ul style="list-style:none; padding-left:0; margin:0;">';
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
        if(json.result === 'success') { userFavorites = (json.favoritos || []).map(String); }
    });
}
