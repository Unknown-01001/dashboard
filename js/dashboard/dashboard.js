import { DEFAULTS, ROLES, THEME_KEY } from "../../config/constants.js";
import { ROUTES } from "../../config/routes.js";
import { adminRequest, logout } from "../services/authService.js";
import {
  clearSemester,
  createEvaluation,
  createSemester,
  createSubject,
  deleteEvaluation,
  deleteSubject as deleteSubjectRow,
  ensureProfile,
  loadProfiles,
  loadStudentData,
  updateEvaluation,
  updateProfile,
  updateSubject
} from "../services/database.js";
import { showToast } from "../components/toast.js";
import { loadingView, errorView } from "../components/loading.js";
import { confirmAction } from "../components/modal.js";
import { topbarView } from "../components/navbar.js";
import { adminSidebarView, studentSidebarView } from "../components/sidebar.js";
import { getAuthenticatedContext } from "../auth/session.js";
import {
  average,
  clamp,
  escapeAttribute,
  escapeHtml,
  formatGrade,
  formatMinimumExamGrade,
  formatOne,
  getSubjectCalculations,
  miniMetric,
  renderSimulator,
  renderSubjectCards,
  renderSubjectSettings,
  statusPill
} from "./subjects.js";
import {
  evaluationPatchFromInput,
  evaluationPayloadFromForm,
  renderEvaluationForm,
  renderEvaluationTable
} from "./evaluations.js";
import { drawBarChart } from "./charts.js";

const app = document.querySelector("#app");

const state = {
  theme: localStorage.getItem(THEME_KEY) || "dark",
  session: null,
  profile: null,
  profiles: [],
  semesters: [],
  simulationSaveTimer: null
};

document.body.dataset.theme = state.theme;
app.innerHTML = loadingView("Cargando dashboard...");

await boot();

async function boot() {
  try {
    const context = await getAuthenticatedContext();
    if (!context) return;

    state.session = context.session;
    state.profile = context.profile;
    await refreshData();
    render();
  } catch (error) {
    app.innerHTML = errorView("No se pudo cargar el dashboard", error.message);
  }
}

async function refreshData() {
  if (state.profile.role === ROLES.ADMIN) {
    state.profiles = await loadProfiles();
    state.semesters = [];
    return;
  }

  state.semesters = await loadStudentData(state.profile.id);
  await repairSelectionIfNeeded();
}

async function repairSelectionIfNeeded() {
  const activeSemester = getActiveSemester();
  const selectedSubject = getSelectedSubject();
  const patch = {};

  if (!state.profile.activeSemesterId && state.semesters[0]) {
    patch.active_semester_id = state.semesters[0].id;
  }

  if (state.profile.activeSemesterId && !activeSemester) {
    patch.active_semester_id = state.semesters[0]?.id || null;
    patch.selected_subject_id = null;
  }

  if (state.profile.selectedSubjectId && !selectedSubject) {
    patch.selected_subject_id = activeSemester?.subjects[0]?.id || null;
  }

  if (Object.keys(patch).length) {
    state.profile = await updateProfile(state.profile.id, patch);
  }
}

function render() {
  document.body.dataset.theme = state.theme;

  if (state.profile.role === ROLES.ADMIN) {
    app.innerHTML = renderAdminApp();
  } else {
    app.innerHTML = renderStudentApp();
  }

  requestAnimationFrame(drawCharts);
}

