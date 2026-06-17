export function loadingView(message = "Cargando...") {
  return `
    <main class="auth-screen">
      <section class="auth-card">
        <div class="auth-brand">
          <img src="../assets/logo.svg" alt="Notas U" class="logo">
          <div>
            <strong>Notas U</strong>
            <span>${escapeHtml(message)}</span>
          </div>
        </div>
      </section>
    </main>
  `;
}

export function errorView(title, message) {
  return `
    <main class="auth-screen">
      <section class="auth-card">
        <div class="auth-brand">
          <img src="../assets/logo.svg" alt="Notas U" class="logo">
          <div>
            <strong>Notas U</strong>
            <span>Error de configuracion</span>
          </div>
        </div>
        <div>
          <p class="eyebrow">Supabase</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <p class="hint">${escapeHtml(message)}</p>
      </section>
    </main>
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
