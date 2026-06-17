export function calculatePresentationGrade(subject) {
  // NotaPresentacion = sumatoria(NotaEvaluacion x PonderacionDecimal)
  return subject.evaluations.reduce((sum, evaluation) => {
    const grade = clamp(Number(evaluation.grade || 0), 1, 7);
    const decimalWeight = Number(evaluation.weight || 0) / 100;
    return sum + grade * decimalWeight;
  }, 0);
}

export function isSubjectExempt(subject, presentationGrade = calculatePresentationGrade(subject)) {
  return Boolean(subject.exemptionEnabled) && presentationGrade >= Number(subject.exemptionGrade || 5.5);
}

export function calculateFinalGrade(subject, examGrade, presentationGrade = calculatePresentationGrade(subject)) {
  // NotaFinal = (NotaPresentacion x PorcentajePresentacionDecimal)
  //           + (NotaExamen x PorcentajeExamenDecimal)
  if (isSubjectExempt(subject, presentationGrade)) return presentationGrade;

  const presentationPercent = Number(subject.presentationPercent || 60) / 100;
  const examPercent = Number(subject.examPercent || 40) / 100;
  return presentationGrade * presentationPercent + clamp(Number(examGrade || 1), 1, 7) * examPercent;
}

export function calculateMinimumExamGrade(subject, presentationGrade = calculatePresentationGrade(subject)) {
  // NotaMinimaExamen =
  // (NotaAprobacion - (NotaPresentacion x PorcentajePresentacionDecimal))
  // / PorcentajeExamenDecimal
  if (isSubjectExempt(subject, presentationGrade)) return 0;

  const approvalGrade = Number(subject.approvalGrade || 4);
  const presentationPercent = Number(subject.presentationPercent || 60) / 100;
  const examPercent = Number(subject.examPercent || 40) / 100;

  if (examPercent <= 0) {
    return presentationGrade * presentationPercent >= approvalGrade ? 1 : Infinity;
  }

  return (approvalGrade - presentationGrade * presentationPercent) / examPercent;
}

export function getSubjectCalculations(subject, overrideExamGrade = null) {
  const presentationGrade = calculatePresentationGrade(subject);
  const projectedExam = overrideExamGrade ?? subject.examGrade ?? subject.simulationExamGrade ?? 4;
  const exempt = isSubjectExempt(subject, presentationGrade);
  const finalGrade = calculateFinalGrade(subject, projectedExam, presentationGrade);
  const minimumExamGrade = calculateMinimumExamGrade(subject, presentationGrade);
  const totalWeight = subject.evaluations.reduce((sum, evaluation) => sum + Number(evaluation.weight || 0), 0);
  const status = getStatus(subject, finalGrade, minimumExamGrade, exempt);

  return {
    presentationGrade,
    projectedExam,
    finalGrade,
    minimumExamGrade,
    totalWeight,
    status,
    exempt,
    exemptionGap: Number(subject.exemptionGrade || 5.5) - presentationGrade
  };
}