function renderAdminApp() {
  const stats = {
    total: state.profiles.length,
    students: state.profiles.filter((profile) => profile.role === ROLES.STUDENT).length,
    admins: state.profiles.filter((profile) => profile.role === ROLES.ADMIN).length
  };

  return `
    <div class="app-shell">
      ${adminSidebarView(state.profile, themeButtonText())}
      <main class="workspace">
        ${topbarView({ eyebrow: "Administracion", title: "Gestion de usuarios", role: state.profile.role })}
        <section class="summary-grid">
          ${metricCard("Usuarios", stats.total, "Cuentas en Supabase")}
          ${metricCard("Alumnos", stats.students, "Dashboards personales")}
          ${metricCard("Administradores", stats.admins, "Gestion de usuarios")}
          ${metricCard("Sesion", state.profile.name, "Usuario actual")}
        </section>
        <section class="admin-grid">
          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Nuevo usuario</p>
                <h2>Crear cuenta Auth</h2>
              </div>
            </div>
            ${renderCreateUserForm()}
          </div>
          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Claves</p>
                <h2>Ayuda futura</h2>
              </div>
            </div>
            <p class="hint">Las claves se actualizan con una funcion segura de Vercel. Nunca se expone la service role key en el navegador.</p>
          </div>
        </section>
        <section class="admin-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Usuarios</p>
              <h2>Lista de perfiles</h2>
            </div>
          </div>
          ${renderUsersTable()}
        </section>
      </main>
    </div>
  `;
}

function renderCreateUserForm() {
  return `
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
        Correo
        <input name="email" type="email" required>
      </label>
      <label>
        Clave temporal
        <input name="password" type="password" minlength="6" required>
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
  `;
}

