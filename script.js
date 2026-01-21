// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzm4PKtttlamu3mCWi6HRDkflThXS8Dx9UNMx3TIXc3q3MI_aDETFCthtyg6gGpoPnE9Q/exec";
const WHATSAPP_NUMBER = "5491153196358";

// --- VARIABLES GLOBALES ---
let globalDocs = [];
let allDocentesCache = [];
let selectedTallerIdForLink = null;
let currentEditingTallerId = null;
let userFavorites = [];

let appsCache = [];
let pubsCache = [];
let tutsCache = [];
let studentsActiveTab = "pubs"; // pubs | tuts

// --- HELPERS API (sin headers JSON para evitar CORS preflight) ---
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

  const splashScreen = document.getElementById("splash-screen");
  const appContainer = document.getElementById("app-container");

  setTimeout(() => {
    if (splashScreen) splashScreen.classList.add("hidden");
    if (appContainer) appContainer.style.display = "block";
    checkSession();
  }, 2000);
});

// --- EVENTOS ---
function setupEventListeners() {
  // ADMIN: Documentos
  document.getElementById("btn-admin-docs")?.addEventListener("click", () => {
    document.getElementById("modal-upload-docs").classList.remove("hidden");
    hideMessage(document.getElementById("upload-msg"));
  });

  // ADMIN: Talleres
  document.getElementById("btn-admin-talleres")?.addEventListener("click", () => {
    document.getElementById("modal-admin-list-talleres").classList.remove("hidden");
    loadAdminTalleresList();
  });

  // ADMIN: Aplicaciones
  document.getElementById("btn-admin-apps")?.addEventListener("click", () => {
    openAppsModal(true);
  });

  // ADMIN: Estudiantes (contenido)
  document.getElementById("btn-admin-estudiantes")?.addEventListener("click", () => {
    openStudentsModal(true, "pubs");
  });

  // DOCENTE: Ver Documentos
  document.getElementById("btn-view-docs")?.addEventListener("click", () => {
    document.getElementById("modal-view-docs").classList.remove("hidden");
    document.getElementById("filter-search").value = "";
    document.getElementById("filter-cat").value = "todos";

    if (!globalDocs || globalDocs.length === 0) {
      document.getElementById("docs-list-container").innerHTML =
        `<div class="empty-state-msg"><p>No hay documentación cargada.</p><small>Volvé más tarde.</small></div>`;
      return;
    }

    // Mostrar todo, pero con "Mis Favoritos" arriba
    renderDocsList(globalDocs);
  });

  // DOCENTE/ESTUDIANTE: Apps
  document.getElementById("btn-view-apps")?.addEventListener("click", () => openAppsModal(false));
  document.getElementById("btn-view-apps-est")?.addEventListener("click", () => openAppsModal(false));

  // ESTUDIANTE: Publicaciones / Tutoriales
  document.getElementById("btn-stu-publicaciones")?.addEventListener("click", () => openStudentsModal(false, "pubs"));
  document.getElementById("btn-stu-tutoriales")?.addEventListener("click", () => openStudentsModal(false, "tuts"));

  // DOCENTE: Ver Perfil
  document.getElementById("btn-view-profile")?.addEventListener("click", () => {
    document.getElementById("modal-profile").classList.remove("hidden");
    const user = JSON.parse(sessionStorage.getItem("db_user"));
    document.getElementById("static-nombre").value = user.nombre;
    document.getElementById("static-email").value = user.email;

    apiPost({ action: "getProfile", userId: user.id })
      .then(json => {
        if (json.result === "success") {
          document.getElementById("prof-dni").value = json.data.dni;
          document.getElementById("prof-tel").value = json.data.telefono;
          document.getElementById("prof-inst").value = json.data.institucion;
        }
      });
  });

  // FILTROS DOCS
  document.getElementById("filter-search")?.addEventListener("keyup", applyFilters);
  document.getElementById("filter-cat")?.addEventListener("change", applyFilters);

  // LOGIN
  document.getElementById("login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msgBox = document.getElementById("login-message");
    showMessage(msgBox, "Entrando...");

    apiPost({
      action: "login",
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-pass").value
    })
    .then(json => {
      if (json.result === "success") {
        sessionStorage.setItem("db_user", JSON.stringify(json.user));
        renderDashboard(json.user);
      } else {
        showMessage(msgBox, json.message, "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msgBox, "Error de conexión.", "red");
    });
  });

  // LOGOUT
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    sessionStorage.removeItem("db_user");
    location.reload();
  });

  // ABRIR REGISTRO
  document.getElementById("open-register-modal")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("register-modal").classList.remove("hidden");
    document.getElementById("register-form").classList.remove("hidden");
    document.getElementById("register-form").reset();
    const title = document.getElementById("register-title");
    if (title) title.classList.remove("hidden");
    document.getElementById("msg-exito-registro").classList.add("hidden");
    document.getElementById("register-msg").classList.add("hidden");
  });

  // REGISTRO
  document.getElementById("register-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const p1 = document.getElementById("reg-pass").value;
    const p2 = document.getElementById("reg-pass-confirm").value;
    const msgBox = document.getElementById("register-msg");

    if (p1 !== p2) {
      showMessage(msgBox, "Las contraseñas no coinciden.", "red");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Enviando solicitud...";
    btn.disabled = true;
    msgBox.classList.add("hidden");

    apiPost({
      action: "register",
      nombre: document.getElementById("reg-nombre").value,
      email: document.getElementById("reg-email").value,
      rol: document.getElementById("reg-rol").value,
      password: p1
    })
    .then(json => {
      if (json.result === "success") {
        document.getElementById("register-form").classList.add("hidden");
        const title = document.getElementById("register-title");
        if (title) title.classList.add("hidden");
        document.getElementById("msg-exito-registro").classList.remove("hidden");
      } else {
        showMessage(msgBox, "Error: " + json.message, "red");
        btn.innerText = originalText;
        btn.disabled = false;
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msgBox, "Error de conexión. Intente nuevamente.", "red");
      btn.innerText = originalText;
      btn.disabled = false;
    });
  });

  // SUBIR DOCUMENTO (admin)
  document.getElementById("form-upload-docs")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("upload-msg");
    const fileInput = document.getElementById("doc-file");
    const file = fileInput?.files?.[0];

    if (!file) {
      showMessage(msg, "Seleccioná un PDF antes de subir.", "red");
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
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
      showMessage(msg, json.message || "Perfil actualizado.", "green");
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error al guardar.", "red");
    });
  });

  // ADMIN: Crear Taller (abrir)
  document.getElementById("btn-open-create-taller")?.addEventListener("click", () => {
    document.getElementById("modal-admin-list-talleres").classList.add("hidden");
    document.getElementById("modal-create-taller").classList.remove("hidden");
    document.getElementById("form-create-taller").reset();
    hideMessage(document.getElementById("taller-msg"));
    document.getElementById("count-selected").innerText = "0";
    loadDocentesForSelection("docentes-checklist");
  });

  // ADMIN: Crear Taller (submit)
  document.getElementById("form-create-taller")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("taller-msg");
    const checked = document.querySelectorAll("#docentes-checklist input:checked");
    const selectedIds = Array.from(checked).map(cb => cb.value);

    showMessage(msg, "Creando...");

    apiPost({
      action: "createTaller",
      titulo: document.getElementById("taller-titulo").value,
      fechaTaller: document.getElementById("taller-fecha").value,
      invitados: selectedIds
    })
    .then(json => {
      if (json.result === "success") {
        showMessage(msg, "Listo.", "green");
        setTimeout(() => {
          document.getElementById("modal-create-taller").classList.add("hidden");
          document.getElementById("modal-admin-list-talleres").classList.remove("hidden");
          loadAdminTalleresList();
        }, 800);
      } else {
        showMessage(msg, json.message || "Error.", "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error de conexión.", "red");
    });
  });

  // ADMIN: Guardar participantes
  document.getElementById("btn-confirm-add-participants")?.addEventListener("click", () => {
    const msg = document.getElementById("add-part-msg");
    const checked = document.querySelectorAll("#add-docentes-checklist input:checked");
    const newIds = Array.from(checked).map(cb => cb.value);

    showMessage(msg, "Guardando cambios...");

    apiPost({
      action: "saveTallerParticipants",
      tallerId: currentEditingTallerId,
      ids: newIds
    })
    .then(json => {
      if (json.result === "success") {
        showMessage(msg, "Lista actualizada.", "green");
        setTimeout(() => {
          document.getElementById("modal-add-participants").classList.add("hidden");
          document.getElementById("modal-admin-list-talleres").classList.remove("hidden");
          loadAdminTalleresList();
        }, 800);
      } else {
        showMessage(msg, "Error: " + json.message, "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error de conexión.", "red");
    });
  });

  // LINK MEET
  document.getElementById("btn-save-link")?.addEventListener("click", () => {
    const link = document.getElementById("meet-link-input").value;
    if (!link) return;

    apiPost({
      action: "updateTallerLink",
      tallerId: selectedTallerIdForLink,
      link: link
    })
    .then(() => {
      document.getElementById("modal-add-link").classList.add("hidden");
      document.getElementById("modal-admin-list-talleres").classList.remove("hidden");
      loadAdminTalleresList();
    });
  });

  // BUSCADORES checklist
  document.getElementById("search-docente-input")?.addEventListener("keyup", (e) => filterChecklist(e.target.value, "docentes-checklist"));
  document.getElementById("search-add-input")?.addEventListener("keyup", (e) => filterChecklist(e.target.value, "add-docentes-checklist"));

  // APLICACIONES: crear
  document.getElementById("form-create-app")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("app-msg");
    showMessage(msg, "Guardando...");

    apiPost({
      action: "createApp",
      nombre: document.getElementById("app-name").value,
      enlace: document.getElementById("app-link").value,
      funciones: document.getElementById("app-functions").value
    })
    .then(json => {
      if (json.result === "success") {
        showMessage(msg, "Aplicación guardada.", "green");
        document.getElementById("form-create-app").reset();
        loadApps(true);
      } else {
        showMessage(msg, json.message || "Error.", "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error de conexión.", "red");
    });
  });

  // ESTUDIANTES: tabs
  document.getElementById("tab-pubs")?.addEventListener("click", () => setStudentsTab("pubs"));
  document.getElementById("tab-tuts")?.addEventListener("click", () => setStudentsTab("tuts"));

  // ESTUDIANTES: crear publicación
  document.getElementById("form-create-publicacion")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("pub-msg");
    showMessage(msg, "Guardando...");

    apiPost({
      action: "createStudentPublication",
      titulo: document.getElementById("pub-title").value,
      enlace: document.getElementById("pub-link").value,
      descripcion: document.getElementById("pub-desc").value
    })
    .then(json => {
      if (json.result === "success") {
        showMessage(msg, "Publicación guardada.", "green");
        document.getElementById("form-create-publicacion").reset();
        loadPublications(true);
      } else {
        showMessage(msg, json.message || "Error.", "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error de conexión.", "red");
    });
  });

  // ESTUDIANTES: crear tutorial
  document.getElementById("form-create-tutorial")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("tut-msg");
    showMessage(msg, "Guardando...");

    apiPost({
      action: "createStudentTutorial",
      titulo: document.getElementById("tut-title").value,
      enlace: document.getElementById("tut-link").value,
      descripcion: document.getElementById("tut-desc").value
    })
    .then(json => {
      if (json.result === "success") {
        showMessage(msg, "Tutorial guardado.", "green");
        document.getElementById("form-create-tutorial").reset();
        loadTutorials(true);
      } else {
        showMessage(msg, json.message || "Error.", "red");
      }
    })
    .catch(err => {
      console.error(err);
      showMessage(msg, "Error de conexión.", "red");
    });
  });

  // CERRAR MODALES
  document.querySelectorAll(".close-modal, .close-modal-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal");
      if (modal) modal.classList.add("hidden");
    });
  });

  // WHATSAPP
  document.getElementById("whatsapp-float")?.addEventListener("click", () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=Hola,%20tengo%20una%20consulta%20sobre%20el%20Campus.`, "_blank");
  });
}

// --- SESIÓN Y DASHBOARD ---
function checkSession() {
  const storedUser = sessionStorage.getItem("db_user");
  if (storedUser) renderDashboard(JSON.parse(storedUser));
  else showLogin();
}

function showLogin() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("dashboard-view").classList.add("hidden");
  document.getElementById("main-header").classList.add("hidden");
}

function renderDashboard(user) {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("dashboard-view").classList.remove("hidden");
  document.getElementById("main-header").classList.remove("hidden");
  document.getElementById("whatsapp-float").classList.remove("hidden");

  document.getElementById("user-name-display").innerText = user.nombre;
  document.getElementById("user-role-display").innerText = String(user.rol || "").toUpperCase();

  document.querySelectorAll(".role-dash").forEach(d => d.classList.add("hidden"));

  let dashId = `dash-${String(user.rol || "").toLowerCase()}`;
  if (String(user.rol || "").toLowerCase() === "admin" || String(user.rol || "").toLowerCase() === "administrador") dashId = "dash-administrador";

  const targetDash = document.getElementById(dashId);
  if (targetDash) targetDash.classList.remove("hidden");

  // Ajustar visibilidad de bloques admin en modales
  const isAdmin = (dashId === "dash-administrador");
  toggleAdminBlocks(isAdmin);

  // Cargar data base
  if (String(user.rol || "").toLowerCase() === "docente") {
    apiPost({ action: "getProfile", userId: user.id })
      .then(json => {
        if (json.result === "success" && json.data.favoritos) userFavorites = json.data.favoritos;
        checkNewDocuments();
        loadMyTalleres(user.id);
      });
  }

  if (String(user.rol || "").toLowerCase().includes("estudiante")) {
    // pre-cargar listas (opcional)
    loadApps(false);
    loadPublications(false);
    loadTutorials(false);
  }
}

function toggleAdminBlocks(isAdmin) {
  document.querySelectorAll(".admin-block").forEach(el => {
    if (isAdmin) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });

  const roleBadge = document.getElementById("apps-role-badge");
  if (roleBadge) roleBadge.innerText = isAdmin ? "ADMIN" : "LISTA";
}

// --- APLICACIONES ---
function openAppsModal(isAdminOpen) {
  document.getElementById("modal-apps").classList.remove("hidden");
  const user = JSON.parse(sessionStorage.getItem("db_user") || "null");
  const isAdmin = user && (String(user.rol || "").toLowerCase() === "admin" || String(user.rol || "").toLowerCase() === "administrador");
  toggleAdminBlocks(isAdmin);

  // limpiar mensajes
  hideMessage(document.getElementById("app-msg"));

  loadApps(isAdmin);
}

function loadApps(force = false) {
  if (!force && appsCache && appsCache.length > 0) {
    renderAppsList(appsCache);
    return;
  }

  const container = document.getElementById("apps-list-container");
  if (container) container.innerHTML = "<p>Cargando...</p>";

  apiPost({ action: "getApps" })
    .then(json => {
      appsCache = (json && json.data) ? json.data : [];
      renderAppsList(appsCache);
    })
    .catch(err => {
      console.error(err);
      if (container) container.innerHTML = "<p style='color:red;'>Error al cargar apps.</p>";
    });
}

function renderAppsList(apps) {
  const container = document.getElementById("apps-list-container");
  if (!container) return;

  if (!apps || apps.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No hay aplicaciones cargadas.</p><small>Volvé más tarde.</small></div>`;
    return;
  }

  let html = '<ul class="simple-list">';
  apps.forEach(app => {
    html += `
      <li class="simple-item">
        <h4>${escapeHtml(app.nombre || "")}</h4>
        <div class="meta-row">
          <span class="badge">${escapeHtml(app.fecha || "")}</span>
          <a class="btn-download" href="${app.enlace}" target="_blank" rel="noopener">Abrir</a>
        </div>
        ${app.funciones ? `<p>${escapeHtml(app.funciones)}</p>` : ""}
      </li>
    `;
  });
  html += "</ul>";
  container.innerHTML = html;
}

