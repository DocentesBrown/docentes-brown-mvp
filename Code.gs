// ==========================================
// CONFIG
// ==========================================

var WEB_APP_URL = "https://docentesbrown.github.io/docentes-brown-mvp";

// Carpeta Drive para documentación (ID extraído del link)
var DRIVE_FOLDER_ID = "16Fc9rda7E8ZaGTBjs9wuBNZZT5ugSM8t";

// ==========================================
// 1. MENÚ + MAILS ACTIVACIÓN
// ==========================================

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🎓 ADMIN CAMPUS')
    .addItem('📧 Enviar Mails de Activación', 'processActivationEmails')
    .addToUi();
}

function processActivationEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  var ui = SpreadsheetApp.getUi();

  if (!sheet) {
    ui.alert("⚠️ No existe la hoja 'Usuarios'.");
    return;
  }

  var values = sheet.getDataRange().getValues();
  var emailsEnviados = 0;
  var errores = 0;

  for (var i = 1; i < values.length; i++) {
    var fila = values[i];
    var casillaVerificacion = fila[6]; // Columna G
    var email = fila[2];
    var nombre = fila[1];
    var password = fila[3];

    if (casillaVerificacion === true && casillaVerificacion !== "MAIL ENVIADO") {
      if (!email || !String(email).includes("@")) {
        sheet.getRange(i + 1, 7).setValue("EMAIL INVÁLIDO");
        errores++;
        continue;
      }
      try {
        sendActivationEmail(nombre, email, password);
        sheet.getRange(i + 1, 7).setValue("MAIL ENVIADO");
        sheet.getRange(i + 1, 6).setValue("activo"); // Columna F
        emailsEnviados++;
      } catch (error) {
        console.error("Fallo al enviar a: " + email, error);
        sheet.getRange(i + 1, 7).setValue("ERROR: " + error.message);
        errores++;
      }
    }
  }

  if (emailsEnviados > 0 || errores > 0) {
    ui.alert('Proceso finalizado.\n✅ Enviados: ' + emailsEnviados + '\n❌ Errores: ' + errores);
  } else {
    ui.alert('⚠️ No se encontraron casillas marcadas (TRUE) en la columna G.');
  }
}

function sendActivationEmail(nombre, email, password) {
  var subject = "✅ Cuenta Activa - Campus Docentes Brown";
  var htmlBody = `
    <div style="font-family: 'Helvetica', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #24496E; padding: 20px; text-align: center;">
        <h1 style="color: #F3EFDC; margin: 0;">Docentes Brown</h1>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <h2 style="color: #333;">¡Hola, ${nombre}!</h2>
        <p style="color: #555; font-size: 16px;">Tu cuenta para acceder al <strong>Campus Virtual</strong> ya se encuentra activa.</p>
        <div style="background-color: #f9f9f9; border-left: 4px solid #DA6863; padding: 15px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Usuario:</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Contraseña:</strong> ${password}</p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${WEB_APP_URL}" style="background-color: #24496E; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Ingresar al Campus</a>
        </div>
      </div>
    </div>
  `;
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody });
}

