const STORAGE_KEY = "notasUniversitariasLocalV2";
const LEGACY_STORAGE_KEY = "notasUniversitariasLocalV1";
const ROLES = {
  STUDENT: "Alumno",
  ADMIN: "Administrador"
};

const DEFAULT_STATE = {
  version: 2,
  theme: "dark",
  currentUserId: null,
  users: []
};

let state = loadState();

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const toast = $("#toast");

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeState(JSON.parse(saved));

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return migrateLegacyState(JSON.parse(legacy));

    return deepClone(DEFAULT_STATE);
  } catch (error) {
    console.warn("No se pudo cargar LocalStorage:", error);
    return deepClone(DEFAULT_STATE);
  }
}

function migrateLegacyState(legacyState) {
  const studentId = makeId("user");
  const adminId = makeId("user");
  const semesters = Array.isArray(legacyState.semesters) ? legacyState.semesters : [];

  return normalizeState({
    version: 2,
    theme: legacyState.theme || "dark",
    currentUserId: studentId,
    users: [
      {
        id: adminId,
        name: "Administrador",
        role: ROLES.ADMIN,
        password: "admin",
        study: "",
        semesters: [],
        activeSemesterId: null,
        selectedSubjectId: null
      },
      {
        id: studentId,
        name: "Alumno local",
        role: ROLES.STUDENT,
        password: "1234",
        study: "",
        semesters,
        activeSemesterId: legacyState.activeSemesterId || semesters[0]?.id || null,
        selectedSubjectId: legacyState.selectedSubjectId || null
      }
    ]
  });
}

function normalizeState(rawState) {
  const normalized = {
    ...deepClone(DEFAULT_STATE),
    ...rawState,
    users: Array.isArray(rawState.users) ? rawState.users.map(normalizeUser) : []
  };

  if (!normalized.users.some((user) => user.id === normalized.currentUserId)) {
    normalized.currentUserId = null;
  }

  normalized.theme = normalized.theme === "light" ? "light" : "dark";
  normalized.version = 2;
  return normalized;
}

function normalizeUser(user) {
  const role = user.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT;
  const semesters = Array.isArray(user.semesters) ? user.semesters.map(normalizeSemester) : [];
  const activeSemesterId = semesters.some((semester) => semester.id === user.activeSemesterId)
    ? user.activeSemesterId
    : semesters[0]?.id || null;

  return {
    id: user.id || makeId("user"),
    name: user.name || (role === ROLES.ADMIN ? "Administrador" : "Alumno"),
    role,
    password: user.password || "",
    study: user.study || "",
    semesters: role === ROLES.STUDENT ? semesters : semesters,
    activeSemesterId,
    selectedSubjectId: user.selectedSubjectId || null
  };
}

function normalizeSemester(semester) {
  return {
    id: semester.id || makeId("sem"),
    name: semester.name || "Semestre sin nombre",
    subjects: Array.isArray(semester.subjects) ? semester.subjects.map(normalizeSubject) : []
  };
}

function normalizeSubject(subject) {
  return {
    id: subject.id || makeId("ramo"),
    name: subject.name || "Asignatura sin nombre",
    presentationPercent: toNumber(subject.presentationPercent, 60),
    examPercent: toNumber(subject.examPercent, 40),
    approvalGrade: toNumber(subject.approvalGrade, 4),
    exemptionEnabled: Boolean(subject.exemptionEnabled),
    exemptionGrade: toNumber(subject.exemptionGrade, 5.5),
    examGrade: subject.examGrade === null || subject.examGrade === undefined ? null : toNumber(subject.examGrade, null),
    simulationExamGrade: toNumber(subject.simulationExamGrade, 4),
    evaluations: Array.isArray(subject.evaluations) ? subject.evaluations.map(normalizeEvaluation) : []
  };
}

