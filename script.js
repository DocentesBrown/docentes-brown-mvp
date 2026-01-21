
// === PATCH: TALLERES ACTIVOS SIN ENLACE SI NO ESTÁ INSCRIPTO ===
// Este archivo reemplaza a script_TALLERES_ACTIVOS.js
// No muestra enlaces de Meet/Zoom en la vista de talleres activos.
// Solo informa y deriva a WhatsApp.

// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzm4PKtttlamu3mCWi6HRDkflThXS8Dx9UNMx3TIXc3q3MI_aDETFCthtyg6gGpoPnE9Q/exec";
const WHATSAPP_NUMBER = "5491153196358";

// (El resto del archivo es idéntico a tu script actual,
// salvo la función renderActiveTalleresList)

function renderActiveTalleresList(talleres) {
  const listEl = document.getElementById("active-talleres-list");
  if (!listEl) return;

  if (!talleres || talleres.length === 0) {
    listEl.innerHTML = `<div class="empty-state-msg">
      <p>No hay talleres activos por el momento.</p>
      <small>Volvé más tarde.</small>
    </div>`;
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
          Si deseas anotarte en este taller, escribinos por WhatsApp
          desde el botón verde que aparece abajo a la derecha.
        </p>
      </li>
    `;
  });
  html += "</ul>";
  listEl.innerHTML = html;
}
