# Docentes Brown - Plataforma Institucional

Sistema de gestión cerrado. Este campus **NO permite el registro de usuarios**. Toda la gestión de acceso se realiza mediante una base de datos centralizada en **Google Sheets**.

## 🔐 Modelo de Seguridad
El sistema consulta una Hoja de Cálculo de Google para validar si un usuario puede ingresar.
- **Solo lectura:** El sistema solo "lee" la hoja, no escribe en ella.
- **Gestión Centralizada:** Un administrador de Docentes Brown debe agregar filas en el Excel para crear usuarios.

## 📊 Configuración de la Base de Datos (Google Sheets)

### Paso 1: Crear la Hoja
1. Crea una nueva Google Sheet llamada `DB_Usuarios_Master`.
2. En la primera hoja (pestaña), crea **exactamente** estas 6 columnas en la fila 1 (el orden es vital):

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| **ID** | **Nombre** | **Email** | **Password** | **Rol** | **Estado** |

### Paso 2: Reglas de Llenado (Validación)
Cada fila representa un usuario. Respetar estrictamente estos valores:

* **ID:** Un número único (1, 2, 3...)
* **Nombre:** Nombre y Apellido (Ej: Lucas Brown)
* **Email:** Correo (será el usuario de login).
* **Password:** La contraseña asignada.
* **Rol:** Solo usar uno de estos tres valores (en minúsculas):
    * `administrador`
    * `docente`
    * `estudiante`
* **Estado:**
    * `activo` (Puede entrar)
    * `inactivo` (Acceso denegado, útil para bloquear sin borrar)

**Ejemplo de filas válidas:**
```csv
1, Lucas Admin, admin@docentesbrown.com, Brown2025!, administrador, activo
2, Mili Docente, mili@escuela.com, Profe123, docente, activo
3, Juan Perez, alumno@gmail.com, Alumno123, estudiante, activo
4, Jose Baja, jose@gmail.com, 123456, docente, inactivo