function normalizeEvaluation(evaluation) {
  return {
    id: evaluation.id || makeId("eval"),
    name: evaluation.name || "Evaluacion",
    type: evaluation.type || "Teorico",
    weight: toNumber(evaluation.weight, 0),
    grade: toNumber(evaluation.grade, 1)
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatGrade(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return roundTo(value, digits).toFixed(digits);
}

function formatOne(value) {
  if (!Number.isFinite(value)) return "--";
  return roundTo(value, 1).toFixed(1);
}

function formatMinimumExamGrade(value) {
  if (value === 0) return "Eximido";
  if (value === Infinity) return "Imposible";
  if (!Number.isFinite(value)) return "--";
  if (value <= 1) return "1.0";
  if (value > 7) return "Sobre 7.0";
  return roundTo(value, 1).toFixed(1);
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function getStudent() {
  const user = getCurrentUser();
  return user?.role === ROLES.STUDENT ? user : null;
}

function getActiveSemester(student = getStudent()) {
  if (!student) return null;
  return student.semesters.find((semester) => semester.id === student.activeSemesterId) || student.semesters[0] || null;
}

function getSelectedSubject(student = getStudent()) {
  const semester = getActiveSemester(student);
  return semester?.subjects.find((subject) => subject.id === student.selectedSubjectId) || null;
}

function getSubjectById(subjectId, student = getStudent()) {
  if (!student) return null;
  for (const semester of student.semesters) {
    const subject = semester.subjects.find((item) => item.id === subjectId);
    if (subject) return subject;
  }
  return null;
}

function getEvaluationById(subjectId, evaluationId) {
  const subject = getSubjectById(subjectId);
  return subject?.evaluations.find((evaluation) => evaluation.id === evaluationId) || null;
}

function calculatePresentationGrade(subject) {
  // Formula matematica:
  // NotaPresentacion = sumatoria(NotaEvaluacion x PonderacionDecimal)
  // Ejemplo: 5.8 x 10% = 5.8 x 0.10 = 0.58
  return subject.evaluations.reduce((sum, evaluation) => {
    const grade = clamp(toNumber(evaluation.grade, 0), 1, 7);
    const decimalWeight = toNumber(evaluation.weight, 0) / 100;
    return sum + grade * decimalWeight;
  }, 0);
}

function isSubjectExempt(subject, presentationGrade = calculatePresentationGrade(subject)) {
  // Formula de eximicion:
  // Si la casilla esta activa y NotaPresentacion >= NotaEximicion,
  // el ramo se considera eximido de examen.
  return Boolean(subject.exemptionEnabled) && presentationGrade >= toNumber(subject.exemptionGrade, 5.5);
}

function calculateFinalGrade(subject, examGrade, presentationGrade = calculatePresentationGrade(subject)) {
  // Formula matematica:
  // NotaFinal = (NotaPresentacion x PorcentajePresentacionDecimal)
  //           + (NotaExamen x PorcentajeExamenDecimal)
  // Si existe eximicion y el alumno cumple la nota configurada,
  // la nota final proyectada se considera igual a la nota de presentacion.
  if (isSubjectExempt(subject, presentationGrade)) return presentationGrade;

  const presentationPercent = toNumber(subject.presentationPercent, 60) / 100;
  const examPercent = toNumber(subject.examPercent, 40) / 100;
  return presentationGrade * presentationPercent + clamp(toNumber(examGrade, 1), 1, 7) * examPercent;
}

function calculateMinimumExamGrade(subject, presentationGrade = calculatePresentationGrade(subject)) {
  // Formula matematica:
  // NotaMinimaExamen =
  // (NotaAprobacion - (NotaPresentacion x PorcentajePresentacionDecimal))
  // / PorcentajeExamenDecimal
  if (isSubjectExempt(subject, presentationGrade)) return 0;

  const approvalGrade = toNumber(subject.approvalGrade, 4);
  const presentationPercent = toNumber(subject.presentationPercent, 60) / 100;
  const examPercent = toNumber(subject.examPercent, 40) / 100;

  if (examPercent <= 0) {
    return presentationGrade * presentationPercent >= approvalGrade ? 1 : Infinity;
  }

  return (approvalGrade - presentationGrade * presentationPercent) / examPercent;
}

function getSubjectCalculations(subject, overrideExamGrade = null) {
  const presentationGrade = calculatePresentationGrade(subject);
  const projectedExam = overrideExamGrade !== null && overrideExamGrade !== undefined
    ? toNumber(overrideExamGrade, 4)
    : subject.examGrade ?? subject.simulationExamGrade ?? 4;
  const exempt = isSubjectExempt(subject, presentationGrade);
  const finalGrade = calculateFinalGrade(subject, projectedExam, presentationGrade);
  const minimumExamGrade = calculateMinimumExamGrade(subject, presentationGrade);
  const totalWeight = subject.evaluations.reduce((sum, evaluation) => sum + toNumber(evaluation.weight, 0), 0);
  const status = getStatus(subject, finalGrade, minimumExamGrade, exempt);
  const exemptionGap = toNumber(subject.exemptionGrade, 5.5) - presentationGrade;

  return {
    presentationGrade,
    projectedExam,
    finalGrade,
    minimumExamGrade,
    totalWeight,
    status,
    exempt,
    exemptionGap
  };
}

function getStatus(subject, finalGrade, minimumExamGrade, exempt) {
  if (exempt) {
    return { label: "Eximido", className: "status-exempt" };
  }

  if (finalGrade >= toNumber(subject.approvalGrade, 4)) {
    return { label: "Aprobado", className: "status-approved" };
  }

  if (minimumExamGrade <= 7 && minimumExamGrade >= 1) {
    return { label: "En riesgo", className: "status-risk" };
  }

  return { label: "Reprobando", className: "status-fail" };
}

function render() {
  document.body.dataset.theme = state.theme;

  const currentUser = getCurrentUser();
  if (!state.users.length) {
    renderInitialSetup();
  } else if (!currentUser) {
    renderLogin();
  } else if (currentUser.role === ROLES.ADMIN) {
    renderAdminApp(currentUser);
  } else {
    renderStudentApp(currentUser);
  }

  saveState();
  requestAnimationFrame(drawAllCharts);
}

function renderInitialSetup() {
  app.innerHTML = `
    <main class="access-screen">
      <section class="access-card">
        <div class="access-actions">
          <div class="brand">
            <span class="brand-mark">N</span>
            <div>
              <strong>Notas U</strong>
              <span>Control academico local</span>
            </div>
          </div>
          <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        </div>

        <div>
          <p class="eyebrow">Bienvenido</p>
          <h1>Prepara tu espacio de estudio</h1>
        </div>

        <form id="initialSetupForm" class="setup-form">
          <div class="setup-grid">
            <div class="admin-card">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Rol administrador</p>
                  <h2>Cuenta principal</h2>
                </div>
              </div>
              <label>
                Nombre del administrador
                <input name="adminName" type="text" value="Administrador" required>
              </label>
              <label>
                Clave local
                <input name="adminPassword" type="password" value="admin" required>
              </label>
            </div>

            <div class="admin-card">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Rol alumno</p>
                  <h2>Primer dashboard</h2>
                </div>
              </div>
              <label class="check-row">
                <input name="createStudent" type="checkbox" checked>
                Crear alumno inicial
              </label>
              <label>
                Nombre del alumno
                <input name="studentName" type="text" value="Alumno">
              </label>
              <label>
                Clave local
                <input name="studentPassword" type="password" value="1234">
              </label>
              <label>
                Que estudiaras
                <input name="study" type="text" placeholder="Ej: Ingenieria, Derecho, Enfermeria">
              </label>
              <label>
                Semestre en curso
                <input name="semesterName" type="text" placeholder="Opcional, ej: Semestre 1 2026">
              </label>
            </div>
          </div>

          <button class="primary-button" type="submit">Crear espacio local</button>
        </form>
      </section>
    </main>
  `;
}

function renderLogin() {
  app.innerHTML = `
    <main class="access-screen">
      <section class="access-card">
        <div class="access-actions">
          <div class="brand">
            <span class="brand-mark">N</span>
            <div>
              <strong>Notas U</strong>
              <span>Control academico local</span>
            </div>
          </div>
          <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        </div>

        <div>
          <p class="eyebrow">Acceso</p>
          <h1>Selecciona tu usuario</h1>
        </div>

        <form id="loginForm" class="login-form">
          <label>
            Usuario
            <select name="userId">
              ${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)} - ${user.role}</option>`).join("")}
            </select>
          </label>
          <label>
            Clave local
            <input name="password" type="password" required>
          </label>
          <button class="primary-button" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  `;
}

function renderAdminApp(admin) {
  const userStats = {
    total: state.users.length,
    students: state.users.filter((user) => user.role === ROLES.STUDENT).length,
    admins: state.users.filter((user) => user.role === ROLES.ADMIN).length
  };

  app.innerHTML = `
    <div class="app-shell">
      ${renderAdminSidebar(admin)}
      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Administracion</p>
            <h1>Gestion de usuarios</h1>
          </div>
          <span class="role-pill">${admin.role}</span>
        </header>

        <section class="summary-grid">
          ${metricCard("Usuarios", userStats.total, "Cuentas locales creadas")}
          ${metricCard("Alumnos", userStats.students, "Dashboards personales")}
          ${metricCard("Administradores", userStats.admins, "Gestion de usuarios")}
          ${metricCard("Sesion", admin.name, "Usuario actual")}
        </section>

        <section class="admin-grid">
          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Nuevo usuario</p>
                <h2>Crear cuenta local</h2>
              </div>
            </div>
            <form id="createUserForm" class="admin-form">
              <div class="form-grid two">
                <label>
                  Nombre
                  <input name="name" type="text" required>
                </label>
                <label>
                  Rol
                  <select name="role">
                    <option value="${ROLES.STUDENT}">Alumno</option>
                    <option value="${ROLES.ADMIN}">Administrador</option>
                  </select>
                </label>
              </div>
              <label>
                Clave local
                <input name="password" type="password" required>
              </label>
              <label>
                Que estudia
                <input name="study" type="text" placeholder="Solo para alumnos">
              </label>
              <label>
                Primer semestre
                <input name="semesterName" type="text" placeholder="Opcional">
              </label>
              <button class="primary-button" type="submit">Crear usuario</button>
            </form>
          </div>

          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Claves</p>
                <h2>Ayuda futura</h2>
              </div>
            </div>
            <p class="hint">Las claves son locales y sirven solo dentro de este navegador. El administrador puede cambiarlas desde la tabla de usuarios.</p>
          </div>
        </section>

        <section class="admin-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Usuarios</p>
              <h2>Lista de cuentas</h2>
            </div>
          </div>
          ${renderUsersTable(admin)}
        </section>
      </main>
    </div>
  `;
}

function renderAdminSidebar(admin) {
  return `
    <aside class="sidebar" aria-label="Panel de administracion">
      <div class="brand">
        <span class="brand-mark">N</span>
        <div>
          <strong>Notas U</strong>
          <span>Administrador local</span>
        </div>
      </div>

      <section class="sidebar-section">
        <span class="role-pill">${admin.role}</span>
        <strong>${escapeHtml(admin.name)}</strong>
      </section>

      <section class="action-stack">
        <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        <button class="ghost-button" type="button" data-action="logout">Cerrar sesion</button>
      </section>

      <p class="storage-note">Panel limitado a usuarios y claves locales. Los ramos pertenecen a cada alumno.</p>
    </aside>
  `;
}

function renderUsersTable(admin) {
  if (!state.users.length) {
    return `<div class="empty-state">No hay usuarios creados.</div>`;
  }

  const rows = state.users.map((user) => {
    const isCurrent = user.id === admin.id;
    return `
      <tr>
        <td>
          <input class="table-input" data-user-field="name" data-id="${user.id}" value="${escapeAttribute(user.name)}">
        </td>
        <td>
          <select class="table-select" data-user-field="role" data-id="${user.id}">
            <option value="${ROLES.STUDENT}" ${user.role === ROLES.STUDENT ? "selected" : ""}>Alumno</option>
            <option value="${ROLES.ADMIN}" ${user.role === ROLES.ADMIN ? "selected" : ""}>Administrador</option>
          </select>
        </td>
        <td>
          <input class="table-input" data-user-field="password" data-id="${user.id}" value="${escapeAttribute(user.password)}">
        </td>
        <td>
          <input class="table-input" data-user-field="study" data-id="${user.id}" value="${escapeAttribute(user.study)}" ${user.role === ROLES.ADMIN ? "disabled" : ""}>
        </td>
        <td>${user.role === ROLES.STUDENT ? user.semesters.length : "--"}</td>
        <td>
          <button class="danger-ghost icon-button" type="button" data-action="delete-user" data-id="${user.id}" ${isCurrent ? "disabled" : ""}>x</button>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Clave local</th>
            <th>Estudios</th>
            <th>Semestres</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderStudentApp(student) {
  const semester = getActiveSemester(student);

  app.innerHTML = `
    <div class="app-shell">
      ${renderStudentSidebar(student)}
      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Dashboard alumno</p>
            <h1>${escapeHtml(student.name)}</h1>
          </div>
          <div class="admin-toolbar">
            <span class="role-pill">${student.role}</span>
            ${semester ? `<button class="danger-ghost" type="button" data-action="clear-semester">Limpiar semestre</button>` : ""}
          </div>
        </header>

        ${semester ? renderStudentDashboard(student, semester) : renderStudentWelcome(student)}
      </main>
    </div>
  `;
}

function renderStudentSidebar(student) {
  const hasSemesters = student.semesters.length > 0;
  const options = hasSemesters
    ? student.semesters.map((semester) => `<option value="${semester.id}" ${semester.id === student.activeSemesterId ? "selected" : ""}>${escapeHtml(semester.name)}</option>`).join("")
    : `<option value="">Sin semestres</option>`;

  return `
    <aside class="sidebar" aria-label="Panel de alumno">
      <div class="brand">
        <span class="brand-mark">N</span>
        <div>
          <strong>Notas U</strong>
          <span>${escapeHtml(student.study || "Dashboard academico")}</span>
        </div>
      </div>

      <section class="sidebar-section">
        <span class="role-pill">${student.role}</span>
        <strong>${escapeHtml(student.name)}</strong>
      </section>

      <section class="sidebar-section">
        <label for="semesterSelect">Semestre activo</label>
        <select id="semesterSelect" ${hasSemesters ? "" : "disabled"}>${options}</select>
        <form id="semesterForm" class="inline-form">
          <input name="semesterName" type="text" placeholder="Ej: Semestre 2 2026" autocomplete="off">
          <button type="submit" title="Crear semestre">+</button>
        </form>
      </section>

      <section class="action-stack">
        <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        <button class="ghost-button" type="button" data-action="export-excel">Exportar a Excel</button>
        <button class="ghost-button" type="button" data-action="logout">Cerrar sesion</button>
      </section>

      <p class="storage-note">Toda la informacion del alumno se guarda en LocalStorage de este navegador.</p>
    </aside>
  `;
}

function renderStudentWelcome(student) {
  return `
    <section class="welcome-panel">
      <div>
        <p class="eyebrow">Inicio</p>
        <h2>Bienvenido, que estudiaras</h2>
      </div>
      <form id="studentProfileForm" class="profile-form">
        <label>
          Area o carrera
          <input name="study" type="text" value="${escapeAttribute(student.study)}" placeholder="Ej: Ingenieria Informatica">
        </label>
        <label>
          Semestre que estas cursando
          <input name="semesterName" type="text" placeholder="Ej: Semestre 1 2026">
        </label>
        <button class="primary-button" type="submit">Guardar y crear semestre</button>
      </form>
    </section>
  `;
}

function renderStudentDashboard(student, semester) {
  return `
    ${renderSummary(student, semester)}

    <section class="panel-grid">
      <div class="tool-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Semestre</p>
            <h2>${escapeHtml(semester.name)}</h2>
          </div>
        </div>
        <form id="studentProfileForm" class="profile-form">
          <label>
            Que estudias
            <input name="study" type="text" value="${escapeAttribute(student.study)}" placeholder="Ej: Ingenieria Informatica">
          </label>
          <button class="small-button" type="submit">Actualizar perfil</button>
        </form>
      </div>

      <div class="tool-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Asignaturas</p>
            <h2>Crear ramo</h2>
          </div>
        </div>

        <form id="subjectForm" class="subject-form">
          <label>
            Nombre de la asignatura
            <input name="subjectName" type="text" placeholder="Ej: Calculo I" required>
          </label>
          <div class="form-grid">
            <label>
              Presentacion %
              <input name="presentationPercent" type="number" min="0" max="100" step="1" value="60">
            </label>
            <label>
              Examen %
              <input name="examPercent" type="number" min="0" max="100" step="1" value="40">
            </label>
            <label>
              Nota aprobacion
              <input name="approvalGrade" type="number" min="1" max="7" step="0.1" value="4.0">
            </label>
          </div>
          <button class="primary-button" type="submit">Crear asignatura</button>
        </form>
      </div>
    </section>

    <section>
      <div class="section-heading">
        <div>
          <p class="eyebrow">Vista general</p>
          <h2>Ramos del semestre</h2>
        </div>
      </div>
      <div class="subject-cards">${renderSubjectCards(student, semester)}</div>
    </section>

    ${renderSubjectDetail(student)}

    <details class="chart-panel">
      <summary>Ver grafico general <span class="muted">Rendimiento por ramo</span></summary>
      <div class="details-content">
        <div class="chart-wrap">
          <canvas id="semesterChart" aria-label="Grafico de rendimiento por ramo"></canvas>
        </div>
      </div>
    </details>
  `;
}

function renderSummary(student, semester) {
  const subjects = semester.subjects;
  const calculations = subjects.map((subject) => getSubjectCalculations(subject));
  const averagePresentation = average(calculations.map((item) => item.presentationGrade));
  const averageFinal = average(calculations.map((item) => item.finalGrade));
  const approved = calculations.filter((item) => ["Aprobado", "Eximido"].includes(item.status.label)).length;

  return `
    <section class="summary-grid" aria-label="Resumen del semestre">
      ${metricCard("Asignaturas", subjects.length, "Ramos creados")}
      ${metricCard("Presentacion promedio", formatGrade(averagePresentation), "Suma ponderada actual")}
      ${metricCard("Final proyectado", formatGrade(averageFinal), "Con examen guardado o simulado")}
      ${metricCard("Aprobados", approved, "Incluye ramos eximidos")}
    </section>
  `;
}

function metricCard(label, value, detail) {
  return `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(String(value))}</strong>
      <span class="hint">${escapeHtml(detail)}</span>
    </article>
  `;
}

function renderSubjectCards(student, semester) {
  if (!semester.subjects.length) {
    return `
      <div class="empty-state">
        Crea tu primera asignatura para comenzar a calcular presentacion, examen y nota final.
      </div>
    `;
  }

  return semester.subjects.map((subject) => {
    const calculations = getSubjectCalculations(subject);
    const selectedClass = subject.id === student.selectedSubjectId ? "is-active" : "";

    return `
      <article class="subject-card ${selectedClass}">
        <div class="card-title">
          <h3>${escapeHtml(subject.name)}</h3>
          ${statusPill(calculations.status)}
        </div>

        <div class="card-metrics">
          <div class="mini-metric">
            <span>Presentacion</span>
            <strong>${formatGrade(calculations.presentationGrade)}</strong>
          </div>
          <div class="mini-metric">
            <span>Examen necesario</span>
            <strong>${formatMinimumExamGrade(calculations.minimumExamGrade)}</strong>
          </div>
          <div class="mini-metric">
            <span>Final proyectada</span>
            <strong>${formatGrade(calculations.finalGrade)}</strong>
          </div>
          <div class="mini-metric">
            <span>Ponderacion</span>
            <strong>${formatOne(calculations.totalWeight)}%</strong>
          </div>
        </div>

        <div class="progress-line" aria-label="Ponderacion completada">
          <span style="--progress: ${clamp(calculations.totalWeight, 0, 100)}%"></span>
        </div>

        <div class="card-actions">
          <button class="small-button" type="button" data-action="select-subject" data-id="${subject.id}">Ver detalle</button>
          <button class="danger-ghost icon-button" type="button" title="Eliminar asignatura" data-action="delete-subject" data-id="${subject.id}">x</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderSubjectDetail(student) {
  const subject = getSelectedSubject(student);

  if (!subject) {
    return `
      <section class="empty-state">
        Selecciona una asignatura para editar evaluaciones, eximicion y simulacion de examen.
      </section>
    `;
  }

  const calculations = getSubjectCalculations(subject);
  const simulation = getSubjectCalculations(subject, subject.simulationExamGrade);
  const examGradeValue = subject.examGrade ?? "";

  return `
    <section class="detail-area">
      <div class="detail-card">
        <div class="detail-header">
          <div>
            <p class="eyebrow">Detalle del ramo</p>
            <h2>${escapeHtml(subject.name)}</h2>
          </div>
          ${statusPill(calculations.status)}
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Reglas</p>
              <h2>Calculo y eximicion</h2>
            </div>
          </div>

          <form id="settingsForm" class="settings-form" data-id="${subject.id}">
            <label>
              Nombre de la asignatura
              <input name="name" type="text" value="${escapeAttribute(subject.name)}" required>
            </label>
            <div class="form-grid">
              <label>
                Presentacion %
                <input name="presentationPercent" type="number" min="0" max="100" step="1" value="${subject.presentationPercent}">
              </label>
              <label>
                Examen %
                <input name="examPercent" type="number" min="0" max="100" step="1" value="${subject.examPercent}">
              </label>
              <label>
                Nota aprobacion
                <input name="approvalGrade" type="number" min="1" max="7" step="0.1" value="${subject.approvalGrade}">
              </label>
            </div>
            <label class="check-row">
              <input name="exemptionEnabled" type="checkbox" ${subject.exemptionEnabled ? "checked" : ""}>
              Casilla de eximicion de examen
            </label>
            <div class="form-grid two">
              <label>
                Nota final para eximirse
                <input name="exemptionGrade" type="number" min="1" max="7" step="0.1" value="${subject.exemptionGrade}">
              </label>
              <label>
                Nota de examen real
                <input name="examGrade" type="number" min="1" max="7" step="0.1" placeholder="Opcional" value="${examGradeValue}">
              </label>
            </div>
            <button class="primary-button" type="submit">Guardar reglas</button>
          </form>
        </div>

        <div class="detail-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Simulador</p>
              <h2>Probar examen</h2>
            </div>
          </div>

          <div class="simulator">
            <div class="range-row">
              <input id="examSimulator" type="range" min="1" max="7" step="0.1" value="${subject.simulationExamGrade}" data-id="${subject.id}">
              <span class="range-value">${formatOne(subject.simulationExamGrade)}</span>
            </div>

            <div class="result-strip">
              <div class="mini-metric">
                <span>Presentacion</span>
                <strong>${formatGrade(simulation.presentationGrade)}</strong>
              </div>
              <div class="mini-metric">
                <span>Examen minimo</span>
                <strong>${formatMinimumExamGrade(simulation.minimumExamGrade)}</strong>
              </div>
              <div class="mini-metric">
                <span>Final simulada</span>
                <strong>${formatGrade(simulation.finalGrade)}</strong>
              </div>
              <div class="mini-metric">
                <span>Eximicion</span>
                <strong>${exemptionSummary(subject, simulation)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Evaluaciones</p>
              <h2>Agregar nota</h2>
            </div>
          </div>

          <form id="evaluationForm" class="evaluation-form" data-id="${subject.id}">
            <label>
              Nombre de la evaluacion
              <input name="name" type="text" placeholder="Certamen automatico">
            </label>
            <div class="form-grid">
              <label>
                Tipo
                <input name="type" type="text" list="evaluationTypes" placeholder="Teorico">
                <datalist id="evaluationTypes">
                  <option value="Teorico"></option>
                  <option value="Practico"></option>
                  <option value="Laboratorio"></option>
                  <option value="Taller"></option>
                  <option value="Control"></option>
                  <option value="Proyecto"></option>
                </datalist>
              </label>
              <label>
                Ponderacion %
                <input name="weight" type="number" min="0" max="100" step="0.1" required>
              </label>
              <label>
                Nota obtenida
                <input name="grade" type="number" min="1" max="7" step="0.1" required>
              </label>
            </div>
            <button class="primary-button" type="submit">Agregar evaluacion</button>
          </form>
        </div>

        <div class="detail-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Resultados</p>
              <h2>Detalle ponderado editable</h2>
            </div>
          </div>
          ${renderEvaluationTable(subject)}
        </div>
      </div>

      <details class="detail-card">
        <summary>Ver grafico del ramo <span class="muted">Aporte por evaluacion</span></summary>
        <div class="details-content">
          <div class="chart-wrap">
            <canvas id="subjectChart" aria-label="Grafico de aportes por evaluacion"></canvas>
          </div>
        </div>
      </details>
    </section>
  `;
}

function renderEvaluationTable(subject) {
  const calculations = getSubjectCalculations(subject);

  if (!subject.evaluations.length) {
    return `<div class="empty-state">Aun no hay evaluaciones registradas para este ramo.</div>`;
  }

  const rows = subject.evaluations.map((evaluation) => {
    const result = toNumber(evaluation.grade, 0) * (toNumber(evaluation.weight, 0) / 100);
    return `
      <tr>
        <td>
          <input class="table-input" data-evaluation-field="name" data-subject-id="${subject.id}" data-id="${evaluation.id}" value="${escapeAttribute(evaluation.name)}">
        </td>
        <td>
          <input class="table-input" data-evaluation-field="type" data-subject-id="${subject.id}" data-id="${evaluation.id}" value="${escapeAttribute(evaluation.type)}">
        </td>
        <td>
          <input class="table-input narrow-input" data-evaluation-field="weight" data-subject-id="${subject.id}" data-id="${evaluation.id}" type="number" min="0" max="100" step="0.1" value="${evaluation.weight}">
        </td>
        <td>
          <input class="table-input narrow-input" data-evaluation-field="grade" data-subject-id="${subject.id}" data-id="${evaluation.id}" type="number" min="1" max="7" step="0.1" value="${evaluation.grade}">
        </td>
        <td>${formatGrade(result)}</td>
        <td>
          <button class="danger-ghost icon-button" type="button" title="Eliminar evaluacion" data-action="delete-evaluation" data-subject-id="${subject.id}" data-id="${evaluation.id}">x</button>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-wrap">
      <table class="evaluation-table">
        <thead>
          <tr>
            <th>Evaluacion</th>
            <th>Tipo</th>
            <th>Pond.</th>
            <th>Nota</th>
            <th>Resultado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">Totales</td>
            <td>${formatOne(calculations.totalWeight)}%</td>
            <td>Presentacion</td>
            <td>${formatGrade(calculations.presentationGrade)}</td>
            <td></td>
          </tr>
          <tr>
            <td colspan="4">Nota final proyectada</td>
            <td>${formatGrade(calculations.finalGrade)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function statusPill(status) {
  return `
    <span class="status-pill ${status.className}">
      <span class="status-dot"></span>${escapeHtml(status.label)}
    </span>
  `;
}

function exemptionSummary(subject, calculations) {
  if (!subject.exemptionEnabled) return "No aplica";
  if (calculations.exempt) return "Cumple";
  return `Faltan ${formatOne(Math.max(calculations.exemptionGap, 0))}`;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function createUser({ name, role, password, study = "", semesterName = "" }) {
  const semester = semesterName.trim()
    ? [{ id: makeId("sem"), name: semesterName.trim(), subjects: [] }]
    : [];

  return {
    id: makeId("user"),
    name: name.trim(),
    role,
    password,
    study: role === ROLES.STUDENT ? study.trim() : "",
    semesters: role === ROLES.STUDENT ? semester : [],
    activeSemesterId: role === ROLES.STUDENT ? semester[0]?.id || null : null,
    selectedSubjectId: null
  };
}

function setupInitialSpace(form) {
  const formData = new FormData(form);
  const admin = createUser({
    name: formData.get("adminName") || "Administrador",
    role: ROLES.ADMIN,
    password: formData.get("adminPassword") || "admin"
  });

  const users = [admin];
  let currentUserId = admin.id;

  if (formData.get("createStudent") === "on") {
    const student = createUser({
      name: formData.get("studentName") || "Alumno",
      role: ROLES.STUDENT,
      password: formData.get("studentPassword") || "1234",
      study: formData.get("study") || "",
      semesterName: formData.get("semesterName") || ""
    });
    users.push(student);
    currentUserId = student.id;
  }

  state.users = users;
  state.currentUserId = currentUserId;
  render();
  showToast("Espacio local creado.");
}

function login(form) {
  const formData = new FormData(form);
  const user = state.users.find((item) => item.id === formData.get("userId"));
  if (!user) return showToast("Usuario no encontrado.");
  if (user.password !== formData.get("password")) return showToast("Clave local incorrecta.");

  state.currentUserId = user.id;
  render();
  showToast(`Sesion iniciada como ${user.role}.`);
}

function logout() {
  state.currentUserId = null;
  render();
}

function addManagedUser(form) {
  const formData = new FormData(form);
  const role = formData.get("role") === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT;
  const user = createUser({
    name: formData.get("name"),
    role,
    password: formData.get("password"),
    study: formData.get("study") || "",
    semesterName: formData.get("semesterName") || ""
  });

  state.users.push(user);
  render();
  showToast("Usuario creado.");
}

function updateManagedUserField(input) {
  const user = state.users.find((item) => item.id === input.dataset.id);
  if (!user) return;

  const field = input.dataset.userField;
  const value = input.value;

  if (field === "role") {
    if (user.role === ROLES.ADMIN && value === ROLES.STUDENT && countAdmins() <= 1) {
      showToast("Debe existir al menos un administrador.");
      render();
      return;
    }
    user.role = value === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT;
    if (user.role === ROLES.ADMIN) user.study = "";
  } else if (field === "name") {
    user.name = value.trim() || user.name;
  } else if (field === "password") {
    user.password = value;
  } else if (field === "study" && user.role === ROLES.STUDENT) {
    user.study = value.trim();
  }

  render();
  showToast("Usuario actualizado.");
}

function deleteUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user) return;
  if (user.id === state.currentUserId) return showToast("No puedes eliminar tu propia sesion.");
  if (user.role === ROLES.ADMIN && countAdmins() <= 1) return showToast("Debe existir al menos un administrador.");

  const confirmed = confirm(`Eliminar usuario "${user.name}"?`);
  if (!confirmed) return;

  state.users = state.users.filter((item) => item.id !== id);
  render();
  showToast("Usuario eliminado.");
}

function countAdmins() {
  return state.users.filter((user) => user.role === ROLES.ADMIN).length;
}

function updateStudentProfile(form) {
  const student = getStudent();
  if (!student) return;

  const formData = new FormData(form);
  const study = formData.get("study");
  if (study !== null) student.study = study.trim();

  const semesterName = formData.get("semesterName");
  if (semesterName && semesterName.trim()) {
    addSemester(semesterName.trim(), false);
  } else {
    render();
    showToast("Perfil actualizado.");
  }
}

function addSemester(name, shouldRender = true) {
  const student = getStudent();
  if (!student) return;

  const trimmedName = String(name || "").trim();
  if (!trimmedName) return showToast("Escribe el nombre del semestre.");

  const semester = { id: makeId("sem"), name: trimmedName, subjects: [] };
  student.semesters.push(semester);
  student.activeSemesterId = semester.id;
  student.selectedSubjectId = null;

  if (shouldRender) {
    render();
    showToast("Semestre creado.");
  } else {
    render();
    showToast("Perfil y semestre guardados.");
  }
}

function addSubject(form) {
  const student = getStudent();
  const semester = getActiveSemester(student);
  if (!student || !semester) return showToast("Primero crea un semestre.");

  const formData = new FormData(form);
  const name = formData.get("subjectName").trim();
  if (!name) return showToast("Escribe el nombre de la asignatura.");

  const subject = {
    id: makeId("ramo"),
    name,
    presentationPercent: clamp(toNumber(formData.get("presentationPercent"), 60), 0, 100),
    examPercent: clamp(toNumber(formData.get("examPercent"), 40), 0, 100),
    approvalGrade: clamp(toNumber(formData.get("approvalGrade"), 4), 1, 7),
    exemptionEnabled: false,
    exemptionGrade: 5.5,
    examGrade: null,
    simulationExamGrade: 4,
    evaluations: []
  };

  semester.subjects.push(subject);
  student.selectedSubjectId = subject.id;
  render();
  showToast("Asignatura creada.");
}

function updateSubjectSettings(form) {
  const subject = getSubjectById(form.dataset.id);
  if (!subject) return;

  const formData = new FormData(form);
  subject.name = formData.get("name").trim() || subject.name;
  subject.presentationPercent = clamp(toNumber(formData.get("presentationPercent"), 60), 0, 100);
  subject.examPercent = clamp(toNumber(formData.get("examPercent"), 40), 0, 100);
  subject.approvalGrade = clamp(toNumber(formData.get("approvalGrade"), 4), 1, 7);
  subject.exemptionEnabled = formData.get("exemptionEnabled") === "on";
  subject.exemptionGrade = clamp(toNumber(formData.get("exemptionGrade"), 5.5), 1, 7);

  const rawExamGrade = formData.get("examGrade");
  subject.examGrade = rawExamGrade === "" ? null : clamp(toNumber(rawExamGrade, 1), 1, 7);

  render();
  showToast("Reglas actualizadas.");
}

function addEvaluation(form) {
  const subject = getSubjectById(form.dataset.id);
  if (!subject) return;

  const formData = new FormData(form);
  const name = formData.get("name").trim() || nextEvaluationName(subject);
  const evaluation = {
    id: makeId("eval"),
    name,
    type: formData.get("type").trim() || "Teorico",
    weight: clamp(toNumber(formData.get("weight"), 0), 0, 100),
    grade: clamp(toNumber(formData.get("grade"), 1), 1, 7)
  };

  subject.evaluations.push(evaluation);
  render();
  showToast("Evaluacion agregada.");
}

function nextEvaluationName(subject) {
  const names = new Set(subject.evaluations.map((evaluation) => evaluation.name.toLowerCase()));
  let index = 1;
  while (names.has(`certamen ${index}`)) index += 1;
  return `Certamen ${index}`;
}

function updateEvaluationField(input) {
  const evaluation = getEvaluationById(input.dataset.subjectId, input.dataset.id);
  const subject = getSubjectById(input.dataset.subjectId);
  if (!evaluation || !subject) return;

  const field = input.dataset.evaluationField;
  if (field === "name") {
    evaluation.name = input.value.trim() || nextEvaluationName(subject);
  } else if (field === "type") {
    evaluation.type = input.value.trim() || "Teorico";
  } else if (field === "weight") {
    evaluation.weight = clamp(toNumber(input.value, 0), 0, 100);
  } else if (field === "grade") {
    evaluation.grade = clamp(toNumber(input.value, 1), 1, 7);
  }

  render();
  showToast("Detalle ponderado actualizado.");
}

function deleteSubject(id) {
  const student = getStudent();
  const semester = getActiveSemester(student);
  const subject = semester?.subjects.find((item) => item.id === id);
  if (!subject) return;

  const confirmed = confirm(`Eliminar "${subject.name}" y todas sus evaluaciones?`);
  if (!confirmed) return;

  semester.subjects = semester.subjects.filter((item) => item.id !== id);
  if (student.selectedSubjectId === id) student.selectedSubjectId = semester.subjects[0]?.id || null;
  render();
  showToast("Asignatura eliminada.");
}

function deleteEvaluation(subjectId, evaluationId) {
  const subject = getSubjectById(subjectId);
  if (!subject) return;

  subject.evaluations = subject.evaluations.filter((evaluation) => evaluation.id !== evaluationId);
  render();
  showToast("Evaluacion eliminada.");
}

function clearActiveSemester() {
  const student = getStudent();
  const semester = getActiveSemester(student);
  if (!semester) return;

  const confirmed = confirm(`Limpiar todas las asignaturas de "${semester.name}"?`);
  if (!confirmed) return;

  semester.subjects = [];
  student.selectedSubjectId = null;
  render();
  showToast("Semestre limpiado.");
}

function exportExcel() {
  const student = getStudent();
  if (!student) return showToast("La exportacion esta disponible para alumnos.");

  const rows = [
    [
      "Alumno",
      "Que estudia",
      "Semestre",
      "Asignatura",
      "Presentacion %",
      "Examen %",
      "Nota aprobacion",
      "Eximicion activa",
      "Nota eximicion",
      "Nota presentacion",
      "Examen necesario",
      "Nota examen guardada",
      "Nota final proyectada",
      "Estado",
      "Evaluacion",
      "Tipo",
      "Ponderacion %",
      "Nota",
      "Resultado"
    ]
  ];

  student.semesters.forEach((semester) => {
    semester.subjects.forEach((subject) => {
      const calculations = getSubjectCalculations(subject);
      if (!subject.evaluations.length) {
        rows.push(subjectExportRow(student, semester, subject, calculations));
      } else {
        subject.evaluations.forEach((evaluation) => {
          const result = toNumber(evaluation.grade, 0) * (toNumber(evaluation.weight, 0) / 100);
          rows.push(subjectExportRow(student, semester, subject, calculations, evaluation, result));
        });
      }
    });
  });

  const html = `
    <html>
      <head><meta charset="UTF-8"></head>
      <body>
        <table>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`).join("")}
        </table>
      </body>
    </html>
  `;

  const fileName = `notas-${slugify(student.name)}-${new Date().toISOString().slice(0, 10)}.xls`;
  downloadFile(fileName, html, "application/vnd.ms-excel");
  showToast("Archivo compatible con Excel exportado.");
}

function subjectExportRow(student, semester, subject, calculations, evaluation = null, result = "") {
  return [
    student.name,
    student.study,
    semester.name,
    subject.name,
    subject.presentationPercent,
    subject.examPercent,
    subject.approvalGrade,
    subject.exemptionEnabled ? "Si" : "No",
    subject.exemptionGrade,
    formatGrade(calculations.presentationGrade),
    formatMinimumExamGrade(calculations.minimumExamGrade),
    subject.examGrade ?? "",
    formatGrade(calculations.finalGrade),
    calculations.status.label,
    evaluation?.name ?? "",
    evaluation?.type ?? "",
    evaluation?.weight ?? "",
    evaluation?.grade ?? "",
    result === "" ? "" : formatGrade(result)
  ];
}

function downloadFile(fileName, content, mimeType) {
  const blob = new Blob(["\ufeff", content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function drawAllCharts() {
  drawSemesterChart();
  drawSubjectChart();
}

function drawSemesterChart() {
  const canvas = $("#semesterChart");
  const student = getStudent();
  const semester = getActiveSemester(student);
  if (!canvas || !semester) return;

  const data = semester.subjects.map((subject) => ({
    label: subject.name,
    value: getSubjectCalculations(subject).finalGrade
  }));

  drawBarChart(canvas, data, "Final proyectada", 7);
}

function drawSubjectChart() {
  const canvas = $("#subjectChart");
  const subject = getSelectedSubject();
  if (!canvas || !subject) return;

  const data = subject.evaluations.map((evaluation) => ({
    label: evaluation.name,
    value: toNumber(evaluation.grade, 0) * (toNumber(evaluation.weight, 0) / 100)
  }));

  drawBarChart(canvas, data, "Aporte a presentacion", 7);
}

function drawBarChart(canvas, data, label, maxValue) {
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width || 320);
  const height = Math.max(220, rect.height || 220);

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text").trim();
  const mutedColor = styles.getPropertyValue("--muted").trim();
  const lineColor = styles.getPropertyValue("--line").trim();
  const primaryColor = styles.getPropertyValue("--primary").trim();
  const accentColor = styles.getPropertyValue("--accent").trim();

  context.fillStyle = mutedColor;
  context.font = "700 13px Segoe UI, Arial";

  if (!data.length) {
    context.textAlign = "center";
    context.fillText("No hay datos para graficar", width / 2, height / 2);
    return;
  }

  const padding = { top: 26, right: 18, bottom: 52, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const safeMax = Math.max(maxValue, ...data.map((item) => item.value), 1);
  const barGap = 12;
  const barWidth = Math.max(24, (chartWidth - barGap * (data.length - 1)) / data.length);

  context.strokeStyle = lineColor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, padding.top + chartHeight);
  context.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  context.stroke();

  for (let tick = 1; tick <= 7; tick += 1) {
    const y = padding.top + chartHeight - (tick / safeMax) * chartHeight;
    context.strokeStyle = lineColor;
    context.globalAlpha = 0.42;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(padding.left + chartWidth, y);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = mutedColor;
    context.textAlign = "right";
    context.fillText(String(tick), padding.left - 8, y + 4);
  }

  data.forEach((item, index) => {
    const x = padding.left + index * (barWidth + barGap);
    const normalizedValue = clamp(item.value, 0, safeMax);
    const barHeight = (normalizedValue / safeMax) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    const gradient = context.createLinearGradient(0, y, 0, padding.top + chartHeight);
    gradient.addColorStop(0, primaryColor);
    gradient.addColorStop(1, accentColor);

    context.fillStyle = gradient;
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = textColor;
    context.textAlign = "center";
    context.font = "800 12px Segoe UI, Arial";
    context.fillText(formatGrade(item.value), x + barWidth / 2, y - 6);

    context.save();
    context.translate(x + barWidth / 2, padding.top + chartHeight + 16);
    context.rotate(-0.45);
    context.fillStyle = mutedColor;
    context.font = "700 11px Segoe UI, Arial";
    context.textAlign = "right";
    context.fillText(shorten(item.label, 18), 0, 0);
    context.restore();
  });

  context.fillStyle = mutedColor;
  context.font = "800 12px Segoe UI, Arial";
  context.textAlign = "left";
  context.fillText(label, padding.left, 16);
}

function themeButtonText() {
  return state.theme === "dark" ? "Modo claro" : "Modo oscuro";
}

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "alumno";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(String(value ?? ""));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

document.addEventListener("submit", (event) => {
  if (event.target.id === "initialSetupForm") {
    event.preventDefault();
    setupInitialSpace(event.target);
  }

  if (event.target.id === "loginForm") {
    event.preventDefault();
    login(event.target);
  }

  if (event.target.id === "createUserForm") {
    event.preventDefault();
    addManagedUser(event.target);
  }

  if (event.target.id === "studentProfileForm") {
    event.preventDefault();
    updateStudentProfile(event.target);
  }

  if (event.target.id === "semesterForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    addSemester(formData.get("semesterName"));
  }

  if (event.target.id === "subjectForm") {
    event.preventDefault();
    addSubject(event.target);
  }

  if (event.target.id === "settingsForm") {
    event.preventDefault();
    updateSubjectSettings(event.target);
  }

  if (event.target.id === "evaluationForm") {
    event.preventDefault();
    addEvaluation(event.target);
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id, subjectId } = button.dataset;

  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    render();
  }

  if (action === "logout") logout();
  if (action === "export-excel") exportExcel();
  if (action === "clear-semester") clearActiveSemester();
  if (action === "delete-user") deleteUser(id);

  if (action === "select-subject") {
    const student = getStudent();
    if (!student) return;
    student.selectedSubjectId = id;
    render();
  }

  if (action === "delete-subject") deleteSubject(id);
  if (action === "delete-evaluation") deleteEvaluation(subjectId, id);
});

document.addEventListener("change", (event) => {
  if (event.target.id === "semesterSelect") {
    const student = getStudent();
    if (!student) return;
    student.activeSemesterId = event.target.value;
    student.selectedSubjectId = getActiveSemester(student)?.subjects[0]?.id || null;
    render();
  }

  if (event.target.matches("[data-user-field]")) {
    updateManagedUserField(event.target);
  }

  if (event.target.matches("[data-evaluation-field]")) {
    updateEvaluationField(event.target);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id !== "examSimulator") return;

  const subject = getSubjectById(event.target.dataset.id);
  if (!subject) return;

  subject.simulationExamGrade = clamp(toNumber(event.target.value, 4), 1, 7);
  render();
});

document.addEventListener("toggle", (event) => {
  if (event.target.matches("details")) requestAnimationFrame(drawAllCharts);
}, true);

window.addEventListener("resize", () => requestAnimationFrame(drawAllCharts));

render();
