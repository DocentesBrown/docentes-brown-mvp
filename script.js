// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzm4PKtttlamu3mCWi6HRDkflThXS8Dx9UNMx3TIXc3q3MI_aDETFCthtyg6gGpoPnE9Q/exec";
const WHATSAPP_NUMBER = "5491153196358";

// --- VARIABLES GLOBALES ---
let globalDocs = [];
let allDocentesCache = [];
let selectedTallerIdForLink = null;
let selectedTallerBibIdsForLink = [];
let selectedTallerIdForBiblio = null;
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


// --- METADATA Taller (sin tocar backend): guardamos bibliografía dentro del campo "link" ---
const DB_META_MARKER = "__DBMETA__";

function parseTallerLinkField(raw) {
  const out = { meetLink: "", bibIds: [] };
  if (!raw) return out;
  const s = String(raw);
  const idx = s.indexOf(DB_META_MARKER);
  if (idx === -1) {
    out.meetLink = s.trim();
    return out;
  }
  out.meetLink = s.slice(0, idx).trim();
  const metaRaw = s.slice(idx + DB_META_MARKER.length);
  try {
    const meta = JSON.parse(decodeURIComponent(metaRaw || ""));
    if (meta && Array.isArray(meta.bibIds)) out.bibIds = meta.bibIds.map(x => String(x));
  } catch (e) {
    // si falla, ignoramos metadata
  }
  return out;
}

function buildTallerLinkField(meetLink, bibIds) {
  const cleanMeet = (meetLink || "").trim();
  const meta = { bibIds: (bibIds || []).map(x => String(x)) };
  // Guardamos SIEMPRE marker, así podemos distinguir meetLink real del JSON.
  return cleanMeet + DB_META_MARKER + encodeURIComponent(JSON.stringify(meta));
}

function getDocsForBibliografia() {
  // Mostrar TODOS los documentos de la pestaña Documentación (sin filtrar por categoría)
  const docs = Array.isArray(globalDocs) ? globalDocs.slice() : [];
  docs.sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || "")));
  return docs;
}

function renderBibliografiaSelect(selectEl, preselectedIds = []) {
  if (!selectEl) return;
  const selected = new Set((preselectedIds || []).map(x => String(x)));
  const docs = getDocsForBibliografia();

  let html = "";
  if (!docs.length) {
    html = `<option value="" disabled>(No hay documentos disponibles)</option>`;
  } else {
    docs.forEach(d => {
      const id = String(d.id);
      const label = `${d.titulo || "Sin título"}${d.categoria ? " — " + d.categoria : ""}`;
      html += `<option value="${escapeAttr(id)}" ${selected.has(id) ? "selected" : ""}>${escapeHtml(label)}</option>`;
    });
  }
  selectEl.innerHTML = html;
}

function filterSelectOptions(selectEl, query) {
  if (!selectEl) return;
  const q = String(query || "").toLowerCase().trim();
  const options = Array.from(selectEl.options);
  options.forEach(opt => {
    const text = String(opt.text || "").toLowerCase();
    opt.hidden = q && !text.includes(q);
  });
}

function getSelectedValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions || []).map(o => String(o.value));
}

