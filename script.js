// --- CONFIGURACIÓN ---
// IMPORTANTE: REEMPLAZA ESTA URL CON LA DE TU NUEVO DEPLOY
const APPS_SCRIPT_URL = "https://docentesbrown.github.io/docentes-brown-mvp"; 
const WHATSAPP_NUMBER = "5491153196358";

// --- VARIABLES GLOBALES ---
let globalDocs = [];
let allDocentesCache = [];
let selectedTallerIdForLink = null;
let currentEditingTallerId = null; // Para gestión de participantes
let userFavorites = [];

let appsCache = [];
let pubsCache = [];
let tutsCache = [];
let studentsActiveTab = "pubs"; // pubs | tuts
let allTalleresCache = []; // Cache para talleres admin

// --- HELPERS API ---
function apiPost(payload) {
  return fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  }).then(r => r.json());
}

function showMessage(el, text, color = "var(--primary)") {
  if (!el) return;
  el.classList.remove("hidden");
  el.style.color = color;
  el.innerText = text;
}

function hideMessage(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.innerText = "";
}

// --- INICIO SEGURO ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Cargado. Iniciando sistema...");
  setupEventListeners();

  const splash = document.getElementById("splash-screen");
  setTimeout(() => {
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.classList.add("hidden");
      document.getElementById("app-container").style.display = "block";
      checkSession();
    }, 500);
  }, 2000);
});

function setupEventListeners() {
  // Tabs Login/Registro
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      const tab = e.target.dataset.tab;
      if (tab === "login") {
        document.getElementById("login-form-container").classList.remove("hidden");
        document.getElementById("register-form-container").classList.add("hidden");
      } else {
        document.getElementById("login-form-container").classList.add("hidden");
        document.getElementById("register-form-container").classList.remove("hidden");
      }
    });
  });

  // Auth Forms
  document.getElementById("form-login").addEventListener("submit", handleLogin);
  document.getElementById("form-register").addEventListener("submit", handleRegister);
  document.getElementById("logout-btn").addEventListener("click", doLogout);

  // Navegacion Dashboard
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const parentSection = e.target.closest("section"); 
      parentSection.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      const viewId = e.target.dataset.view;
      parentSection.querySelectorAll(".content-panel").forEach(p => p.classList.add("hidden"));
      
      // Mapeo de vistas
      if(viewId === 'home') document.getElementById('home-content').classList.remove('hidden');
      if(viewId === 'documentacion') {
          document.getElementById('documentacion-content').classList.remove('hidden');
          loadDocuments();
      }
      if(viewId === 'talleres') {
          document.getElementById('talleres-content').classList.remove('hidden');
          loadTalleresDocente();
      }
      if(viewId === 'perfil') {
          document.getElementById('perfil-content').classList.remove('hidden');
          loadProfile();
      }
      // ADMIN
      if(viewId === 'admin-docs') {
          document.getElementById('admin-docs-content').classList.remove('hidden');
          loadDocumentsAdmin();
      }
      if(viewId === 'admin-talleres') {
          document.getElementById('admin-talleres-content').classList.remove('hidden');
          loadTalleresAdmin();
      }
      if(viewId === 'admin-apps') {
          document.getElementById('admin-apps-content').classList.remove('hidden');
          loadAppsAdmin();
      }
      // ESTUDIANTES
      if(viewId === 'st-pubs') {
          document.getElementById('st-pubs-content').classList.remove('hidden');
          loadStudentPubs();
      }
      if(viewId === 'st-tuts') {
          document.getElementById('st-tuts-content').classList.remove('hidden');
          loadStudentTuts();
      }
    });
  });

  // MODALES GESTION
  setupModal("btn-upload-doc", "modal-upload", "close-modal");
  setupModal("btn-edit-profile", "modal-profile", "close-modal");
  setupModal("btn-new-app", "modal-new-app", "close-modal");

  // --- LOGICA NUEVO / EDITAR TALLER ---
  const btnNewTaller = document.getElementById('btn-new-taller');
  if(btnNewTaller){
      btnNewTaller.addEventListener('click', () => {
          document.getElementById('modal-taller-title').innerText = "Nuevo Taller";
          document.getElementById('edit-taller-id').value = ""; 
          document.getElementById('form-create-taller').reset();
          populateBiblioSelect([]); // Select vacío
          document.getElementById('modal-new-taller').classList.remove('hidden');
      });
  }

  // Delegación para EDITAR TALLER (Boton Lápiz)
  document.getElementById('admin-talleres-list').addEventListener('click', (e) => {
    if(e.target.closest('.btn-edit-taller')) {
        const btn = e.target.closest('.btn-edit-taller');
        const id = btn.dataset.id;
        const taller = allTalleresCache.find(t => String(t.id) === String(id));
        
        if(taller) {
            document.getElementById('modal-taller-title').innerText = "Editar Taller";
            document.getElementById('edit-taller-id').value = taller.id;
            document.getElementById('taller-titulo').value = taller.titulo;
            
            // Formatear fecha input
            let dateObj = parseDate(taller.fechaTaller);
            let y = dateObj.getFullYear();
            let m = String(dateObj.getMonth()+1).padStart(2,'0');
            let d = String(dateObj.getDate()).padStart(2,'0');
            document.getElementById('taller-fecha').value = `${y}-${m}-${d}`;
            
            // Precargar bibliografía
            populateBiblioSelect(taller.bibliografiaIDs || []); 
            document.getElementById('modal-new-taller').classList.remove('hidden');
        }
    }
  });

  document.querySelectorAll(".close-modal").forEach(span => {
    span.addEventListener("click", () => {
       document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
    });
  });

  // SUBMITS
  document.getElementById("form-upload").addEventListener("submit", handleUploadDoc);
  document.getElementById("form-profile").addEventListener("submit", handleUpdateProfile);
  document.getElementById("form-create-app").addEventListener("submit", handleCreateApp);
  
  // Submit TALLER (Crear / Editar)
  document.getElementById('form-create-taller').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-taller-id').value;
    const titulo = document.getElementById('taller-titulo').value;
    const fecha = document.getElementById('taller-fecha').value; 
    
    // Obtener seleccionados del multi-select
    const select = document.getElementById('taller-biblio-select');
    const selectedValues = Array.from(select.selectedOptions).map(option => option.value);

    const parts = fecha.split('-');
    const fechaEnvio = `${parts[2]}/${parts[1]}/${parts[0]}`;

    if (id) {
        // EDICION
        apiPost({
            action: 'updateTallerDetails',
            tallerId: id,
            titulo: titulo,
            fechaTaller: fechaEnvio,
            bibliografia: selectedValues
        }).then(res => {
            alert(res.message);
            document.getElementById('modal-new-taller').classList.add('hidden');
            loadTalleresAdmin(); 
        });
    } else {
        // CREACION
        apiPost({
            action: 'createTaller',
            titulo: titulo,
            fechaTaller: fechaEnvio,
            bibliografia: selectedValues,
            invitados: []
        }).then(res => {
            alert(res.message);
            document.getElementById('modal-new-taller').classList.add('hidden');
            loadTalleresAdmin();
        });
    }
  });

  document.getElementById("btn-save-participants").addEventListener("click", saveParticipants);

  // SEARCH DOCS
  document.getElementById("search-docs").addEventListener("input", (e) => {
      renderDocs(globalDocs, e.target.value);
  });
  
  // WHATSAPP
  document.getElementById("whatsapp-float").addEventListener("click", () => {
      window.open(`https://wa.me/${WHATSAPP_NUMBER}`, "_blank");
  });
}