// ==========================================
// 2. API (ROUTER)
// ==========================================

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } 
  catch (err) { return response({ "result": "error", "message": "Servidor ocupado." }); }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var request = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : "{}");
    var action = request.action;

    // AUTH
    if (action === 'login') return authenticateUser(ss, request.email, request.password);
    if (action === 'register') return registerUser(ss, request);
    if (action === 'getProfile') return getUserProfile(ss, request.userId);
    if (action === 'updateProfile') return updateUserProfile(ss, request);

    // DOCUMENTACIÓN
    if (action === 'uploadDocument') return uploadDocumentToDrive(ss, request);
    if (action === 'getDocuments') return getDocumentsList(ss);
    if (action === 'toggleFavorite') return toggleFavorite(ss, request);

    // TALLERES ADMIN
    if (action === 'getAllTalleres') return getAllTalleres(ss);
    if (action === 'createTaller') return createTaller(ss, request);
    if (action === 'updateTallerLink') return updateTallerLink(ss, request);
    if (action === 'getAllDocentesSimple') return getAllDocentesSimple(ss);
    if (action === 'saveTallerParticipants') return saveTallerParticipants(ss, request);

    // TALLERES DOCENTE
    if (action === 'getMyTalleres') return getDocenteTalleres(ss, request.userId);

    // APLICACIONES
    if (action === 'createApp') return createApp(ss, request);
    if (action === 'getApps') return getApps(ss);

    // ESTUDIANTES (PUBLICACIONES / TUTORIALES)
    if (action === 'createStudentPublication') return createStudentPublication(ss, request);
    if (action === 'getStudentPublications') return getStudentPublications(ss);
    if (action === 'createStudentTutorial') return createStudentTutorial(ss, request);
    if (action === 'getStudentTutorials') return getStudentTutorials(ss);

    return response({ "result": "error", "message": "Acción desconocida" });

  } catch (error) {
    return response({ "result": "error", "message": "Error crítico: " + error.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 3. TALLERES
// ==========================================

function getAllDocentesSimple(ss) {
  var sheet = ss.getSheetByName('Docentes');
  if (!sheet) return response({ "result": "error", "data": [] });

  var data = sheet.getDataRange().getValues();
  var docentes = [];
  for (var i = 1; i < data.length; i++) {
    docentes.push({ id: data[i][0], nombre: data[i][1], dni: data[i][5] || "S/D" });
  }
  docentes.sort(function(a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
  return response({ "result": "success", "data": docentes });
}

// Sobrescribe la lista de participantes (permite borrar y agregar)
function saveTallerParticipants(ss, data) {
  var sheet = ss.getSheetByName('Talleres');
  if (!sheet) return response({ "result": "error", "message": "Hoja Talleres no existe" });

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.tallerId) {
      var newJson = JSON.stringify(data.ids || []);
      sheet.getRange(i + 1, 5).setValue(newJson);
      return response({ "result": "success", "message": "Lista de participantes actualizada." });
    }
  }
  return response({ "result": "error", "message": "Taller no encontrado" });
}

function createTaller(ss, data) {
  var sheet = getOrCreateSheet(ss, 'Talleres', ['ID_Taller', 'Fecha_Creacion', 'Titulo', 'Fecha_Taller', 'Invitados_IDs', 'Enlace_Meet']);
  var newId = getLastId(sheet) + 1;
  var fechaHoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  var invitadosString = JSON.stringify(data.invitados || []);
  sheet.appendRow([newId, fechaHoy, data.titulo, data.fechaTaller, invitadosString, ""]);
  return response({ "result": "success", "message": "Taller creado correctamente" });
}

function getAllTalleres(ss) {
  var sheet = ss.getSheetByName('Talleres');
  if (!sheet) return response({ "result": "success", "data": [] });

  var rows = sheet.getDataRange().getValues();
  var talleres = [];
  for (var i = 1; i < rows.length; i++) {
    var invitados = [];
    try { invitados = JSON.parse(rows[i][4]); } catch(e){}
    talleres.push({
      id: rows[i][0],
      titulo: rows[i][2],
      fechaTaller: cleanDate(rows[i][3]),
      invitados: invitados,
      link: rows[i][5] || ""
    });
  }
  return response({ "result": "success", "data": talleres });
}

function getDocenteTalleres(ss, userId) {
  var sheet = ss.getSheetByName('Talleres');
  if (!sheet) return response({ "result": "success", "data": [] });

  var rows = sheet.getDataRange().getValues();
  var misTalleres = [];
  for (var i = 1; i < rows.length; i++) {
    var invitadosRaw = rows[i][4];
    try {
      var listaInvitados = JSON.parse(invitadosRaw);
      var estaInvitado = listaInvitados.some(function(id) { return String(id) === String(userId); });
      if (estaInvitado) {
        misTalleres.push({
          id: rows[i][0],
          titulo: rows[i][2],
          fechaTaller: cleanDate(rows[i][3]),
          link: rows[i][5] || ""
        });
      }
    } catch (e) {}
  }
  return response({ "result": "success", "data": misTalleres });
}

function updateTallerLink(ss, data) {
  var sheet = ss.getSheetByName('Talleres');
  if (!sheet) return response({ "result": "error", "message": "Hoja Talleres no existe" });

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.tallerId) {
      sheet.getRange(i + 1, 6).setValue(data.link);
      return response({ "result": "success", "message": "Enlace guardado." });
    }
  }
  return response({ "result": "error", "message": "Taller no encontrado" });
}

// ==========================================
// 4. FAVORITOS Y DOCS
// ==========================================

function toggleFavorite(ss, data) {
  var sheet = ss.getSheetByName('Docentes');
  if (!sheet) return response({ "result": "error", "message": "Hoja Docentes no existe" });

  var rows = sheet.getDataRange().getValues();
  if (sheet.getLastColumn() < 9) sheet.getRange(1, 9).setValue("Favoritos_IDs");

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.userId) {
      var currentFavs = [];
      try { currentFavs = JSON.parse(rows[i][8]); } catch(e){}
      if (!Array.isArray(currentFavs)) currentFavs = [];

      var docId = String(data.docId);
      var idx = currentFavs.indexOf(docId);
      if (idx > -1) currentFavs.splice(idx, 1);
      else currentFavs.push(docId);

      sheet.getRange(i + 1, 9).setValue(JSON.stringify(currentFavs));
      return response({ "result": "success", "favoritos": currentFavs });
    }
  }
  return response({ "result": "error", "message": "Usuario no encontrado" });
}

