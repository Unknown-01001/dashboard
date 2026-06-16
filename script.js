const THEME_KEY = "notasUniversitariasTheme";
const ROLES = {
  STUDENT: "Alumno",
  ADMIN: "Administrador"
};

const TABLES = {
  PROFILES: "profiles",
  SEMESTERS: "semestres",
  SUBJECTS: "asignaturas",
  EVALUATIONS: "evaluaciones"
};

const PLACEHOLDER_CONFIG = {
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabaseAnonKey: "TU_SUPABASE_ANON_KEY"
};

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const toast = $("#toast");

let supabaseClient = null;
let authSubscription = null;

const state = {
  theme: localStorage.getItem(THEME_KEY) || "dark",
  loading: true,
  configError: "",
  session: null,
  authUser: null,
  profile: null,
  profiles: [],
  semestres: []
};

init();

async function init() {
  document.body.dataset.theme = state.theme;
  renderLoading("Conectando con Supabase...");

  try {
    const config = await loadSupabaseConfig();
    if (!window.supabase?.createClient) {
      throw new Error("No se pudo cargar la libreria @supabase/supabase-js.");
    }

    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    state.session = data.session;
    state.authUser = data.session?.user || null;

    if (state.authUser) await loadAppData();
    state.loading = false;
    render();

    const { data: listener } = supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      state.authUser = session?.user || null;

      if (state.authUser) {
        await loadAppData();
      } else {
        state.profile = null;
        state.profiles = [];
        state.semestres = [];
      }

      state.loading = false;
      render();
    });

    authSubscription = listener.subscription;
  } catch (error) {
    console.error(error);
    state.loading = false;
    state.configError = error.message;
    render();
  }
}

async function loadSupabaseConfig() {
  const browserConfig = window.SUPABASE_CONFIG || {};
  if (isValidConfig(browserConfig)) return browserConfig;

  if (location.protocol.startsWith("http")) {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const apiConfig = await response.json();
        if (isValidConfig(apiConfig)) return apiConfig;
      }
    } catch (error) {
      console.warn("No se pudo leer /api/config:", error);
    }
  }

  if (isValidConfig(PLACEHOLDER_CONFIG)) return PLACEHOLDER_CONFIG;
  throw new Error("Falta configurar Supabase. Edita supabase-config.js o define SUPABASE_URL y SUPABASE_ANON_KEY en Vercel.");
}

function isValidConfig(config) {
  return Boolean(
    config?.supabaseUrl &&
    config?.supabaseAnonKey &&
    !config.supabaseUrl.includes("TU-PROYECTO") &&
    !config.supabaseAnonKey.includes("TU_SUPABASE")
  );
}

async function loadAppData() {
  state.profile = await ensureProfile();

  if (state.profile.role === ROLES.ADMIN) {
    await loadAdminData();
    state.semestres = [];
    return;
  }

  await loadStudentData();
}