function setupModal(btnId, modalId, closeClass) {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener("click", () => {
            document.getElementById(modalId).classList.remove("hidden");
        });
    }
}

function populateBiblioSelect(selectedIds) {
    const select = document.getElementById('taller-biblio-select');
    select.innerHTML = "";
    globalDocs.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.text = `${doc.categoria}: ${doc.titulo}`;
        if(selectedIds.includes(String(doc.id)) || selectedIds.includes(Number(doc.id))) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}


// --- SESION ---
function checkSession() {
  const userStr = sessionStorage.getItem("db_user");
  if (userStr) {
    const user = JSON.parse(userStr);
    showDashboard(user);
  } else {
    document.getElementById("login-view").classList.remove("hidden");
  }
}

function showDashboard(user) {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("main-header").classList.remove("hidden");
  document.getElementById("user-name-display").innerText = user.nombre;
  document.getElementById("user-role-display").innerText = user.rol.toUpperCase();
  document.getElementById("whatsapp-float").classList.remove("hidden");

  if (user.rol === "admin") {
      document.getElementById("admin-view").classList.remove("hidden");
      loadDocumentsAdmin(); // Carga docs para tenerlos disponibles en los selects
  } else if (user.rol === "docente") {
      document.getElementById("dashboard-view").classList.remove("hidden");
      document.getElementById('prof-nombre').innerText = user.nombre;
      document.getElementById('prof-email').innerText = user.email;
      loadDocuments();
  } else if (user.rol.includes("estudiante")) {
      document.getElementById("student-view").classList.remove("hidden");
      if(user.rol === 'estudiante_admin') {
          document.querySelectorAll('.student-create-btn').forEach(b => b.classList.remove('hidden'));
      }
      loadStudentPubs();
  }
}