export function renderSubjectCards(semester, selectedSubjectId) {
  if (!semester.subjects.length) {
    return `<div class="empty-state">Crea tu primera asignatura para comenzar a calcular presentacion, examen y nota final.</div>`;
  }

  return semester.subjects.map((subject) => {
    const calculations = getSubjectCalculations(subject);
    const selectedClass = subject.id === selectedSubjectId ? "is-active" : "";

    return `
      <article class="subject-card ${selectedClass}">
        <div class="card-title">
          <h3>${escapeHtml(subject.name)}</h3>
          ${statusPill(calculations.status)}
        </div>
        <div class="card-metrics">
          ${miniMetric("Presentacion", formatGrade(calculations.presentationGrade))}
          ${miniMetric("Examen necesario", formatMinimumExamGrade(calculations.minimumExamGrade))}
          ${miniMetric("Final proyectada", formatGrade(calculations.finalGrade))}
          ${miniMetric("Ponderacion", `${formatOne(calculations.totalWeight)}%`)}
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

export function renderSubjectSettings(subject) {
  const examGradeValue = subject.examGrade ?? "";
  return `
    <form id="settingsForm" class="settings-form" data-id="${subject.id}">
      <label>
        Nombre de la asignatura
        <input name="name" type="text" value="${escapeAttribute(subject.name)}" required>
      </label>
      <div class="form-grid">
        ${numberInput("Presentacion %", "presentationPercent", subject.presentationPercent, 0, 100, 1)}
        ${numberInput("Examen %", "examPercent", subject.examPercent, 0, 100, 1)}
        ${numberInput("Nota aprobacion", "approvalGrade", subject.approvalGrade, 1, 7, 0.1)}
      </div>
      <label class="check-row">
        <input name="exemptionEnabled" type="checkbox" ${subject.exemptionEnabled ? "checked" : ""}>
        Casilla de eximicion de examen
      </label>
      <div class="form-grid two">
        ${numberInput("Nota final para eximirse", "exemptionGrade", subject.exemptionGrade, 1, 7, 0.1)}
        ${numberInput("Nota de examen real", "examGrade", examGradeValue, 1, 7, 0.1, "Opcional")}
      </div>
      <button class="primary-button" type="submit">Guardar reglas</button>
    </form>
  `;
}

export function renderSimulator(subject) {
  const simulation = getSubjectCalculations(subject, subject.simulationExamGrade);
  return `
    <div class="simulator">
      <div class="range-row">
        <input id="examSimulator" type="range" min="1" max="7" step="0.1" value="${subject.simulationExamGrade}" data-id="${subject.id}">
        <span class="range-value">${formatOne(subject.simulationExamGrade)}</span>
      </div>
      <div class="result-strip">
        ${miniMetric("Presentacion", formatGrade(simulation.presentationGrade))}
        ${miniMetric("Examen minimo", formatMinimumExamGrade(simulation.minimumExamGrade))}
        ${miniMetric("Final simulada", formatGrade(simulation.finalGrade))}
        ${miniMetric("Eximicion", exemptionSummary(subject, simulation))}
      </div>
    </div>
  `;
}

export function statusPill(status) {
  return `<span class="status-pill ${status.className}"><span class="status-dot"></span>${escapeHtml(status.label)}</span>`;
}

export function miniMetric(label, value) {
  return `<div class="mini-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function getStatus(subject, finalGrade, minimumExamGrade, exempt) {
  if (exempt) return { label: "Eximido", className: "status-exempt" };
  if (finalGrade >= Number(subject.approvalGrade || 4)) return { label: "Aprobado", className: "status-approved" };
  if (minimumExamGrade <= 7 && minimumExamGrade >= 1) return { label: "En riesgo", className: "status-risk" };
  return { label: "Reprobando", className: "status-fail" };
}

export function formatGrade(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return roundTo(value, digits).toFixed(digits);
}

export function formatOne(value) {
  if (!Number.isFinite(value)) return "--";
  return roundTo(value, 1).toFixed(1);
}

export function formatMinimumExamGrade(value) {
  if (value === 0) return "Eximido";
  if (value === Infinity) return "Imposible";
  if (!Number.isFinite(value)) return "--";
  if (value <= 1) return "1.0";
  if (value > 7) return "Sobre 7.0";
  return formatOne(value);
}

export function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttribute(value) {
  return escapeHtml(String(value ?? ""));
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function numberInput(label, name, value, min, max, step, placeholder = "") {
  return `
    <label>
      ${escapeHtml(label)}
      <input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttribute(value)}" placeholder="${escapeAttribute(placeholder)}">
    </label>
  `;
}

function exemptionSummary(subject, calculations) {
  if (!subject.exemptionEnabled) return "No aplica";
  if (calculations.exempt) return "Cumple";
  return `Faltan ${formatOne(Math.max(calculations.exemptionGap, 0))}`;
}