function getDocumentsList(ss) {
  var sheet = ss.getSheetByName('Documentacion') || ss.getSheetByName('Documentación');
  if (!sheet) return response({ "result": "success", "data": [] });

  var rows = sheet.getDataRange().getValues();
  var docs = [];
  for (var i = 1; i < rows.length; i++) {
    docs.push({
      id: rows[i][0],
      fecha: cleanDate(rows[i][1]),
      categoria: rows[i][2],
      titulo: rows[i][3],
      numero: rows[i][4],
      resumen: rows[i][5],
      url: rows[i][6]
    });
  }
  docs.sort(function(a, b) { return String(a.titulo).localeCompare(String(b.titulo)); });
  return response({ "result": "success", "data": docs });
}

// ==========================================
// 5. APLICACIONES + ESTUDIANTES
// ==========================================

function createApp(ss, data) {
  var sheet = getOrCreateSheet(ss, 'APPs', ['ID', 'Fecha', 'Nombre', 'Enlace', 'Funciones']);
  var newId = getLastId(sheet) + 1;
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  sheet.appendRow([newId, fecha, data.nombre || "", data.enlace || "", data.funciones || ""]);
  return response({ "result": "success", "message": "Aplicación guardada.", "id": newId });
}

function getApps(ss) {
  var sheet = ss.getSheetByName('APPs');
  if (!sheet) return response({ "result": "success", "data": [] });

  var rows = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    items.push({
      id: rows[i][0],
      fecha: cleanDate(rows[i][1]),
      nombre: rows[i][2],
      enlace: rows[i][3],
      funciones: rows[i][4]
    });
  }
  items.sort(function(a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
  return response({ "result": "success", "data": items });
}

function createStudentPublication(ss, data) {
  var sheet = getOrCreateSheet(ss, 'Publicaciones_Estudiantes', ['ID', 'Fecha', 'Titulo', 'Enlace', 'Descripcion']);
  var newId = getLastId(sheet) + 1;
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  sheet.appendRow([newId, fecha, data.titulo || "", data.enlace || "", data.descripcion || ""]);
  return response({ "result": "success", "message": "Publicación guardada.", "id": newId });
}

function getStudentPublications(ss) {
  var sheet = ss.getSheetByName('Publicaciones_Estudiantes');
  if (!sheet) return response({ "result": "success", "data": [] });

  var rows = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    items.push({
      id: rows[i][0],
      fecha: cleanDate(rows[i][1]),
      titulo: rows[i][2],
      enlace: rows[i][3],
      descripcion: rows[i][4]
    });
  }
  // Más nuevo primero
  items.sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
  return response({ "result": "success", "data": items });
}

function createStudentTutorial(ss, data) {
  var sheet = getOrCreateSheet(ss, 'Tutoriales_Estudiantes', ['ID', 'Fecha', 'Titulo', 'Enlace', 'Descripcion']);
  var newId = getLastId(sheet) + 1;
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  sheet.appendRow([newId, fecha, data.titulo || "", data.enlace || "", data.descripcion || ""]);
  return response({ "result": "success", "message": "Tutorial guardado.", "id": newId });
}

function getStudentTutorials(ss) {
  var sheet = ss.getSheetByName('Tutoriales_Estudiantes');
  if (!sheet) return response({ "result": "success", "data": [] });

  var rows = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    items.push({
      id: rows[i][0],
      fecha: cleanDate(rows[i][1]),
      titulo: rows[i][2],
      enlace: rows[i][3],
      descripcion: rows[i][4]
    });
  }
  items.sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
  return response({ "result": "success", "data": items });
}

// ==========================================
// 6. PERFIL + AUTH + REGISTRO + DRIVE
// ==========================================

function getUserProfile(ss, userId) {
  var sheet = ss.getSheetByName('Docentes');
  if (!sheet) return response({ "result": "error", "message": "Hoja Docentes no existe" });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == userId) {
      var favs = [];
      try { favs = JSON.parse(data[i][8]); } catch(e){}
      return response({
        "result": "success",
        "data": {
          "dni": data[i][5] || "",
          "telefono": data[i][6] || "",
          "institucion": data[i][7] || "",
          "favoritos": favs
        }
      });
    }
  }
  return response({ "result": "error", "message": "Usuario no encontrado" });
}