function doLogout() {
  sessionStorage.removeItem("db_user");
  location.reload();
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const pass = document.getElementById("login-pass").value;
  const msg = document.getElementById("auth-message");
  
  showMessage(msg, "Autenticando...", "#666");

  apiPost({ action: "login", email: email, password: pass })
    .then(data => {
      if (data.result === "success") {
        sessionStorage.setItem("db_user", JSON.stringify(data.user));
        showDashboard(data.user);
        hideMessage(msg);
      } else {
        showMessage(msg, "Error: " + data.message, "red");
      }
    })
    .catch(err => showMessage(msg, "Error de conexión", "red"));
}

function handleRegister(e) {
  e.preventDefault();
  const msg = document.getElementById("auth-message");
  showMessage(msg, "Registrando...", "#666");

  const data = {
      action: "register",
      nombre: document.getElementById("reg-nombre").value,
      email: document.getElementById("reg-email").value,
      password: document.getElementById("reg-pass").value,
      rol: document.getElementById("reg-rol").value
  };

  apiPost(data).then(res => {
      if (res.result === "success") {
          showMessage(msg, "Registro exitoso. Espera la activación de un Admin.", "green");
          document.getElementById("form-register").reset();
      } else {
          showMessage(msg, res.message, "red");
      }
  });
}

// --- DOCUMENTOS ---
function loadDocuments() {
    apiPost({ action: "getDocuments" }).then(res => {
        globalDocs = res.data || [];
        renderDocs(globalDocs);
        // Si el usuario es docente, cargamos su perfil para ver favoritos
        const user = JSON.parse(sessionStorage.getItem("db_user"));
        if(user && user.rol === 'docente') {
             apiPost({ action: "getProfile", userId: user.id }).then(p => {
                 if(p.result === "success") {
                     userFavorites = p.data.favoritos || [];
                     renderDocs(globalDocs);
                     renderFavorites();
                 }
             });
        }
    });
}

function renderDocs(list, filterText = "") {
    const container = document.getElementById("docs-list");
    container.innerHTML = "";
    
    const filtered = list.filter(d => 
        d.titulo.toLowerCase().includes(filterText.toLowerCase()) || 
        d.categoria.toLowerCase().includes(filterText.toLowerCase())
    );

    filtered.forEach(d => {
        const isFav = userFavorites.includes(String(d.id));
        const html = `
            <div class="card">
                <div class="card-header">
                    <span class="badge">${d.categoria}</span>
                    <button class="fav-btn ${isFav ? 'fav-active' : ''}" onclick="toggleDocFavorite(${d.id}, this)">
                        ${isFav ? '♥' : '♡'}
                    </button>
                </div>
                <h3>${d.titulo}</h3>
                <p>${d.resumen || ""}</p>
                <div class="card-footer">
                   <a href="${d.url}" target="_blank" class="btn-primary">Ver Documento</a>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

function loadDocumentsAdmin() {
    apiPost({ action: "getDocuments" }).then(res => {
        globalDocs = res.data || [];
        const container = document.getElementById("admin-docs-list");
        container.innerHTML = "";
        globalDocs.forEach(d => {
            container.innerHTML += `
                <div class="list-item">
                    <div><strong>${d.categoria}</strong> - ${d.titulo}</div>
                    <a href="${d.url}" target="_blank">Ver</a>
                </div>
            `;
        });
    });
}

function handleUploadDoc(e) {
    e.preventDefault();
    const file = document.getElementById("doc-file").files[0];
    if(!file) return;

    const msg = document.getElementById("upload-msg");
    showMessage(msg, "Subiendo archivo...", "#666");

    const reader = new FileReader();
    reader.onload = function(evt) {
        const b64 = evt.target.result.split(",")[1];
        const payload = {
            action: "uploadDocument",
            fileData: b64,
            fileName: file.name,
            mimeType: file.type,
            categoria: document.getElementById("doc-cat").value,
            titulo: document.getElementById("doc-titulo").value,
            numero: document.getElementById("doc-num").value,
            resumen: document.getElementById("doc-resumen").value
        };
        apiPost(payload).then(res => {
            if(res.result === "success") {
                showMessage(msg, "Subido OK!", "green");
                setTimeout(() => { 
                    document.getElementById("modal-upload").classList.add("hidden"); 
                    loadDocumentsAdmin(); 
                }, 1500);
            } else {
                showMessage(msg, "Error: " + res.message, "red");
            }
        });
    };
    reader.readAsDataURL(file);
}

// --- TALLERES (ADMIN) ---
function loadTalleresAdmin() {
    apiPost({ action: "getAllTalleres" }).then(res => {
        const container = document.getElementById("admin-talleres-list");
        container.innerHTML = "";
        allTalleresCache = res.data || [];
        
        allTalleresCache.forEach(t => {
            let html = `
                <div class="card">
                    <div class="card-header">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                           <h3>${t.titulo}</h3>
                           <button class="btn-icon btn-edit-taller" data-id="${t.id}" title="Editar Info">✏️</button>
                        </div>
                        <span class="date-badge">${formatDateDisplay(t.fechaTaller)}</span>
                    </div>
                    <div class="card-body">
                        <p>Inscriptos: <strong>${t.invitados ? t.invitados.length : 0}</strong></p>
                        <div style="margin-top:10px; display:flex; gap:5px; flex-wrap:wrap;">
                           <button onclick="openParticipants(${t.id})" class="btn-secondary small">Participantes</button>
                           <button onclick="setMeetLink(${t.id})" class="btn-secondary small">Link Meet</button>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += html;
        });
    });
}

