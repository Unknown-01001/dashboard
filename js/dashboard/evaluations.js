import { escapeAttribute, escapeHtml, formatGrade, formatOne, getSubjectCalculations } from "./subjects.js";

export function renderEvaluationForm(subjectId) {
  return `
    <form id="evaluationForm" class="evaluation-form" data-id="${subjectId}">
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
  `;
}

export function renderEvaluationTable(subject) {
  const calculations = getSubjectCalculations(subject);

  if (!subject.evaluations.length) {
    return `<div class="empty-state">Aun no hay evaluaciones registradas para este ramo.</div>`;
  }

  const rows = subject.evaluations.map((evaluation) => {
    const result = Number(evaluation.grade || 0) * (Number(evaluation.weight || 0) / 100);
    return `
      <tr>
        <td><input class="table-input" data-evaluation-field="name" data-subject-id="${subject.id}" data-id="${evaluation.id}" value="${escapeAttribute(evaluation.name)}"></td>
        <td><input class="table-input" data-evaluation-field="type" data-subject-id="${subject.id}" data-id="${evaluation.id}" value="${escapeAttribute(evaluation.type)}"></td>
        <td><input class="table-input narrow-input" data-evaluation-field="weight" data-subject-id="${subject.id}" data-id="${evaluation.id}" type="number" min="0" max="100" step="0.1" value="${evaluation.weight}"></td>
        <td><input class="table-input narrow-input" data-evaluation-field="grade" data-subject-id="${subject.id}" data-id="${evaluation.id}" type="number" min="1" max="7" step="0.1" value="${evaluation.grade}"></td>
        <td>${formatGrade(result)}</td>
        <td><button class="danger-ghost icon-button" type="button" title="Eliminar evaluacion" data-action="delete-evaluation" data-subject-id="${subject.id}" data-id="${evaluation.id}">x</button></td>
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

export function nextEvaluationName(subject) {
  const names = new Set(subject.evaluations.map((evaluation) => evaluation.name.toLowerCase()));
  let index = 1;
  while (names.has(`certamen ${index}`)) index += 1;
  return `Certamen ${index}`;
}

export function evaluationPayloadFromForm(form, subject) {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name")).trim() || nextEvaluationName(subject),
    type: String(formData.get("type")).trim() || "Teorico",
    weight: clamp(Number(formData.get("weight") || 0), 0, 100),
    grade: clamp(Number(formData.get("grade") || 1), 1, 7)
  };
}

export function evaluationPatchFromInput(input, subject) {
  const field = input.dataset.evaluationField;
  if (field === "name") return { name: input.value.trim() || nextEvaluationName(subject) };
  if (field === "type") return { type: input.value.trim() || "Teorico" };
  if (field === "weight") return { weight: clamp(Number(input.value || 0), 0, 100) };
  if (field === "grade") return { grade: clamp(Number(input.value || 1), 1, 7) };
  return {};
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