function updateUserProfile(ss, data) {
  var sheet = ss.getSheetByName('Docentes');
  if (!sheet) return response({ "result": "error", "message": "Hoja Docentes no existe" });

  if (sheet.getLastColumn() < 9) {
    sheet.getRange(1, 6).setValue("DNI");
    sheet.getRange(1, 7).setValue("Telefono");
    sheet.getRange(1, 8).setValue("Institucion");
    sheet.getRange(1, 9).setValue("Favoritos_IDs");
  }

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.userId) {
      sheet.getRange(i + 1, 6).setValue(data.dni);
      sheet.getRange(i + 1, 7).setValue(data.telefono);
      sheet.getRange(i + 1, 8).setValue(data.institucion);
      return response({ "result": "success", "message": "Perfil actualizado" });
    }
  }
  return response({ "result": "error", "message": "No se pudo actualizar" });
}

function authenticateUser(ss, email, password) {
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return response({ "result": "error", "message": "Hoja Usuarios no existe" });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase().trim() == String(email).toLowerCase().trim() &&
        String(data[i][3]) == String(password)) {

      if (String(data[i][5]).toLowerCase() === 'activo') {
        return response({ "result": "success", "user": { "id": data[i][0], "nombre": data[i][1], "email": data[i][2], "rol": data[i][4] } });
      } else {
        return response({ "result": "error", "message": "Usuario inactivo." });
      }
    }
  }
  return response({ "result": "error", "message": "Credenciales incorrectas." });
}

function registerUser(ss, data) {
  var masterSheet = getOrCreateSheet(ss, 'Usuarios', ['ID_Usuario', 'Nombre_Usuario', 'Email_Usuario', 'Password_Usuario', 'Rol_Usuario', 'Estado_Usuario', 'Casilla_Mail']);

  var targetRow = findFirstEmptyRowByColumnA(masterSheet);

  var lastRow = masterSheet.getLastRow();
  if (lastRow >= 2) {
    var emails = masterSheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
    var cleanEmails = emails.map(function(e) { return String(e || "").toLowerCase().trim(); }).filter(Boolean);
    if (cleanEmails.includes(String(data.email || "").toLowerCase().trim())) {
      return response({ "result": "error", "message": "El email ya está registrado." });
    }
  }

  var newId = getLastId(masterSheet) + 1;
  var rol = String(data.rol || "").toLowerCase().trim();
  var masterData = [newId, data.nombre, data.email, data.password, rol, 'inactivo', false];

  masterSheet.getRange(targetRow, 1, 1, masterData.length).setValues([masterData]);
  masterSheet.getRange(targetRow, 7).insertCheckboxes();

  var targetName = (rol === 'docente') ? 'Docentes' : (rol.includes('estudiante')) ? 'Estudiantes' : null;
  if (targetName) {
    var headers = ['ID_Usuario', 'Nombre_Usuario', 'Email_Usuario', 'Rol_Usuario', 'Estado_Usuario'];
    if (rol === 'docente') headers = headers.concat(['DNI', 'Telefono', 'Institucion', 'Favoritos_IDs']);

    var roleSheet = getOrCreateSheet(ss, targetName, headers);
    var targetRowRole = findFirstEmptyRowByColumnA(roleSheet);

    var roleData = [newId, data.nombre, data.email, rol, 'inactivo'];
    if (rol === 'docente') roleData = roleData.concat(['', '', '', '[]']);

    roleSheet.getRange(targetRowRole, 1, 1, roleData.length).setValues([roleData]);
  }

  return response({ "result": "success", "id": newId });
}

function uploadDocumentToDrive(ss, data) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), data.mimeType || "application/pdf", data.fileName);
    var file = folder.createFile(blob);

    var docSheet = getOrCreateSheet(ss, 'Documentacion', ['ID', 'Fecha', 'Categoria', 'Titulo', 'Numero', 'Resumen', 'ArchivoURL']);
    var newId = getLastId(docSheet) + 1;
    var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

    docSheet.appendRow([newId, fecha, data.categoria, data.titulo, data.numero, data.resumen, file.getUrl()]);
    return response({ "result": "success", "message": "Documento subido correctamente." });
  } catch (e) {
    return response({ "result": "error", "message": "Error Drive: " + e.message });
  }
}

// ==========================================
// 7. HELPERS
// ==========================================

function cleanDate(rawDate) {
  if (!rawDate) return "";
  if (Object.prototype.toString.call(rawDate) === '[object Date]') return Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
  return String(rawDate);
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function getLastId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  var maxId = 0;
  ids.forEach(function(id) { var n = Number(id); if (!isNaN(n) && n > maxId) maxId = n; });
  return maxId;
}

function findFirstEmptyRowByColumnA(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;

  var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var val = colA[i][0];
    if (val === "" || val === null) return i + 2;
  }
  return lastRow + 1;
}