function openParticipants(tallerId) {
    currentEditingTallerId = tallerId;
    document.getElementById("modal-participants").classList.remove("hidden");
    
    // Cargar docentes
    if(allDocentesCache.length === 0) {
        apiPost({ action: "getAllDocentesSimple" }).then(res => {
            allDocentesCache = res.data || [];
            renderParticipantsUI(tallerId);
        });
    } else {
        renderParticipantsUI(tallerId);
    }
}

function renderParticipantsUI(tallerId) {
    const taller = allTalleresCache.find(t => t.id == tallerId);
    const currentIds = taller.invitados || [];
    
    const listAll = document.getElementById("list-all-docentes");
    const listIn = document.getElementById("list-taller-participants");
    
    listAll.innerHTML = "";
    listIn.innerHTML = "";
    
    allDocentesCache.forEach(doc => {
        const li = document.createElement("li");
        li.innerText = doc.nombre;
        li.dataset.id = doc.id;
        
        if(currentIds.includes(String(doc.id)) || currentIds.includes(doc.id)) {
            li.classList.add("selected");
            li.onclick = function() { this.remove(); listAll.appendChild(createLi(doc, false)); };
            listIn.appendChild(li);
        } else {
            li.onclick = function() { this.remove(); listIn.appendChild(createLi(doc, true)); };
            listAll.appendChild(li);
        }
    });
}

function createLi(doc, isSelected) {
    const li = document.createElement("li");
    li.innerText = doc.nombre;
    li.dataset.id = doc.id;
    if(isSelected) li.classList.add("selected");
    
    li.onclick = function() {
        this.remove();
        if(isSelected) document.getElementById("list-all-docentes").appendChild(createLi(doc, false));
        else document.getElementById("list-taller-participants").appendChild(createLi(doc, true));
    };
    return li;
}

function saveParticipants() {
    const listIn = document.getElementById("list-taller-participants").children;
    const ids = Array.from(listIn).map(li => li.dataset.id);
    
    apiPost({ action: "saveTallerParticipants", tallerId: currentEditingTallerId, ids: ids })
    .then(res => {
        alert(res.message);
        document.getElementById("modal-participants").classList.add("hidden");
        loadTalleresAdmin();
    });
}

function setMeetLink(tallerId) {
    const link = prompt("Ingrese el enlace de Google Meet:");
    if(link) {
        apiPost({ action: "updateTallerLink", tallerId, link }).then(res => alert(res.message));
    }
}

// --- TALLERES (DOCENTE) ---
function loadTalleresDocente() {
    const user = JSON.parse(sessionStorage.getItem("db_user"));
    apiPost({ action: "getMyTalleres", userId: user.id }).then(res => {
        renderDocenteTalleres(res.data || []);
    });
}