async function ensureProfile() {
  const { data, error } = await supabaseClient
    .from(TABLES.PROFILES)
    .select("*")
    .eq("id", state.authUser.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return mapProfile(data);

  const fallbackName = state.authUser.user_metadata?.full_name || state.authUser.email?.split("@")[0] || "Alumno";
  const payload = {
    id: state.authUser.id,
    email: state.authUser.email,
    full_name: fallbackName,
    role: ROLES.STUDENT,
    study: "",
    active_semester_id: null,
    selected_subject_id: null
  };

  const { data: inserted, error: insertError } = await supabaseClient
    .from(TABLES.PROFILES)
    .insert(payload)
    .select()
    .single();

  if (insertError) throw insertError;
  return mapProfile(inserted);
}

async function loadAdminData() {
  const { data, error } = await supabaseClient
    .from(TABLES.PROFILES)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  state.profiles = (data || []).map(mapProfile);
}

async function loadStudentData() {
  const [semestersResult, subjectsResult, evaluationsResult] = await Promise.all([
    supabaseClient
      .from(TABLES.SEMESTERS)
      .select("*")
      .eq("user_id", state.authUser.id)
      .order("created_at", { ascending: true }),

    supabaseClient
      .from(TABLES.SUBJECTS)
      .select("*")
      .eq("user_id", state.authUser.id)
      .order("created_at", { ascending: true }),

    supabaseClient
      .from(TABLES.EVALUATIONS)
      .select("*")
      .eq("user_id", state.authUser.id)
      .order("created_at", { ascending: true })
  ]);

  if (semestersResult.error) throw semestersResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (evaluationsResult.error) throw evaluationsResult.error;

  const evaluations = (evaluationsResult.data || []).map(mapEvaluation);
  const subjects = (subjectsResult.data || []).map((subject) => ({
    ...mapSubject(subject),
    evaluations: evaluations.filter((evaluation) => evaluation.subjectId === subject.id)
  }));

  state.semestres = (semestersResult.data || []).map((semester) => ({
    ...mapSemester(semester),
    subjects: subjects.filter((subject) => subject.semesterId === semester.id)
  }));

  const activeSemester = getActiveSemester();
  const selectedSubject = getSelectedSubject();
  const patch = {};

  if (!state.profile.activeSemesterId && state.semestres[0]) {
    patch.active_semester_id = state.semestres[0].id;
  }

  if (state.profile.activeSemesterId && !activeSemester) {
    patch.active_semester_id = state.semestres[0]?.id || null;
    patch.selected_subject_id = null;
  }

  if (state.profile.selectedSubjectId && !selectedSubject) {
    patch.selected_subject_id = activeSemester?.subjects[0]?.id || null;
  }

  if (Object.keys(patch).length) {
    await updateProfile(patch, { reload: false });
    state.profile = {
      ...state.profile,
      activeSemesterId: patch.active_semester_id ?? state.profile.activeSemesterId,
      selectedSubjectId: patch.selected_subject_id ?? state.profile.selectedSubjectId
    };
  }
}

function mapProfile(row) {
  return {
    id: row.id,
    email: row.email || "",
    name: row.full_name || row.email || "Usuario",
    role: row.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT,
    study: row.study || "",
    activeSemesterId: row.active_semester_id || null,
    selectedSubjectId: row.selected_subject_id || null,
    createdAt: row.created_at || null
  };
}

function mapSemester(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name || "Semestre sin nombre",
    subjects: []
  };
}

function mapSubject(row) {
  return {
    id: row.id,
    userId: row.user_id,
    semesterId: row.semester_id,
    name: row.name || "Asignatura sin nombre",
    presentationPercent: toNumber(row.presentation_percent, 60),
    examPercent: toNumber(row.exam_percent, 40),
    approvalGrade: toNumber(row.approval_grade, 4),
    exemptionEnabled: Boolean(row.exemption_enabled),
    exemptionGrade: toNumber(row.exemption_grade, 5.5),
    examGrade: row.exam_grade === null || row.exam_grade === undefined ? null : toNumber(row.exam_grade, null),
    simulationExamGrade: toNumber(row.simulation_exam_grade, 4),
    evaluations: []
  };
}

function mapEvaluation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    name: row.name || "Evaluacion",
    type: row.type || "Teorico",
    weight: toNumber(row.weight, 0),
    grade: toNumber(row.grade, 1)
  };
}

function getCurrentUser() {
  return state.profile;
}

function getStudent() {
  return state.profile?.role === ROLES.STUDENT ? state.profile : null;
}

function getActiveSemester() {
  const student = getStudent();
  if (!student) return null;
  return state.semestres.find((semester) => semester.id === student.activeSemesterId) || state.semestres[0] || null;
}

function getSelectedSubject() {
  const student = getStudent();
  const semester = getActiveSemester();
  if (!student || !semester) return null;
  return semester.subjects.find((subject) => subject.id === student.selectedSubjectId) || null;
}