// --- ESTUDIANTES: modal y tabs ---
function openStudentsModal(isAdminOpen, tab) {
  document.getElementById("modal-estudiantes").classList.remove("hidden");
  setStudentsTab(tab || "pubs");

  const user = JSON.parse(sessionStorage.getItem("db_user") || "null");
  const isAdmin = user && (String(user.rol || "").toLowerCase() === "admin" || String(user.rol || "").toLowerCase() === "administrador");
  toggleAdminBlocks(isAdmin);

  hideMessage(document.getElementById("pub-msg"));
  hideMessage(document.getElementById("tut-msg"));
}

function setStudentsTab(tab) {
  studentsActiveTab = tab;

  const btnP = document.getElementById("tab-pubs");
  const btnT = document.getElementById("tab-tuts");
  const wrapP = document.getElementById("form-pubs-wrap");
  const wrapT = document.getElementById("form-tuts-wrap");

  if (btnP && btnT) {
    if (tab === "pubs") {
      btnP.classList.add("active");
      btnT.classList.remove("active");
    } else {
      btnT.classList.add("active");
      btnP.classList.remove("active");
    }
  }

  if (wrapP && wrapT) {
    if (tab === "pubs") {
      wrapP.classList.remove("hidden");
      wrapT.classList.add("hidden");
    } else {
      wrapT.classList.remove("hidden");
      wrapP.classList.add("hidden");
    }
  }

  // cargar y renderizar lista
  if (tab === "pubs") loadPublications(false);
  else loadTutorials(false);
}

