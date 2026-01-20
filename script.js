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
        currentTallerInvitedIds = []; 
        loadDocentesForSelection('docentes-checklist');
    });

    // ADMIN: Submit Crear Taller
    document.getElementById('form-create-taller')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = document.getElementById('taller-msg');
        const checked = document.querySelectorAll('#docentes-checklist input:checked');
        const selectedIds = Array.from(checked).map(cb => cb.value);

        msg.innerText = "Creando..."; msg.classList.remove('hidden');
        
        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', 
            body: JSON.stringify({
                action: 'createTaller',
                titulo: document.getElementById('taller-titulo').value,
                fechaTaller: document.getElementById('taller-fecha').value,
                invitados: selectedIds 
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
        const fileInput = document.getElementById('doc-file');
        const file = fileInput?.files?.[0];

        // Mostrar feedback siempre
        if (msg) {
            msg.classList.remove('hidden');
            msg.style.color = "var(--primary)";
            msg.innerText = "";
        }

        if (!file) {
            if (msg) { msg.style.color = "red"; msg.innerText = "Seleccioná un PDF antes de subir."; }
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerText : "";
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Subiendo..."; }

        if (msg) msg.innerText = "Leyendo archivo...";

        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = function () {
            const base64 = String(reader.result || "").split(',')[1];
            if (!base64) {
                if (msg) { msg.style.color = "red"; msg.innerText = "No se pudo leer el archivo."; }
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
                return;
            }

            if (msg) msg.innerText = "Subiendo a Drive...";

            fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: 'uploadDocument',
                    categoria: document.getElementById('doc-cat').value,
                    numero: document.getElementById('doc-num').value,
                    titulo: document.getElementById('doc-title').value,
                    resumen: document.getElementById('doc-desc').value,
                    fileName: file.name,
                    mimeType: file.type || "application/pdf",
                    fileData: base64
                })
            })
                .then(r => r.json())
                .then(json => {
                    if (json.result === "success") {
                        if (msg) { msg.style.color = "green"; msg.innerText = json.message || "Documento subido correctamente."; }
                        e.target.reset();
                    } else {
                        if (msg) { msg.style.color = "red"; msg.innerText = json.message || "Error al subir el documento."; }
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

        reader.onerror = function () {
            if (msg) { msg.style.color = "red"; msg.innerText = "No se pudo leer el archivo (FileReader)."; }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
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
        if(json.data.length === 0) { container.innerHTML = '<p>No hay talleres creados.</p>'; return; }
        let html = '<ul class="taller-list">';
        json.data.forEach(t => {
            html += `
            <li class="taller-item">
                <div class="taller-info">
                    <strong>${t.titulo}</strong> <small>(${t.fechaTaller})</small><br>
                    <span style="font-size:0.85rem; color:#666;">Invitados: ${t.invitados ? t.invitados.length : 0}</span>
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
            html += `
            <div class="card card-taller" onclick="showTallerInfo('${t.titulo}', '${t.link}')">
                <h3>${t.titulo}</h3>
                <p>📅 ${t.fechaTaller}</p>
                ${t.link ? '<span class="badge-link">Enlace Disponible</span>' : ''}
            </div>`;
        });
        container.innerHTML = html;
    });
}

function showTallerInfo(titulo, link) {
    document.getElementById('modal-taller-info').classList.remove('hidden');
    document.getElementById('info-taller-titulo').innerText = titulo;
    const actionContainer = document.getElementById('taller-action-container');
    if(link) {
        actionContainer.innerHTML = `<a href="${link}" target="_blank" class="btn-primary" style="display:block; text-align:center; text-decoration:none;">Unirse a la Reunión</a>`;
    } else {
        actionContainer.innerHTML = `<p style="color:#777; font-style:italic;">El enlace de la reunión aún no está disponible.</p>`;
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