function renderUsersTable() {
  if (!state.profiles.length) return `<div class="empty-state">No hay usuarios creados.</div>`;

  const rows = state.profiles.map((profile) => {
    const isCurrent = profile.id === state.profile.id;
    return `
      <tr data-user-row="${profile.id}">
        <td><input class="table-input" name="name" value="${escapeAttribute(profile.name)}"></td>
        <td><input class="table-input" name="email" type="email" value="${escapeAttribute(profile.email)}"></td>
        <td>
          <select class="table-select" name="role">
            <option value="${ROLES.STUDENT}" ${profile.role === ROLES.STUDENT ? "selected" : ""}>Alumno</option>
            <option value="${ROLES.ADMIN}" ${profile.role === ROLES.ADMIN ? "selected" : ""}>Administrador</option>
          </select>
        </td>
        <td><input class="table-input" name="study" value="${escapeAttribute(profile.study)}" ${profile.role === ROLES.ADMIN ? "disabled" : ""}></td>
        <td><input class="table-input" name="password" type="password" placeholder="Nueva clave"></td>
        <td><button class="small-button" type="button" data-action="save-user" data-id="${profile.id}">Guardar</button></td>
        <td><button class="danger-ghost icon-button" type="button" data-action="delete-user" data-id="${profile.id}" ${isCurrent ? "disabled" : ""}>x</button></td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Estudios</th>
            <th>Nueva clave</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderStudentApp() {
  const semester = getActiveSemester();
  const clearButton = semester ? `<button class="danger-ghost" type="button" data-action="clear-semester">Limpiar semestre</button>` : "";

  return `
    <div class="app-shell">
      ${studentSidebarView(state.profile, state.semesters, themeButtonText())}
      <main class="workspace">
        ${topbarView({ eyebrow: "Dashboard alumno", title: state.profile.name, role: state.profile.role, actions: clearButton })}
        ${semester ? renderStudentDashboard(semester) : renderStudentWelcome()}
      </main>
    </div>
  `;
}

function renderStudentWelcome() {
  return `
    <section class="welcome-panel">
      <div>
        <p class="eyebrow">Inicio</p>
        <h2>Bienvenido, que estudiaras</h2>
      </div>
      ${renderProfileForm(true)}
    </section>
  `;
}

function renderStudentDashboard(semester) {
  return `
    ${renderSummary(semester)}
    <section class="panel-grid">
      <div class="tool-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Semestre</p>
            <h2>${escapeHtml(semester.name)}</h2>
          </div>
        </div>
        ${renderProfileForm(false)}
      </div>
      <div class="tool-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Asignaturas</p>
            <h2>Crear ramo</h2>
          </div>
        </div>
        ${renderSubjectForm()}
      </div>
    </section>
    <section>
      <div class="section-heading">
        <div>
          <p class="eyebrow">Vista general</p>
          <h2>Ramos del semestre</h2>
        </div>
      </div>
      <div class="subject-cards">${renderSubjectCards(semester, state.profile.selectedSubjectId)}</div>
    </section>
    ${renderSubjectDetail()}
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

function renderProfileForm(showSemesterInput) {
  return `
    <form id="studentProfileForm" class="profile-form">
      <label>
        Nombre
        <input name="name" type="text" value="${escapeAttribute(state.profile.name)}">
      </label>
      <label>
        Area o carrera
        <input name="study" type="text" value="${escapeAttribute(state.profile.study)}" placeholder="Ej: Ingenieria Informatica">
      </label>
      ${showSemesterInput ? `
        <label>
          Semestre que estas cursando
          <input name="semesterName" type="text" placeholder="Ej: Semestre 1 2026">
        </label>
      ` : ""}
      <button class="primary-button" type="submit">${showSemesterInput ? "Guardar y crear semestre" : "Actualizar perfil"}</button>
    </form>
  `;
}

function renderSubjectForm() {
  return `
    <form id="subjectForm" class="subject-form">
      <label>
        Nombre de la asignatura
        <input name="subjectName" type="text" placeholder="Ej: Calculo I" required>
      </label>
      <div class="form-grid">
        ${numberField("Presentacion %", "presentationPercent", DEFAULTS.presentationPercent, 0, 100, 1)}
        ${numberField("Examen %", "examPercent", DEFAULTS.examPercent, 0, 100, 1)}
        ${numberField("Nota aprobacion", "approvalGrade", DEFAULTS.approvalGrade, 1, 7, 0.1)}
      </div>
      <button class="primary-button" type="submit">Crear asignatura</button>
    </form>
  `;
}

function renderSummary(semester) {
  const calculations = semester.subjects.map((subject) => getSubjectCalculations(subject));
  const averagePresentation = average(calculations.map((item) => item.presentationGrade));
  const averageFinal = average(calculations.map((item) => item.finalGrade));
  const approved = calculations.filter((item) => ["Aprobado", "Eximido"].includes(item.status.label)).length;

  return `
    <section class="summary-grid" aria-label="Resumen del semestre">
      ${metricCard("Asignaturas", semester.subjects.length, "Ramos creados")}
      ${metricCard("Presentacion promedio", formatGrade(averagePresentation), "Suma ponderada actual")}
      ${metricCard("Final proyectado", formatGrade(averageFinal), "Con examen guardado o simulado")}
      ${metricCard("Aprobados", approved, "Incluye ramos eximidos")}
    </section>
  `;
}

function renderSubjectDetail() {
  const subject = getSelectedSubject();
  if (!subject) {
    return `<section class="empty-state">Selecciona una asignatura para editar evaluaciones, eximicion y simulacion de examen.</section>`;
  }

  const calculations = getSubjectCalculations(subject);
  return `
    <section class="detail-area">
      <div class="detail-card">
        <div class="section-heading">
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
          ${renderSubjectSettings(subject)}
        </div>
        <div class="detail-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Simulador</p>
              <h2>Probar examen</h2>
            </div>
          </div>
          ${renderSimulator(subject)}
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
          ${renderEvaluationForm(subject.id)}
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

function getActiveSemester() {
  return state.semesters.find((semester) => semester.id === state.profile.activeSemesterId) || state.semesters[0] || null;
}

function getSelectedSubject() {
  const semester = getActiveSemester();
  if (!semester) return null;
  return semester.subjects.find((subject) => subject.id === state.profile.selectedSubjectId) || null;
}

function getSubjectById(subjectId) {
  for (const semester of state.semesters) {
    const subject = semester.subjects.find((item) => item.id === subjectId);
    if (subject) return subject;
  }
  return null;
}

function getEvaluationById(subjectId, evaluationId) {
  return getSubjectById(subjectId)?.evaluations.find((evaluation) => evaluation.id === evaluationId) || null;
}

async function reloadAndRender() {
  await refreshData();
  render();
}

async function handleCreateUser(form) {
  const formData = new FormData(form);
  await adminRequest("POST", {
    email: String(formData.get("email")).trim(),
    password: String(formData.get("password")),
    full_name: String(formData.get("name")).trim(),
    role: formData.get("role") === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT,
    study: String(formData.get("study") || "").trim(),
    semester_name: String(formData.get("semesterName") || "").trim()
  });
  await reloadAndRender();
  showToast("Usuario creado en Supabase Auth.");
}

async function handleSaveUser(id) {
  const row = document.querySelector(`[data-user-row="${id}"]`);
  if (!row) return;
  await adminRequest("PATCH", {
    id,
    email: row.querySelector('[name="email"]').value.trim(),
    full_name: row.querySelector('[name="name"]').value.trim(),
    role: row.querySelector('[name="role"]').value,
    study: row.querySelector('[name="study"]').value.trim(),
    password: row.querySelector('[name="password"]').value
  });
  await reloadAndRender();
  showToast("Usuario actualizado.");
}

async function handleDeleteUser(id) {
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) return;
  if (profile.id === state.profile.id) return showToast("No puedes eliminar tu propia sesion.");
  if (!(await confirmAction(`Eliminar usuario "${profile.name}"?`))) return;
  await adminRequest("DELETE", { id });
  await reloadAndRender();
  showToast("Usuario eliminado.");
}

async function handleProfileSubmit(form) {
  const formData = new FormData(form);
  state.profile = await updateProfile(state.profile.id, {
    full_name: String(formData.get("name") || state.profile.name).trim(),
    study: String(formData.get("study") || "").trim()
  });

  const semesterName = String(formData.get("semesterName") || "").trim();
  if (semesterName) {
    const semester = await createSemester(state.profile.id, semesterName);
    state.profile = await updateProfile(state.profile.id, {
      active_semester_id: semester.id,
      selected_subject_id: null
    });
    showToast("Perfil y semestre guardados.");
  } else {
    showToast("Perfil actualizado.");
  }
  await reloadAndRender();
}

async function handleSemesterSubmit(form) {
  const name = String(new FormData(form).get("semesterName") || "").trim();
  if (!name) return showToast("Escribe el nombre del semestre.");
  const semester = await createSemester(state.profile.id, name);
  state.profile = await updateProfile(state.profile.id, {
    active_semester_id: semester.id,
    selected_subject_id: null
  });
  await reloadAndRender();
  showToast("Semestre creado.");
}

async function handleSubjectSubmit(form) {
  const semester = getActiveSemester();
  if (!semester) return showToast("Primero crea un semestre.");
  const formData = new FormData(form);
  const name = String(formData.get("subjectName") || "").trim();
  if (!name) return showToast("Escribe el nombre de la asignatura.");

  const subject = await createSubject(state.profile.id, semester.id, {
    name,
    presentationPercent: clamp(Number(formData.get("presentationPercent") || DEFAULTS.presentationPercent), 0, 100),
    examPercent: clamp(Number(formData.get("examPercent") || DEFAULTS.examPercent), 0, 100),
    approvalGrade: clamp(Number(formData.get("approvalGrade") || DEFAULTS.approvalGrade), 1, 7)
  });

  state.profile = await updateProfile(state.profile.id, { selected_subject_id: subject.id });
  await reloadAndRender();
  showToast("Asignatura creada.");
}

async function handleSettingsSubmit(form) {
  const subject = getSubjectById(form.dataset.id);
  if (!subject) return;
  const formData = new FormData(form);
  const rawExamGrade = formData.get("examGrade");

  await updateSubject(state.profile.id, subject.id, {
    name: String(formData.get("name")).trim() || subject.name,
    presentation_percent: clamp(Number(formData.get("presentationPercent") || DEFAULTS.presentationPercent), 0, 100),
    exam_percent: clamp(Number(formData.get("examPercent") || DEFAULTS.examPercent), 0, 100),
    approval_grade: clamp(Number(formData.get("approvalGrade") || DEFAULTS.approvalGrade), 1, 7),
    exemption_enabled: formData.get("exemptionEnabled") === "on",
    exemption_grade: clamp(Number(formData.get("exemptionGrade") || DEFAULTS.exemptionGrade), 1, 7),
    exam_grade: rawExamGrade === "" ? null : clamp(Number(rawExamGrade || 1), 1, 7)
  });
  await reloadAndRender();
  showToast("Reglas actualizadas.");
}

async function handleEvaluationSubmit(form) {
  const subject = getSubjectById(form.dataset.id);
  if (!subject) return;
  await createEvaluation(state.profile.id, subject.id, evaluationPayloadFromForm(form, subject));
  await reloadAndRender();
  showToast("Evaluacion agregada.");
}

async function handleEvaluationInput(input) {
  const evaluation = getEvaluationById(input.dataset.subjectId, input.dataset.id);
  const subject = getSubjectById(input.dataset.subjectId);
  if (!evaluation || !subject) return;
  await updateEvaluation(state.profile.id, evaluation.id, evaluationPatchFromInput(input, subject));
  await reloadAndRender();
  showToast("Detalle ponderado actualizado.");
}

async function handleDeleteSubject(id) {
  const subject = getSubjectById(id);
  if (!subject) return;
  if (!(await confirmAction(`Eliminar "${subject.name}" y todas sus evaluaciones?`))) return;
  await deleteSubjectRow(state.profile.id, id);
  state.profile = await updateProfile(state.profile.id, { selected_subject_id: null });
  await reloadAndRender();
  showToast("Asignatura eliminada.");
}

async function handleDeleteEvaluation(subjectId, evaluationId) {
  if (!getSubjectById(subjectId)) return;
  await deleteEvaluation(state.profile.id, evaluationId);
  await reloadAndRender();
  showToast("Evaluacion eliminada.");
}

async function handleClearSemester() {
  const semester = getActiveSemester();
  if (!semester) return;
  if (!(await confirmAction(`Limpiar todas las asignaturas de "${semester.name}"?`))) return;
  await clearSemester(state.profile.id, semester.id);
  state.profile = await updateProfile(state.profile.id, { selected_subject_id: null });
  await reloadAndRender();
  showToast("Semestre limpiado.");
}

async function setActiveSemester(semesterId) {
  const semester = state.semesters.find((item) => item.id === semesterId);
  state.profile = await updateProfile(state.profile.id, {
    active_semester_id: semester?.id || null,
    selected_subject_id: semester?.subjects[0]?.id || null
  });
  await reloadAndRender();
}

async function selectSubject(subjectId) {
  state.profile = await updateProfile(state.profile.id, { selected_subject_id: subjectId });
  await reloadAndRender();
}

function handleSimulationInput(input) {
  const subject = getSubjectById(input.dataset.id);
  if (!subject) return;
  subject.simulationExamGrade = clamp(Number(input.value || DEFAULTS.simulationExamGrade), 1, 7);
  render();

  clearTimeout(state.simulationSaveTimer);
  state.simulationSaveTimer = setTimeout(async () => {
    try {
      await updateSubject(state.profile.id, subject.id, { simulation_exam_grade: subject.simulationExamGrade });
      await refreshData();
    } catch (error) {
      showToast(error.message);
    }
  }, 350);
}

function exportExcel() {
  const rows = [[
    "Alumno", "Correo", "Que estudia", "Semestre", "Asignatura", "Presentacion %",
    "Examen %", "Nota aprobacion", "Eximicion activa", "Nota eximicion",
    "Nota presentacion", "Examen necesario", "Nota examen guardada",
    "Nota final proyectada", "Estado", "Evaluacion", "Tipo", "Ponderacion %",
    "Nota", "Resultado"
  ]];

  state.semesters.forEach((semester) => {
    semester.subjects.forEach((subject) => {
      const calculations = getSubjectCalculations(subject);
      if (!subject.evaluations.length) {
        rows.push(exportRow(semester, subject, calculations));
      } else {
        subject.evaluations.forEach((evaluation) => {
          const result = Number(evaluation.grade || 0) * (Number(evaluation.weight || 0) / 100);
          rows.push(exportRow(semester, subject, calculations, evaluation, result));
        });
      }
    });
  });

  const html = `<html><head><meta charset="UTF-8"></head><body><table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  downloadFile(`notas-${slugify(state.profile.name)}-${new Date().toISOString().slice(0, 10)}.xls`, html, "application/vnd.ms-excel");
  showToast("Archivo compatible con Excel exportado.");
}

function exportRow(semester, subject, calculations, evaluation = null, result = "") {
  return [
    state.profile.name,
    state.profile.email,
    state.profile.study,
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

function drawCharts() {
  const semester = getActiveSemester();
  const subject = getSelectedSubject();
  const semesterCanvas = document.querySelector("#semesterChart");
  const subjectCanvas = document.querySelector("#subjectChart");

  if (semesterCanvas && semester) {
    drawBarChart(
      semesterCanvas,
      semester.subjects.map((item) => ({
        label: item.name,
        value: getSubjectCalculations(item).finalGrade
      })),
      "Final proyectada",
      7
    );
  }

  if (subjectCanvas && subject) {
    drawBarChart(
      subjectCanvas,
      subject.evaluations.map((evaluation) => ({
        label: evaluation.name,
        value: Number(evaluation.grade || 0) * (Number(evaluation.weight || 0) / 100)
      })),
      "Aporte a presentacion",
      7
    );
  }
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

function numberField(label, name, value, min, max, step) {
  return `<label>${escapeHtml(label)}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttribute(value)}"></label>`;
}

function themeButtonText() {
  return state.theme === "dark" ? "Modo claro" : "Modo oscuro";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, state.theme);
  render();
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

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "alumno";
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === "createUserForm") await handleCreateUser(event.target);
    if (event.target.id === "studentProfileForm") await handleProfileSubmit(event.target);
    if (event.target.id === "semesterForm") await handleSemesterSubmit(event.target);
    if (event.target.id === "subjectForm") await handleSubjectSubmit(event.target);
    if (event.target.id === "settingsForm") await handleSettingsSubmit(event.target);
    if (event.target.id === "evaluationForm") await handleEvaluationSubmit(event.target);
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id, subjectId } = button.dataset;

  try {
    if (action === "toggle-theme") toggleTheme();
    if (action === "logout") {
      await logout();
      window.location.href = ROUTES.login;
    }
    if (action === "export-excel") exportExcel();
    if (action === "clear-semester") await handleClearSemester();
    if (action === "save-user") await handleSaveUser(id);
    if (action === "delete-user") await handleDeleteUser(id);
    if (action === "select-subject") await selectSubject(id);
    if (action === "delete-subject") await handleDeleteSubject(id);
    if (action === "delete-evaluation") await handleDeleteEvaluation(subjectId, id);
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("change", async (event) => {
  try {
    if (event.target.id === "semesterSelect") await setActiveSemester(event.target.value);
    if (event.target.matches("[data-evaluation-field]")) await handleEvaluationInput(event.target);
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "examSimulator") handleSimulationInput(event.target);
});

document.addEventListener("toggle", (event) => {
  if (event.target.matches("details")) requestAnimationFrame(drawCharts);
}, true);

window.addEventListener("resize", () => requestAnimationFrame(drawCharts));