function renderBibliografiaForDocente(containerEl, bibIds = []) {
  if (!containerEl) return;
  const ids = (bibIds || []).map(x => String(x));
  if (!ids.length) {
    containerEl.innerHTML = "";
    return;
  }

  const byId = new Map((globalDocs || []).map(d => [String(d.id), d]));
  const items = ids.map(id => byId.get(id)).filter(Boolean);

  if (!items.length) {
    containerEl.innerHTML = `
      <div class="info-box" style="margin-top:10px;">
        <p style="margin:0; color:#666;">📚 Bibliografía asignada, pero no se encontró el material en la lista actual.</p>
      </div>`;
    return;
  }

  const pills = items.map(d => `<a class="biblio-pill" href="${escapeAttr(d.url || "#")}" target="_blank" rel="noopener">${escapeHtml(d.titulo || "Documento")}</a>`).join("");
  containerEl.innerHTML = `
    <div class="info-box" style="margin-top:10px;">
      <p style="margin:0 0 8px 0;"><strong>📚 Bibliografía</strong></p>
      <div>${pills}</div>
      <small style="display:block; margin-top:10px; color:#666;">Se abre en una pestaña nueva.</small>
    </div>
  `;
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
    const newDocs = globalDocs.filter(doc => doc.isNew);
    if (newDocs.length > 0) renderDocsList(newDocs);
    else document.getElementById("docs-list-container").innerHTML =
      `<div class="empty-state-msg"><p>No hay material nuevo.</p><small>Explora las categorías.</small></div>`;
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

    // Bibliografía
    const sel = document.getElementById("taller-bibliografia");
    const search = document.getElementById("search-biblio-create");
    if (search) search.value = "";
    renderBibliografiaSelect(sel, []);
    filterSelectOptions(sel, "");
  });

  // ADMIN: Crear Taller (submit)
  document.getElementById("form-create-taller")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("taller-msg");
    const checked = document.querySelectorAll("#docentes-checklist input:checked");
    const selectedIds = Array.from(checked).map(cb => cb.value);

    const bibSelect = document.getElementById("taller-bibliografia");
    const bibIds = getSelectedValues(bibSelect);

    const titulo = document.getElementById("taller-titulo").value;
    const fechaTaller = document.getElementById("taller-fecha").value;

    showMessage(msg, "Creando...");

    apiPost({
      action: "createTaller",
      titulo: titulo,
      fechaTaller: fechaTaller,
      invitados: selectedIds,
      docsIds: bibIds
    })
    .then(async (json) => {
      if (json.result === "success") {

        showMessage(msg, "Listo.", "green");
        setTimeout(() => {
          document.getElementById("modal-create-taller")?.classList.add("hidden");
          document.getElementById("modal-admin-list-talleres")?.classList.remove("hidden");
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
    const linkInput = document.getElementById("meet-link-input");
    const raw = linkInput ? linkInput.value : "";
    const meet = String(raw || "").trim();

    // preserva bibliografía guardada en metadata
    const linkField = buildTallerLinkField(meet, selectedTallerBibIdsForLink || []);

    apiPost({
      action: "updateTallerLink",
      tallerId: selectedTallerIdForLink,
      link: linkField
    })
    .then(() => {
      document.getElementById("modal-add-link").classList.add("hidden");
      document.getElementById("modal-admin-list-talleres").classList.remove("hidden");
      loadAdminTalleresList();
    });
  });

  // DOCUMENTACIÓN del taller (admin)
  document.getElementById("btn-save-biblio")?.addEventListener("click", () => {
    const msg = document.getElementById("biblio-msg");
    const sel = document.getElementById("select-biblio-edit");
    const docsIds = getSelectedValues(sel);

    showMessage(msg, "Guardando...");

    apiPost({ action: "updateTallerLink", tallerId: selectedTallerIdForBiblio, docsIds: docsIds })
      .then(json => {
        if (json.result === "success") {
          showMessage(msg, "Documentación guardada.", "green");
          setTimeout(() => {
            document.getElementById("modal-bibliografia-taller")?.classList.add("hidden");
            document.getElementById("modal-admin-list-talleres")?.classList.remove("hidden");
            loadAdminTalleresList();
          }, 700);
        } else {
          showMessage(msg, json.message || "Error.", "red");
        }
      })
      .catch(err => {
        console.error(err);
        showMessage(msg, "Error de conexión.", "red");
      });
  });
  });

  });

  // BUSCADORES checklist
  document.getElementById("search-docente-input")?.addEventListener("keyup", (e) => filterChecklist(e.target.value, "docentes-checklist"));
  document.getElementById("search-add-input")?.addEventListener("keyup", (e) => filterChecklist(e.target.value, "add-docentes-checklist"));
  // BUSCADOR bibliografía
  document.getElementById("search-biblio-create")?.addEventListener("keyup", (e) => {
    const sel = document.getElementById("taller-bibliografia");
    filterSelectOptions(sel, e.target.value);
  });
  document.getElementById("search-biblio-edit")?.addEventListener("keyup", (e) => {
    const sel = document.getElementById("select-biblio-edit");
    filterSelectOptions(sel, e.target.value);
  });


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
      const data = (json && json.data) ? json.data : [];
      if (!data.length) {
        if (container) container.innerHTML = "<p>No hay talleres creados.</p>";
        return;
      }

      let html = '<ul class="taller-list">';
      data.forEach(t => {
        const meetLink = t.link || "";
        const docsCount = (t.docsIds && Array.isArray(t.docsIds)) ? t.docsIds.length : 0;

        html += `
          <li class="taller-item">
            <div class="taller-info">
              <strong>${escapeHtml(t.titulo)}</strong> <small>(${escapeHtml(t.fechaTaller)})</small><br>
              <span style="font-size:0.85rem; color:#666;">Invitados: ${t.invitados ? t.invitados.length : 0}</span>
              <span style="font-size:0.85rem; color:#666; margin-left:10px;">📚 Docs: ${docsCount}</span>
              <div style="margin-top:5px;">
                ${meetLink ? `<a href="${escapeAttr(meetLink)}" target="_blank" rel="noopener" class="btn-sm btn-primary">Enlace Meet Activo</a>` : '<span class="no-link">Sin enlace</span>'}
              </div>
            </div>
            <div class="taller-actions">
              <button class="btn-sm" onclick="openAddParticipants(${t.id}, '${escapeAttr(t.titulo)}')">👥 Asistentes</button>
              <button class="btn-sm btn-secondary" onclick="openAddLink(${t.id}, '${escapeAttr(t.link || "")}')">🔗 Link</button>
              <button class="btn-sm btn-secondary" onclick="openEditBibliografia(${t.id}, '${escapeAttr(t.titulo)}', '${escapeAttr(JSON.stringify(t.docsIds || []))}')">📚 Documentación</button>
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

function openAddLink(tallerId, rawLink = "") {
  selectedTallerIdForLink = tallerId;

  const input = document.getElementById("meet-link-input");
  if (input) input.value = rawLink || "";

  document.getElementById("modal-admin-list-talleres").classList.add("hidden");
  document.getElementById("modal-add-link").classList.remove("hidden");
}


function openEditBibliografia(tallerId, titulo, docsIdsJson = "[]") {
  selectedTallerIdForBiblio = tallerId;

  const subtitle = document.getElementById("biblio-taller-subtitle");
  if (subtitle) subtitle.innerText = `Taller: ${titulo}`;

  hideMessage(document.getElementById("biblio-msg"));

  let pre = [];
  try { pre = JSON.parse(docsIdsJson || "[]"); } catch(e) { pre = []; }

  const sel = document.getElementById("select-biblio-edit");
  const search = document.getElementById("search-biblio-edit");
  if (search) search.value = "";
  renderBibliografiaSelect(sel, pre || []);
  filterSelectOptions(sel, "");

  document.getElementById("modal-admin-list-talleres").classList.add("hidden");
  document.getElementById("modal-bibliografia-taller").classList.remove("hidden");
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
      const data = (json && json.data) ? json.data : [];
      if (!data.length) {
        if (container) container.innerHTML = `<div class="empty-state-msg"><p>No estás inscripto en talleres activos.</p></div>`;
        return;
      }

      let html = "";
      data.forEach(t => {
        const hasMeet = !!(t.link && String(t.link).trim());
        const docsCount = (t.docsIds && Array.isArray(t.docsIds)) ? t.docsIds.length : 0;

        html += `
          <div class="card">
            <h4 style="margin:0 0 6px 0;">${escapeHtml(t.titulo)}</h4>
            <p style="margin:0; color:#666; font-size:0.9rem;">📅 ${escapeHtml(t.fechaTaller || "")}</p>
            <p style="margin:6px 0 0 0; color:#666; font-size:0.9rem;">📚 Documentación: ${docsCount}</p>
            <div style="margin-top:12px;">
              <button class="btn-primary" style="width:100%;" onclick="showTallerInfo('${escapeAttr(t.titulo)}', '${escapeAttr(t.link || "")}', '${escapeAttr(JSON.stringify(t.docsIds || []))}')">
                ${hasMeet ? "Ingresar / Ver Taller" : "Ver Taller"}
              </button>
            </div>
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

function showTallerInfo(titulo, meetLink = "", docsIdsJson = "[]") {
  document.getElementById("modal-taller-info").classList.remove("hidden");
  document.getElementById("info-taller-titulo").innerText = titulo;

  const actionContainer = document.getElementById("taller-action-container");
  const docsContainer = document.getElementById("taller-biblio-container");

  // Meet
  if (meetLink && String(meetLink).trim()) {
    actionContainer.innerHTML = `
      <a href="${escapeAttr(meetLink)}" target="_blank" rel="noopener" style="display:block; width:100%; padding:12px; border-radius:10px; text-align:center; font-weight:700; background:var(--primary); color:white; text-decoration:none;">
        🎥 Ingresar al Meet
      </a>
    `;
  } else {
    actionContainer.innerHTML = `<div class="empty-state-msg"><p>Este taller aún no tiene enlace de Meet.</p></div>`;
  }

  // Documentación
  let ids = [];
  try { ids = JSON.parse(docsIdsJson || "[]"); } catch(e) { ids = []; }
  renderBibliografiaForDocente(docsContainer, ids);
}

function renderDocsList(docs) {
  const container = document.getElementById("docs-list-container");
  if (!container) return;

  if (!docs || docs.length === 0) {
    container.innerHTML = "<p>No se encontraron documentos.</p>";
    return;
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
  container.innerHTML = html;
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
