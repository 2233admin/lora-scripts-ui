const DEFAULT_POINTS = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 0.33, y: 0.25 }),
  Object.freeze({ x: 0.66, y: 0.75 }),
  Object.freeze({ x: 1, y: 1 }),
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function defaultSemanticRegionCurve() {
  return DEFAULT_POINTS.map((point) => ({ ...point }));
}

export function normalizeSemanticRegionCurve(rawPoints) {
  const source = Array.isArray(rawPoints) && rawPoints.length === 4 ? rawPoints : DEFAULT_POINTS;
  const points = source.map((point, index) => ({
    x: clamp(finite(point?.x, DEFAULT_POINTS[index].x), 0, 1),
    y: clamp(finite(point?.y, DEFAULT_POINTS[index].y), 0, 1),
  }));
  points[0] = { x: 0, y: 0 };
  points[3] = { x: 1, y: 1 };
  points[1].x = clamp(points[1].x, 0.02, 0.96);
  points[2].x = clamp(points[2].x, points[1].x + 0.02, 0.98);
  points[1].x = Math.min(points[1].x, points[2].x - 0.02);
  points[1].y = clamp(points[1].y, 0, 1);
  points[2].y = clamp(points[2].y, points[1].y, 1);
  return points;
}

function monotoneTangents(points) {
  const slopes = [];
  const tangents = new Array(points.length).fill(0);
  for (let index = 0; index < points.length - 1; index += 1) {
    const dx = points[index + 1].x - points[index].x;
    slopes.push(dx > 0 ? (points[index + 1].y - points[index].y) / dx : 0);
  }
  tangents[0] = slopes[0];
  tangents[tangents.length - 1] = slopes[slopes.length - 1];
  for (let index = 1; index < tangents.length - 1; index += 1) {
    tangents[index] = slopes[index - 1] * slopes[index] <= 0
      ? 0
      : (slopes[index - 1] + slopes[index]) / 2;
  }
  for (let index = 0; index < slopes.length; index += 1) {
    if (slopes[index] === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = tangents[index] / slopes[index];
    const beta = tangents[index + 1] / slopes[index];
    const magnitude = Math.hypot(alpha, beta);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[index] = scale * alpha * slopes[index];
      tangents[index + 1] = scale * beta * slopes[index];
    }
  }
  return tangents;
}

const fmt = (value) => Number(value.toFixed(3));

export function buildSemanticRegionCurvePath(rawPoints, width = 720, height = 180, padding = 18) {
  const points = normalizeSemanticRegionCurve(rawPoints);
  const tangents = monotoneTangents(points);
  const sx = (x) => padding + x * (width - padding * 2);
  const sy = (y) => height - padding - y * (height - padding * 2);
  let path = `M ${fmt(sx(points[0].x))} ${fmt(sy(points[0].y))}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const dx = next.x - current.x;
    const control1 = { x: current.x + dx / 3, y: current.y + tangents[index] * dx / 3 };
    const control2 = { x: next.x - dx / 3, y: next.y - tangents[index + 1] * dx / 3 };
    path += ` C ${fmt(sx(control1.x))} ${fmt(sy(clamp(control1.y, current.y, next.y)))} ${fmt(sx(control2.x))} ${fmt(sy(clamp(control2.y, current.y, next.y)))} ${fmt(sx(next.x))} ${fmt(sy(next.y))}`;
  }
  return path;
}

function pointScreenPosition(point, width, height, padding) {
  return {
    x: padding + point.x * (width - padding * 2),
    y: height - padding - point.y * (height - padding * 2),
  };
}

function actualWeight(startWeight, endWeight, y) {
  return finite(startWeight, 1) + (finite(endWeight, 1) - finite(startWeight, 1)) * y;
}

export function renderSemanticRegionCurveEditor({ row, rowIndex, disabled = false }) {
  const width = 720;
  const height = 180;
  const padding = 18;
  const points = normalizeSemanticRegionCurve(row?.custom_curve);
  const path = buildSemanticRegionCurvePath(points, width, height, padding);
  const circles = points.map((point, pointIndex) => {
    const screen = pointScreenPosition(point, width, height, padding);
    const locked = pointIndex === 0 || pointIndex === points.length - 1;
    const handler = !locked && !disabled
      ? ` onpointerdown="beginSemanticRegionCurveDrag(${rowIndex}, ${pointIndex}, event)"`
      : '';
    return `<circle data-semantic-curve-point="${pointIndex}" cx="${fmt(screen.x)}" cy="${fmt(screen.y)}" r="${locked ? 5 : 7}" fill="${locked ? '#94a3b8' : '#38bdf8'}" stroke="#0f172a" stroke-width="2" style="cursor:${locked || disabled ? 'not-allowed' : 'grab'};touch-action:none"${handler}></circle>`;
  }).join('');
  const labels = points.map((point, pointIndex) => {
    const weight = actualWeight(row?.start_weight, row?.end_weight, point.y);
    return `<span data-semantic-curve-value="${pointIndex}">${Math.round(point.x * 100)}% / ${fmt(weight)}</span>`;
  }).join('');
  return `
    <div class="semantic-region-curve-editor" data-semantic-curve-editor="${rowIndex}" style="width:100%;box-sizing:border-box;margin-top:8px;padding:10px 12px 12px;border:1px solid rgba(56,189,248,.28);border-radius:10px;background:rgba(15,23,42,.28)">
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:12px;color:var(--text-muted,#94a3b8)"><span>训练进度 →</span><span>首尾锁定 · 中间点可拖动</span></div>
      <svg data-semantic-curve-svg="${rowIndex}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="display:block;width:100%;height:180px;touch-action:none;overflow:visible" role="img" aria-label="语义区域自定义平滑权重曲线">
        <path d="M ${padding} ${height - padding} H ${width - padding}" fill="none" stroke="rgba(148,163,184,.35)" stroke-width="1"></path>
        <path d="M ${padding} ${height - padding} V ${padding}" fill="none" stroke="rgba(148,163,184,.35)" stroke-width="1"></path>
        <path data-semantic-curve-path="${rowIndex}" d="${path}" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"></path>
        ${circles}
      </svg>
      <div data-semantic-curve-values="${rowIndex}" style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:11px;color:var(--text-muted,#94a3b8)">${labels}</div>
    </div>
  `;
}

export function refreshSemanticRegionCurveEditor(svg, rawPoints, startWeight, endWeight) {
  if (!svg) return;
  const width = 720;
  const height = 180;
  const padding = 18;
  const points = normalizeSemanticRegionCurve(rawPoints);
  svg.querySelector('[data-semantic-curve-path]')?.setAttribute('d', buildSemanticRegionCurvePath(points, width, height, padding));
  points.forEach((point, pointIndex) => {
    const screen = pointScreenPosition(point, width, height, padding);
    const circle = svg.querySelector(`[data-semantic-curve-point="${pointIndex}"]`);
    circle?.setAttribute('cx', String(fmt(screen.x)));
    circle?.setAttribute('cy', String(fmt(screen.y)));
    const value = svg.parentElement?.querySelector(`[data-semantic-curve-value="${pointIndex}"]`);
    if (value) value.textContent = `${Math.round(point.x * 100)}% / ${fmt(actualWeight(startWeight, endWeight, point.y))}`;
  });
}