function getSubjectById(subjectId) {
  for (const semester of state.semestres) {
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

  if (state.loading) {
    renderLoading("Cargando...");
    return;
  }

  if (state.configError) {
    renderConfigError();
    return;
  }

  const currentUser = getCurrentUser();
  if (!state.session || !currentUser) {
    renderAuth();
  } else if (currentUser.role === ROLES.ADMIN) {
    renderAdminApp(currentUser);
  } else {
    renderStudentApp(currentUser);
  }

  requestAnimationFrame(drawAllCharts);
}

function renderLoading(message) {
  app.innerHTML = `
    <main class="access-screen">
      <section class="access-card">
        <div class="brand">
          <span class="brand-mark">N</span>
          <div>
            <strong>Notas U</strong>
            <span>${escapeHtml(message)}</span>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderConfigError() {
  app.innerHTML = `
    <main class="access-screen">
      <section class="access-card">
        <div class="access-actions">
          <div class="brand">
            <span class="brand-mark">N</span>
            <div>
              <strong>Notas U</strong>
              <span>Configuracion requerida</span>
            </div>
          </div>
          <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        </div>
        <div>
          <p class="eyebrow">Supabase</p>
          <h1>No se pudo iniciar la conexion</h1>
        </div>
        <p class="hint">${escapeHtml(state.configError)}</p>
        <p class="hint">Para desarrollo local edita <strong>supabase-config.js</strong>. Para Vercel define <strong>SUPABASE_URL</strong>, <strong>SUPABASE_ANON_KEY</strong> y <strong>SUPABASE_SERVICE_ROLE_KEY</strong>.</p>
      </section>
    </main>
  `;
}

function renderAuth() {
  app.innerHTML = `
    <main class="access-screen">
      <section class="access-card">
        <div class="access-actions">
          <div class="brand">
            <span class="brand-mark">N</span>
            <div>
              <strong>Notas U</strong>
              <span>Supabase Auth</span>
            </div>
          </div>
          <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        </div>

        <div>
          <p class="eyebrow">Acceso</p>
          <h1>Ingresa con tu cuenta</h1>
        </div>

        <div class="setup-grid">
          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Sesion</p>
                <h2>Iniciar sesion</h2>
              </div>
            </div>
            <form id="loginForm" class="login-form">
              <label>
                Correo
                <input name="email" type="email" autocomplete="email" required>
              </label>
              <label>
                Clave
                <input name="password" type="password" autocomplete="current-password" required>
              </label>
              <button class="primary-button" type="submit">Entrar</button>
            </form>
          </div>

          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Alumno</p>
                <h2>Crear cuenta</h2>
              </div>
            </div>
            <form id="signupForm" class="setup-form">
              <label>
                Nombre
                <input name="name" type="text" autocomplete="name" required>
              </label>
              <label>
                Correo
                <input name="email" type="email" autocomplete="email" required>
              </label>
              <label>
                Clave
                <input name="password" type="password" autocomplete="new-password" minlength="6" required>
              </label>
              <label>
                Que estudiaras
                <input name="study" type="text" placeholder="Ej: Ingenieria Informatica">
              </label>
              <button class="primary-button" type="submit">Crear cuenta de alumno</button>
            </form>
            <p class="hint">Las cuentas de administrador se crean desde el panel administrador o marcando tu perfil como Administrador en Supabase.</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderAdminApp(admin) {
  const userStats = {
    total: state.profiles.length,
    students: state.profiles.filter((user) => user.role === ROLES.STUDENT).length,
    admins: state.profiles.filter((user) => user.role === ROLES.ADMIN).length
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
          ${metricCard("Usuarios", userStats.total, "Cuentas en Supabase")}
          ${metricCard("Alumnos", userStats.students, "Dashboards personales")}
          ${metricCard("Administradores", userStats.admins, "Gestion de usuarios")}
          ${metricCard("Sesion", admin.name, "Usuario actual")}
        </section>

        <section class="admin-grid">
          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Nuevo usuario</p>
                <h2>Crear cuenta Auth</h2>
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
          </div>

          <div class="admin-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Claves</p>
                <h2>Ayuda futura</h2>
              </div>
            </div>
            <p class="hint">El administrador puede cambiar claves con una ruta segura de Vercel que usa la service role key solo en servidor.</p>
          </div>
        </section>

        <section class="admin-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Usuarios</p>
              <h2>Lista de perfiles</h2>
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
          <span>Administrador Supabase</span>
        </div>
      </div>

      <section class="sidebar-section">
        <span class="role-pill">${admin.role}</span>
        <strong>${escapeHtml(admin.name)}</strong>
        <span class="muted">${escapeHtml(admin.email)}</span>
      </section>

      <section class="action-stack">
        <button class="ghost-button" type="button" data-action="toggle-theme">${themeButtonText()}</button>
        <button class="ghost-button" type="button" data-action="logout">Cerrar sesion</button>
      </section>

      <p class="storage-note">Panel limitado a usuarios y claves. Las notas se guardan por alumno en Supabase Database.</p>
    </aside>
  `;
}

function renderUsersTable(admin) {
  if (!state.profiles.length) {
    return `<div class="empty-state">No hay usuarios creados.</div>`;
  }

  const rows = state.profiles.map((user) => {
    const isCurrent = user.id === admin.id;
    return `
      <tr data-user-row="${user.id}">
        <td>
          <input class="table-input" name="name" value="${escapeAttribute(user.name)}">
        </td>
        <td>
          <input class="table-input" name="email" type="email" value="${escapeAttribute(user.email)}">
        </td>
        <td>
          <select class="table-select" name="role">
            <option value="${ROLES.STUDENT}" ${user.role === ROLES.STUDENT ? "selected" : ""}>Alumno</option>
            <option value="${ROLES.ADMIN}" ${user.role === ROLES.ADMIN ? "selected" : ""}>Administrador</option>
          </select>
        </td>
        <td>
          <input class="table-input" name="study" value="${escapeAttribute(user.study)}" ${user.role === ROLES.ADMIN ? "disabled" : ""}>
        </td>
        <td>
          <input class="table-input" name="password" type="password" placeholder="Nueva clave">
        </td>
        <td>
          <button class="small-button" type="button" data-action="save-user" data-id="${user.id}">Guardar</button>
        </td>
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

function renderStudentApp(student) {
  const semester = getActiveSemester();

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
  const hasSemesters = state.semestres.length > 0;
  const options = hasSemesters
    ? state.semestres.map((semester) => `<option value="${semester.id}" ${semester.id === student.activeSemesterId ? "selected" : ""}>${escapeHtml(semester.name)}</option>`).join("")
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
        <span class="muted">${escapeHtml(student.email)}</span>
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

      <p class="storage-note">Supabase Auth mantiene la sesion. Semestres, asignaturas y evaluaciones se guardan en Supabase Database.</p>
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
          Nombre
          <input name="name" type="text" value="${escapeAttribute(student.name)}">
        </label>
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
    ${renderSummary(semester)}

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
            Nombre
            <input name="name" type="text" value="${escapeAttribute(student.name)}">
          </label>
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
      <div class="subject-cards">${renderSubjectCards(semester)}</div>
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

function renderSummary(semester) {
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

function renderSubjectCards(semester) {
  if (!semester.subjects.length) {
    return `
      <div class="empty-state">
        Crea tu primera asignatura para comenzar a calcular presentacion, examen y nota final.
      </div>
    `;
  }

  return semester.subjects.map((subject) => {
    const calculations = getSubjectCalculations(subject);
    const selectedClass = subject.id === state.profile.selectedSubjectId ? "is-active" : "";

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

function renderSubjectDetail() {
  const subject = getSelectedSubject();

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

async function login(form) {
  const formData = new FormData(form);
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: String(formData.get("email")).trim(),
    password: String(formData.get("password"))
  });

  if (error) return showToast(error.message);
  showToast("Sesion iniciada.");
}

async function signUp(form) {
  const formData = new FormData(form);
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const name = String(formData.get("name")).trim();
  const study = String(formData.get("study") || "").trim();

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        study
      }
    }
  });

  if (error) return showToast(error.message);

  if (data.session?.user) {
    await upsertOwnProfile({
      id: data.session.user.id,
      email,
      full_name: name,
      role: ROLES.STUDENT,
      study
    });
    await loadAppData();
    render();
    showToast("Cuenta creada.");
  } else {
    showToast("Cuenta creada. Revisa tu correo si Supabase pide confirmacion.");
  }
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showToast(error.message);
}

async function upsertOwnProfile(payload) {
  const { error } = await supabaseClient
    .from(TABLES.PROFILES)
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
}

async function updateProfile(patch, options = { reload: true }) {
  const { data, error } = await supabaseClient
    .from(TABLES.PROFILES)
    .update(patch)
    .eq("id", state.authUser.id)
    .select()
    .single();

  if (error) throw error;
  state.profile = mapProfile(data);

  if (options.reload) {
    await loadAppData();
    render();
  }
}

async function adminRequest(method, payload) {
  const token = state.session?.access_token;
  if (!token) throw new Error("Sesion no valida.");

  const response = await fetch("/api/admin-users", {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload || {})
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "No se pudo completar la accion administrativa.");
  }
  return result;
}

async function addManagedUser(form) {
  const formData = new FormData(form);
  try {
    await adminRequest("POST", {
      email: String(formData.get("email")).trim(),
      password: String(formData.get("password")),
      full_name: String(formData.get("name")).trim(),
      role: formData.get("role") === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT,
      study: String(formData.get("study") || "").trim(),
      semester_name: String(formData.get("semesterName") || "").trim()
    });

    await loadAppData();
    render();
    showToast("Usuario creado en Supabase Auth.");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveManagedUser(id) {
  const row = document.querySelector(`[data-user-row="${id}"]`);
  if (!row) return;

  const payload = {
    id,
    email: row.querySelector('[name="email"]').value.trim(),
    full_name: row.querySelector('[name="name"]').value.trim(),
    role: row.querySelector('[name="role"]').value,
    study: row.querySelector('[name="study"]').value.trim(),
    password: row.querySelector('[name="password"]').value
  };

  try {
    await adminRequest("PATCH", payload);
    await loadAppData();
    render();
    showToast("Usuario actualizado.");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteUser(id) {
  const user = state.profiles.find((item) => item.id === id);
  if (!user) return;
  if (user.id === state.profile.id) return showToast("No puedes eliminar tu propia sesion.");

  const confirmed = confirm(`Eliminar usuario "${user.name}"?`);
  if (!confirmed) return;

  try {
    await adminRequest("DELETE", { id });
    await loadAppData();
    render();
    showToast("Usuario eliminado.");
  } catch (error) {
    showToast(error.message);
  }
}

async function updateStudentProfile(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || state.profile.name).trim();
  const study = String(formData.get("study") || "").trim();
  const semesterName = String(formData.get("semesterName") || "").trim();

  await updateProfile({
    full_name: name,
    study
  }, { reload: false });

  if (semesterName) {
    await addSemester(semesterName, false);
  } else {
    await loadAppData();
    render();
    showToast("Perfil actualizado.");
  }
}

async function addSemester(name, showCreatedToast = true) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) return showToast("Escribe el nombre del semestre.");

  const { data, error } = await supabaseClient
    .from(TABLES.SEMESTERS)
    .insert({
      user_id: state.authUser.id,
      name: trimmedName
    })
    .select()
    .single();

  if (error) return showToast(error.message);

  await updateProfile({
    active_semester_id: data.id,
    selected_subject_id: null
  }, { reload: false });

  await loadAppData();
  render();
  showToast(showCreatedToast ? "Semestre creado." : "Perfil y semestre guardados.");
}

async function addSubject(form) {
  const semester = getActiveSemester();
  if (!semester) return showToast("Primero crea un semestre.");

  const formData = new FormData(form);
  const name = String(formData.get("subjectName")).trim();
  if (!name) return showToast("Escribe el nombre de la asignatura.");

  const { data, error } = await supabaseClient
    .from(TABLES.SUBJECTS)
    .insert({
      user_id: state.authUser.id,
      semester_id: semester.id,
      name,
      presentation_percent: clamp(toNumber(formData.get("presentationPercent"), 60), 0, 100),
      exam_percent: clamp(toNumber(formData.get("examPercent"), 40), 0, 100),
      approval_grade: clamp(toNumber(formData.get("approvalGrade"), 4), 1, 7),
      exemption_enabled: false,
      exemption_grade: 5.5,
      exam_grade: null,
      simulation_exam_grade: 4
    })
    .select()
    .single();

  if (error) return showToast(error.message);

  await updateProfile({
    selected_subject_id: data.id
  }, { reload: false });

  await loadAppData();
  render();
  showToast("Asignatura creada.");
}

async function updateSubjectSettings(form) {
  const subject = getSubjectById(form.dataset.id);
  if (!subject) return;

  const formData = new FormData(form);
  const rawExamGrade = formData.get("examGrade");

  const { error } = await supabaseClient
    .from(TABLES.SUBJECTS)
    .update({
      name: String(formData.get("name")).trim() || subject.name,
      presentation_percent: clamp(toNumber(formData.get("presentationPercent"), 60), 0, 100),
      exam_percent: clamp(toNumber(formData.get("examPercent"), 40), 0, 100),
      approval_grade: clamp(toNumber(formData.get("approvalGrade"), 4), 1, 7),
      exemption_enabled: formData.get("exemptionEnabled") === "on",
      exemption_grade: clamp(toNumber(formData.get("exemptionGrade"), 5.5), 1, 7),
      exam_grade: rawExamGrade === "" ? null : clamp(toNumber(rawExamGrade, 1), 1, 7)
    })
    .eq("id", subject.id)
    .eq("user_id", state.authUser.id);

  if (error) return showToast(error.message);

  await loadAppData();
  render();
  showToast("Reglas actualizadas.");
}

async function addEvaluation(form) {
  const subject = getSubjectById(form.dataset.id);
  if (!subject) return;

  const formData = new FormData(form);
  const name = String(formData.get("name")).trim() || nextEvaluationName(subject);

  const { error } = await supabaseClient
    .from(TABLES.EVALUATIONS)
    .insert({
      user_id: state.authUser.id,
      subject_id: subject.id,
      name,
      type: String(formData.get("type")).trim() || "Teorico",
      weight: clamp(toNumber(formData.get("weight"), 0), 0, 100),
      grade: clamp(toNumber(formData.get("grade"), 1), 1, 7)
    });

  if (error) return showToast(error.message);

  await loadAppData();
  render();
  showToast("Evaluacion agregada.");
}

function nextEvaluationName(subject) {
  const names = new Set(subject.evaluations.map((evaluation) => evaluation.name.toLowerCase()));
  let index = 1;
  while (names.has(`certamen ${index}`)) index += 1;
  return `Certamen ${index}`;
}

async function updateEvaluationField(input) {
  const evaluation = getEvaluationById(input.dataset.subjectId, input.dataset.id);
  const subject = getSubjectById(input.dataset.subjectId);
  if (!evaluation || !subject) return;

  const field = input.dataset.evaluationField;
  const patch = {};

  if (field === "name") {
    patch.name = input.value.trim() || nextEvaluationName(subject);
  } else if (field === "type") {
    patch.type = input.value.trim() || "Teorico";
  } else if (field === "weight") {
    patch.weight = clamp(toNumber(input.value, 0), 0, 100);
  } else if (field === "grade") {
    patch.grade = clamp(toNumber(input.value, 1), 1, 7);
  }

  const { error } = await supabaseClient
    .from(TABLES.EVALUATIONS)
    .update(patch)
    .eq("id", evaluation.id)
    .eq("user_id", state.authUser.id);

  if (error) return showToast(error.message);

  await loadAppData();
  render();
  showToast("Detalle ponderado actualizado.");
}

async function deleteSubject(id) {
  const subject = getSubjectById(id);
  if (!subject) return;

  const confirmed = confirm(`Eliminar "${subject.name}" y todas sus evaluaciones?`);
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from(TABLES.SUBJECTS)
    .delete()
    .eq("id", id)
    .eq("user_id", state.authUser.id);

  if (error) return showToast(error.message);

  await updateProfile({
    selected_subject_id: null
  }, { reload: false });

  await loadAppData();
  render();
  showToast("Asignatura eliminada.");
}

async function deleteEvaluation(subjectId, evaluationId) {
  const subject = getSubjectById(subjectId);
  if (!subject) return;

  const { error } = await supabaseClient
    .from(TABLES.EVALUATIONS)
    .delete()
    .eq("id", evaluationId)
    .eq("user_id", state.authUser.id);

  if (error) return showToast(error.message);

  await loadAppData();
  render();
  showToast("Evaluacion eliminada.");
}

async function clearActiveSemester() {
  const semester = getActiveSemester();
  if (!semester) return;

  const confirmed = confirm(`Limpiar todas las asignaturas de "${semester.name}"?`);
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from(TABLES.SUBJECTS)
    .delete()
    .eq("semester_id", semester.id)
    .eq("user_id", state.authUser.id);

  if (error) return showToast(error.message);

  await updateProfile({
    selected_subject_id: null
  }, { reload: false });

  await loadAppData();
  render();
  showToast("Semestre limpiado.");
}

async function setActiveSemester(semesterId) {
  const semester = state.semestres.find((item) => item.id === semesterId) || null;
  await updateProfile({
    active_semester_id: semester?.id || null,
    selected_subject_id: semester?.subjects[0]?.id || null
  }, { reload: false });

  await loadAppData();
  render();
}

async function selectSubject(subjectId) {
  await updateProfile({
    selected_subject_id: subjectId
  }, { reload: false });

  await loadAppData();
  render();
}

async function updateSimulationGrade(input) {
  const subject = getSubjectById(input.dataset.id);
  if (!subject) return;

  const { error } = await supabaseClient
    .from(TABLES.SUBJECTS)
    .update({
      simulation_exam_grade: clamp(toNumber(input.value, 4), 1, 7)
    })
    .eq("id", subject.id)
    .eq("user_id", state.authUser.id);

  if (error) return showToast(error.message);

  await loadAppData();
  render();
}

function exportExcel() {
  const student = getStudent();
  if (!student) return showToast("La exportacion esta disponible para alumnos.");

  const rows = [
    [
      "Alumno",
      "Correo",
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

  state.semestres.forEach((semester) => {
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
    student.email,
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
  const semester = getActiveSemester();
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

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
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
  }, 3000);
}

document.addEventListener("submit", async (event) => {
  if (event.target.id === "loginForm") {
    event.preventDefault();
    await login(event.target);
    return;
  }

  if (event.target.id === "signupForm") {
    event.preventDefault();
    await signUp(event.target);
    return;
  }

  if (event.target.id === "createUserForm") {
    event.preventDefault();
    await addManagedUser(event.target);
    return;
  }

  if (event.target.id === "studentProfileForm") {
    event.preventDefault();
    await updateStudentProfile(event.target);
    return;
  }

  if (event.target.id === "semesterForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    await addSemester(formData.get("semesterName"));
    return;
  }

  if (event.target.id === "subjectForm") {
    event.preventDefault();
    await addSubject(event.target);
    return;
  }

  if (event.target.id === "settingsForm") {
    event.preventDefault();
    await updateSubjectSettings(event.target);
    return;
  }

  if (event.target.id === "evaluationForm") {
    event.preventDefault();
    await addEvaluation(event.target);
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id, subjectId } = button.dataset;

  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, state.theme);
    render();
  }

  if (action === "logout") await logout();
  if (action === "export-excel") exportExcel();
  if (action === "clear-semester") await clearActiveSemester();
  if (action === "save-user") await saveManagedUser(id);
  if (action === "delete-user") await deleteUser(id);
  if (action === "select-subject") await selectSubject(id);
  if (action === "delete-subject") await deleteSubject(id);
  if (action === "delete-evaluation") await deleteEvaluation(subjectId, id);
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "semesterSelect") {
    await setActiveSemester(event.target.value);
    return;
  }

  if (event.target.matches("[data-evaluation-field]")) {
    await updateEvaluationField(event.target);
  }
});

document.addEventListener("input", async (event) => {
  if (event.target.id !== "examSimulator") return;
  await updateSimulationGrade(event.target);
});

document.addEventListener("toggle", (event) => {
  if (event.target.matches("details")) requestAnimationFrame(drawAllCharts);
}, true);

window.addEventListener("resize", () => requestAnimationFrame(drawAllCharts));
window.addEventListener("beforeunload", () => authSubscription?.unsubscribe?.());