function loadPublications(force = false) {
  if (!force && pubsCache && pubsCache.length > 0) {
    if (studentsActiveTab === "pubs") renderStudentsList(pubsCache, "pubs");
    return;
  }
  const container = document.getElementById("students-list-container");
  if (studentsActiveTab === "pubs" && container) container.innerHTML = "<p>Cargando...</p>";

  apiPost({ action: "getStudentPublications" })
    .then(json => {
      pubsCache = (json && json.data) ? json.data : [];
      if (studentsActiveTab === "pubs") renderStudentsList(pubsCache, "pubs");
    })
    .catch(err => {
      console.error(err);
      if (studentsActiveTab === "pubs" && container) container.innerHTML = "<p style='color:red;'>Error al cargar publicaciones.</p>";
    });
}

function loadTutorials(force = false) {
  if (!force && tutsCache && tutsCache.length > 0) {
    if (studentsActiveTab === "tuts") renderStudentsList(tutsCache, "tuts");
    return;
  }
  const container = document.getElementById("students-list-container");
  if (studentsActiveTab === "tuts" && container) container.innerHTML = "<p>Cargando...</p>";

  apiPost({ action: "getStudentTutorials" })
    .then(json => {
      tutsCache = (json && json.data) ? json.data : [];
      if (studentsActiveTab === "tuts") renderStudentsList(tutsCache, "tuts");
    })
    .catch(err => {
      console.error(err);
      if (studentsActiveTab === "tuts" && container) container.innerHTML = "<p style='color:red;'>Error al cargar tutoriales.</p>";
    });
}

