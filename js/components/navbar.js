export function topbarView({ eyebrow, title, role, actions = "" }) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="admin-toolbar">
        ${role ? `<span class="role-pill">${escapeHtml(role)}</span>` : ""}
        ${actions}
      </div>
    </header>
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