function renderDocenteTalleres(list) {
    const container = document.getElementById("my-talleres-list");
    container.innerHTML = "";
    if(list.length === 0) { container.innerHTML = "<p>No estás inscripto en ningún taller.</p>"; return; }

    list.forEach(t => {
        let htmlAccion = t.link 
            ? `<a href="${t.link}" target="_blank" class="btn-primary">Ingresar al Taller</a>`
            : `<button disabled class="btn-secondary">Enlace pendiente</button>`;
        
        // Renderizar Bibliografía si existe
        let htmlBiblio = "";
        if (t.bibliografia && t.bibliografia.length > 0) {
            htmlBiblio = `<div style="margin-top:15px; border-top:1px dashed #ccc; padding-top:10px;">
                            <strong style="font-size:0.9rem; color:var(--primary);">Bibliografía / Material:</strong>
                            <ul style="list-style:none; padding:0; margin-top:5px;">`;
            
            t.bibliografia.forEach(b => {
                htmlBiblio += `<li style="margin-bottom:5px;">
                                 <a href="${b.url}" target="_blank" style="text-decoration:none; color:var(--secondary); font-size:0.9rem;">
                                   📄 ${b.titulo}
                                 </a>
                               </li>`;
            });
            htmlBiblio += `</ul></div>`;
        }

        const html = `
            <div class="card">
                <div class="card-header">
                   <h3>${t.titulo}</h3>
                   <span class="date-badge">${formatDateDisplay(t.fechaTaller)}</span>
                </div>
                <div class="card-body">
                    <p>Usted se encuentra inscripto.</p>
                    <div style="margin-top:1rem;">${htmlAccion}</div>
                    ${htmlBiblio}
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

// --- APPS ---
function loadAppsAdmin() {
    apiPost({ action: "getApps" }).then(res => {
        const c = document.getElementById("admin-apps-list");
        c.innerHTML = "";
        (res.data || []).forEach(a => {
            c.innerHTML += `<div class="card"><h3>${a.nombre}</h3><p>${a.funciones}</p></div>`;
        });
    });
}
function handleCreateApp(e) {
    e.preventDefault();
    apiPost({
        action: "createApp",
        nombre: document.getElementById("app-nombre").value,
        enlace: document.getElementById("app-enlace").value,
        funciones: document.getElementById("app-funciones").value
    }).then(res => {
        alert(res.message);
        document.getElementById("modal-new-app").classList.add("hidden");
        loadAppsAdmin();
    });
}

// --- PERFIL ---
function loadProfile() {
    const user = JSON.parse(sessionStorage.getItem("db_user"));
    apiPost({ action: "getProfile", userId: user.id }).then(res => {
        if(res.result === "success") {
            const d = res.data;
            document.getElementById("prof-dni").value = d.dni;
            document.getElementById("prof-tel").value = d.telefono;
            document.getElementById("prof-inst").value = d.institucion;
            userFavorites = d.favoritos || [];
            renderFavorites();
        }
    });
}
function handleUpdateProfile(e) {
    e.preventDefault();
    const user = JSON.parse(sessionStorage.getItem("db_user"));
    apiPost({
        action: "updateProfile",
        userId: user.id,
        dni: document.getElementById("prof-dni").value,
        telefono: document.getElementById("prof-tel").value,
        institucion: document.getElementById("prof-inst").value
    }).then(res => alert(res.message));
}
function renderFavorites() {
    const c = document.getElementById("fav-list");
    c.innerHTML = "";
    if(userFavorites.length === 0) { c.innerHTML = "<p>No tienes favoritos guardados.</p>"; return; }
    
    const favDocs = globalDocs.filter(d => userFavorites.includes(String(d.id)));
    favDocs.forEach(d => {
        c.innerHTML += `
           <div class="card small-card">
              <h4>${d.titulo}</h4>
              <a href="${d.url}" target="_blank">Ver</a>
           </div>`;
    });
}
function toggleDocFavorite(docId, btn) {
    const user = JSON.parse(sessionStorage.getItem("db_user"));
    const isActive = btn.classList.contains("fav-active");
    if (isActive) { btn.classList.remove("fav-active"); btn.innerHTML = "♡"; }
    else { btn.classList.add("fav-active"); btn.innerHTML = "♥"; }

    apiPost({ action: "toggleFavorite", userId: user.id, docId })
      .then(json => {
         if (json.result === "success") userFavorites = json.favoritos;
      });
}

// --- ESTUDIANTES ---
function loadStudentPubs() { /* Logica publicaciones similar */ }
function loadStudentTuts() { /* Logica tutoriales similar */ }

// --- UTILIDADES ---
function parseDate(dateInput) {
  if (!dateInput) return new Date(0);
  let str = String(dateInput).trim();
  if (str.includes("T")) str = str.split("T")[0];
  if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const parts = str.split("/");
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  if (str.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
    const parts = str.split("-");
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(str);
}

function formatDateDisplay(dateInput) {
    const d = parseDate(dateInput);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}