function renderStudentsList(items, type) {
  const container = document.getElementById("students-list-container");
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state-msg"><p>No hay ${type === "pubs" ? "publicaciones" : "tutoriales"} cargados.</p><small>Volvé más tarde.</small></div>`;
    return;
  }

  let html = '<ul class="simple-list">';
  items.forEach(it => {
    html += `
      <li class="simple-item">
        <h4>${escapeHtml(it.titulo || "")}</h4>
        <div class="meta-row">
          <span class="badge">${escapeHtml(it.fecha || "")}</span>
          <a class="btn-download" href="${it.enlace}" target="_blank" rel="noopener">Abrir</a>
        </div>
        ${it.descripcion ? `<p>${escapeHtml(it.descripcion)}</p>` : ""}
      </li>
    `;
  });
  html += "</ul>";
  container.innerHTML = html;
}

// --- TALLERES (ADMIN/LISTAS) ---
function loadAdminTalleresList() {
  const container = document.getElementById("admin-talleres-list");
  if (container) container.innerHTML = "<p>Cargando talleres...</p>";

  apiPost({ action: "getAllTalleres" })
    .then(json => {
      if (!json.data || json.data.length === 0) {
        if (container) container.innerHTML = "<p>No hay talleres creados.</p>";
        return;
      }
      let html = '<ul class="taller-list">';
      json.data.forEach(t => {
        html += `
          <li class="taller-item">
            <div class="taller-info">
              <strong>${escapeHtml(t.titulo)}</strong> <small>(${escapeHtml(t.fechaTaller)})</small><br>
              <span style="font-size:0.85rem; color:#666;">Invitados: ${t.invitados ? t.invitados.length : 0}</span>
              <div style="margin-top:5px;">
                ${t.link ? `<a href="${t.link}" target="_blank" class="link-tag">Enlace Meet Activo</a>` : '<span class="no-link">Sin enlace</span>'}
              </div>
            </div>
            <div class="taller-actions">
              <button class="btn-sm" onclick="openAddParticipants(${t.id}, '${escapeAttr(t.titulo)}')">👥 Asistentes</button>
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
  if (container) container.innerHTML = "<p>Cargando lista...</p>";

  if (allDocentesCache.length > 0) {
    renderChecklist(allDocentesCache, containerId);
    return;
  }

  apiPost({ action: "getAllDocentesSimple" })
    .then(json => {
      allDocentesCache = json.data || [];
      renderChecklist(allDocentesCache, containerId);
    })
    .catch(err => {
      console.error(err);
      if (container) container.innerHTML = "<p style='color:red;'>Error al cargar docentes.</p>";
    });
}

function renderChecklist(list, containerId, preselectedIds = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = "<p>No hay docentes registrados.</p>";
    return;
  }

  let html = "";
  list.forEach(d => {
    const isChecked = preselectedIds.includes(String(d.id)) ? "checked" : "";
    html += `<label class="checklist-item"><input type="checkbox" value="${d.id}" ${isChecked}> ${escapeHtml(d.nombre)} <small>(DNI: ${escapeHtml(d.dni)})</small></label>`;
  });
  container.innerHTML = html;

  const countSpan = document.getElementById("count-selected");
  if (containerId === "docentes-checklist" && countSpan) {
    container.querySelectorAll("input").forEach(cb => {
      cb.addEventListener("change", () => {
        countSpan.innerText = container.querySelectorAll("input:checked").length;
      });
    });
  }
}

function openAddParticipants(id, titulo) {
  currentEditingTallerId = id;
  document.getElementById("modal-admin-list-talleres").classList.add("hidden");
  document.getElementById("modal-add-participants").classList.remove("hidden");
  document.getElementById("edit-taller-subtitle").innerText = "Taller: " + titulo;
  hideMessage(document.getElementById("add-part-msg"));
  document.getElementById("add-docentes-checklist").innerHTML = "<p>Cargando...</p>";

  apiPost({ action: "getAllTalleres" })
    .then(json => {
      const taller = (json.data || []).find(t => t.id == id);
      const invited = (taller && taller.invitados) ? taller.invitados : [];

      if (allDocentesCache.length > 0) {
        renderChecklist(allDocentesCache, "add-docentes-checklist", invited.map(String));
      } else {
        apiPost({ action: "getAllDocentesSimple" })
          .then(j => {
            allDocentesCache = j.data || [];
            renderChecklist(allDocentesCache, "add-docentes-checklist", invited.map(String));
          });
      }
    });
}

function openAddLink(id) {
  selectedTallerIdForLink = id;
  document.getElementById("modal-admin-list-talleres").classList.add("hidden");
  document.getElementById("modal-add-link").classList.remove("hidden");
  document.getElementById("meet-link-input").value = "";
}

function filterChecklist(text, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const labels = container.querySelectorAll(".checklist-item");
  const term = String(text || "").toLowerCase();
  labels.forEach(lbl => {
    const txt = lbl.innerText.toLowerCase();
    lbl.style.display = txt.includes(term) ? "flex" : "none";
  });
}



// ==========================================
// TALLERES ACTIVOS (LISTA PARA INSCRIPCIÓN)
// ==========================================

function openActiveTalleresModal() {
  const modal = document.getElementById("modal-active-talleres");
  if (modal) modal.classList.remove("hidden");
  loadActiveTalleres();
}

function loadActiveTalleres() {
  const listEl = document.getElementById("active-talleres-list");
  if (listEl) listEl.innerHTML = "<p>Cargando...</p>";

  apiPost({ action: "getAllTalleres" })
    .then(json => {
      const all = (json && json.data) ? json.data : [];

      // Consideramos "activo" si la fecha del taller es hoy o futura.
      const today = new Date();
      today.setHours(0,0,0,0);

      const activos = all.filter(t => {
        const d = parseDate(t.fechaTaller);
        d.setHours(0,0,0,0);
        return d >= today;
      }).sort((a,b) => parseDate(a.fechaTaller) - parseDate(b.fechaTaller));

      renderActiveTalleresList(activos);
    })
    .catch(err => {
      console.error(err);
      if (listEl) listEl.innerHTML = "<p style='color:red;'>Error al cargar talleres.</p>";
    });
}

// ✅ Importante: NO mostramos enlaces si el usuario no está inscripto.
// Derivamos a WhatsApp para solicitar inscripción.
function renderActiveTalleresList(talleres) {
  const listEl = document.getElementById("active-talleres-list");
  if (!listEl) return;

  if (!talleres || talleres.length === 0) {
    listEl.innerHTML = `<div class="empty-state-msg"><p>No hay talleres activos por el momento.</p><small>Volvé más tarde.</small></div>`;
    return;
  }

  let html = '<ul class="simple-list">';
  talleres.forEach(t => {
    html += `
      <li class="simple-item">
        <h4>${escapeHtml(t.titulo || "")}</h4>
        <div class="meta-row">
          <span class="badge">${escapeHtml(t.fechaTaller || "")}</span>
        </div>
        <p style="margin-top:8px; color:#666; font-size:.9rem;">
          Si deseas anotarte en este taller, clickeá el botón de WhatsApp.
        </p>
      </li>
    `;
  });
  html += "</ul>";
  listEl.innerHTML = html;
}

// --- DOCS DOCENTE ---
function applyFilters() {
  const term = document.getElementById("filter-search").value.toLowerCase();
  const cat = document.getElementById("filter-cat").value;
  const filtered = globalDocs.filter(doc => {
    const matchesText = (doc.titulo || "").toLowerCase().includes(term) || (doc.resumen || "").toLowerCase().includes(term);
    const matchesCat = cat === "todos" || doc.categoria === cat;
    return matchesText && matchesCat;
  });
  renderDocsList(filtered);
}

function checkNewDocuments() {
  apiPost({ action: "getDocuments" })
    .then(json => {
      const lastViewed = localStorage.getItem("last_docs_view_date");
      const now = new Date();
      let hasNew = false;

      globalDocs = (json.data || []).map(d => {
        const docDate = parseDate(d.fecha);
        let isNew = false;
        if (!lastViewed) {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          isNew = docDate > oneWeekAgo;
        } else {
          isNew = docDate > new Date(lastViewed);
        }
        if (isNew) hasNew = true;
        return { ...d, isNew };
      });

      if (hasNew) document.getElementById("notification-badge")?.classList.remove("hidden");
      localStorage.setItem("last_docs_view_date", now.toISOString());
    })
    .catch(err => console.error(err));
}

function loadMyTalleres(userId) {
  const container = document.getElementById("talleres-container");
  if (container) container.innerHTML = "<p>Buscando talleres...</p>";

  apiPost({ action: "getMyTalleres", userId })
    .then(json => {
      if (!json.data || json.data.length === 0) {
        if (container) container.innerHTML = `
          <div class="empty-state-msg">
            <p>No estás inscripto en talleres activos.</p>
            <small>Si deseas anotarte en uno de estos talleres, clickeá el botón de WhatsApp.</small>
            <div style="margin-top:12px;">
              <button class="btn-secondary" type="button" onclick="openActiveTalleresModal()">Ver talleres activos</button>
            </div>
          </div>
        `;
        return;
      }
      let html = "";
      json.data.forEach(t => {
        html += `
          <div class="card card-taller" onclick="showTallerInfo('${escapeAttr(t.titulo)}', '${escapeAttr(t.link || "")}','${escapeAttr(t.id)}')">
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

function showTallerInfo(titulo, link, tallerId = "") {
  document.getElementById("modal-taller-info").classList.remove("hidden");
  document.getElementById("info-taller-titulo").innerText = titulo;

  const actionContainer = document.getElementById("taller-action-container");
  const materialContainer = document.getElementById("taller-material-container");

  if (link) {
    actionContainer.innerHTML = `<a href="${link}" target="_blank" class="btn-primary" style="display:block; text-align:center; text-decoration:none;">Unirse a la Reunión</a>`;
  } else {
    actionContainer.innerHTML = `<p style="color:#777; font-style:italic;">El enlace de la reunión aún no está disponible.</p>`;
  }

  // Material del taller (requiere que el backend envíe docsIds; si no, mostramos estado)
  if (materialContainer) {
    materialContainer.innerHTML = `<p class="material-empty">📎 Material: no disponible.</p>`;

    // Intento: si en algún momento el backend agrega docsIds, lo tomamos desde getAllTalleres
    if (tallerId) {
      apiPost({ action: "getAllTalleres" })
        .then(json => {
          const t = (json.data || []).find(x => String(x.id) === String(tallerId));
          const docsIds = (t && (t.docsIds || t.docs_ids || t.docs || t.material || t.materialIds)) || [];
          const ids = Array.isArray(docsIds)
            ? docsIds.map(String)
            : String(docsIds || "").split(",").map(s => s.trim()).filter(Boolean);

          if (!ids || ids.length === 0) return;

          // Asegurar que tenemos la documentación cargada
          const ensureDocs = globalDocs && globalDocs.length > 0
            ? Promise.resolve({ result: "success", data: globalDocs })
            : apiPost({ action: "getDocuments" }).then(r => {
                globalDocs = r.data || [];
                return r;
              });

          ensureDocs.then(() => {
            const mapById = new Map((globalDocs || []).map(d => [String(d.id), d]));
            const docs = ids.map(id => mapById.get(String(id))).filter(Boolean);

            if (docs.length === 0) return;

            materialContainer.innerHTML = `
              <div class="material-header">📎 Material</div>
              <ul class="material-list">
                ${docs.map(d => `
                  <li class="material-item">
                    <a href="${d.url}" target="_blank" rel="noopener">${escapeHtml(d.titulo || "Documento")}</a>
                    <span class="badge">${escapeHtml(d.categoria || "")}</span>
                  </li>
                `).join("")}
              </ul>
            `;
          });
        })
        .catch(() => {});
    }
  }
}

function renderDocsList(docs) {
  const container = document.getElementById("docs-list-container");
  if (!container) return;

  if (!docs || docs.length === 0) {
    container.innerHTML = "<p>No se encontraron documentos.</p>";
    return;
  }

  // Favoritos primero (dentro del set filtrado)
  const favSet = new Set((userFavorites || []).map(String));
  const favDocs = docs.filter(d => favSet.has(String(d.id)));
  const otherDocs = docs.filter(d => !favSet.has(String(d.id)));

  let html = "";

  if (favDocs.length > 0) {
    html += `
      <div class="docs-section">
        <div class="docs-section-header">
          <h3 class="docs-section-title">⭐ Mis Favoritos</h3>
          <span class="docs-section-count">${favDocs.length}</span>
        </div>
        ${buildDocsUl(favDocs)}
      </div>
      <hr class="docs-divider">
    `;
  }

  html += `
    <div class="docs-section">
      <div class="docs-section-header">
        <h3 class="docs-section-title">📚 Todos los documentos</h3>
        <span class="docs-section-count">${otherDocs.length}</span>
      </div>
      ${buildDocsUl(otherDocs)}
    </div>
  `;

  container.innerHTML = html;
}

function buildDocsUl(docs) {
  if (!docs || docs.length === 0) {
    return `<div class="empty-state-msg"><p>No hay documentos para mostrar.</p></div>`;
  }

  let html = "<ul>";
  docs.forEach(doc => {
    const isFav = userFavorites.includes(String(doc.id));
    const heartClass = isFav ? "fav-btn fav-active" : "fav-btn";
    const heartSymbol = isFav ? "♥" : "♡";
    html += `
      <li class="doc-item">
        <div class="doc-info">
          <strong>${escapeHtml(doc.titulo)}</strong>
          ${doc.isNew ? '<span class="badge-new">NUEVO</span>' : ''}
          <br>
          <small>(${escapeHtml(doc.numero || "S/N")} - ${formatDateDisplay(doc.fecha)})</small><br>
          <span class="badge">${escapeHtml(doc.categoria)}</span>
          <p>${escapeHtml(doc.resumen || "")}</p>
        </div>
        <div class="doc-actions">
          <button class="${heartClass}" onclick="toggleDocFavorite('${doc.id}', this)" title="Marcar Favorito">${heartSymbol}</button>
          <a href="${doc.url}" target="_blank" class="btn-download" rel="noopener">Ver PDF</a>
        </div>
      </li>
    `;
  });
  html += "</ul>";
  return html;
}

function toggleDocFavorite(docId, btn) {
  const user = JSON.parse(sessionStorage.getItem("db_user"));
  const isActive = btn.classList.contains("fav-active");
  if (isActive) { btn.classList.remove("fav-active"); btn.innerHTML = "♡"; }
  else { btn.classList.add("fav-active"); btn.innerHTML = "♥"; }

  apiPost({ action: "toggleFavorite", userId: user.id, docId })
    .then(json => {
      if (json.result === "success") userFavorites = json.favoritos;
    })
    .catch(err => console.error(err));
}

// --- UTILIDADES FECHA + ESCAPE ---
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
  return d.toLocaleDateString("es-AR");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  // para meter dentro de comillas simples
  return String(str ?? "").replace(/'/g, "\\'");
}
