import { clamp, formatGrade } from "./subjects.js";

export function drawSemesterChart(canvas, semester) {
  if (!canvas || !semester) return;
  const data = semester.subjects.map((subject) => ({
    label: subject.name,
    value: subject.finalGrade ?? 0
  }));
  drawBarChart(canvas, data, "Final proyectada", 7);
}

export function drawSubjectChart(canvas, subject) {
  if (!canvas || !subject) return;
  const data = subject.evaluations.map((evaluation) => ({
    label: evaluation.name,
    value: Number(evaluation.grade || 0) * (Number(evaluation.weight || 0) / 100)
  }));
  drawBarChart(canvas, data, "Aporte a presentacion", 7);
}

export function drawBarChart(canvas, data, label, maxValue) {
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

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}
