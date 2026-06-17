export function adminSidebarView(profile, themeLabel) {
  return `
    <aside class="sidebar" aria-label="Panel de administracion">
      ${brandView("Administrador Supabase")}
      <section class="sidebar-section">
        <span class="role-pill">${escapeHtml(profile.role)}</span>
        <strong>${escapeHtml(profile.name)}</strong>
        <span class="muted">${escapeHtml(profile.email)}</span>
      </section>
      <section class="action-stack">
        <button class="ghost-button" type="button" data-action="toggle-theme">${themeLabel}</button>
        <button class="ghost-button" type="button" data-action="logout">Cerrar sesion</button>
      </section>
      <p class="storage-note">Usuarios y claves se gestionan con Supabase Auth desde funciones seguras de Vercel.</p>
    </aside>
  `;
}

export function studentSidebarView(profile, semesters, themeLabel) {
  const hasSemesters = semesters.length > 0;
  const options = hasSemesters
    ? semesters.map((semester) => `<option value="${semester.id}" ${semester.id === profile.activeSemesterId ? "selected" : ""}>${escapeHtml(semester.name)}</option>`).join("")
    : `<option value="">Sin semestres</option>`;

  return `
    <aside class="sidebar" aria-label="Panel de alumno">
      ${brandView(profile.study || "Dashboard academico")}
      <section class="sidebar-section">
        <span class="role-pill">${escapeHtml(profile.role)}</span>
        <strong>${escapeHtml(profile.name)}</strong>
        <span class="muted">${escapeHtml(profile.email)}</span>
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
        <button class="ghost-button" type="button" data-action="toggle-theme">${themeLabel}</button>
        <button class="ghost-button" type="button" data-action="export-excel">Exportar a Excel</button>
        <button class="ghost-button" type="button" data-action="logout">Cerrar sesion</button>
      </section>
      <p class="storage-note">Supabase guarda semestres, asignaturas y evaluaciones por usuario autenticado.</p>
    </aside>
  `;
}

function brandView(subtitle) {
  return `
    <div class="brand">
      <img src="../assets/logo.svg" alt="Notas U">
      <div>
        <strong>Notas U</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
