// utils/trainingQualityReport.js — canonical P6 report fetch/cache + compact legacy UI renderer
import { request } from '../apiTransport.js';

const SCHEMA_ID = 'lulynx.training_quality_report';
const reportCache = new Map();
const pendingRequests = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function unwrapReport(payload) {
  const value = payload?.status === 'success' && payload?.data ? payload.data : payload;
  if (!value || typeof value !== 'object') throw new Error('质量报告响应为空');
  if (value.schema_id !== SCHEMA_ID || Number(value.schema_version) !== 1) {
    throw new Error('质量报告 schema 不受支持');
  }
  return value;
}

/** Only explicit run_id fields are canonical. task_id/id are intentionally excluded. */
export function getCanonicalRunId(task) {
  const candidates = [
    task?.run_id,
    task?.canonical_run_id,
    task?.metadata?.run_id,
    task?.metadata?.canonical_run_id,
    task?.training?.run_id,
  ];
  for (const candidate of candidates) {
    const runId = String(candidate || '').trim();
    if (runId) return runId;
  }
  return '';
}

export function loadTrainingQualityReport(runId) {
  const normalized = String(runId || '').trim();
  if (!normalized) return Promise.reject(new Error('缺少 canonical run_id'));
  if (reportCache.has(normalized)) return Promise.resolve(reportCache.get(normalized));
  if (pendingRequests.has(normalized)) return pendingRequests.get(normalized);

  const pending = request(`/train/runs/${encodeURIComponent(normalized)}/quality-report`)
    .then(unwrapReport)
    .then((report) => {
      reportCache.set(normalized, report);
      return report;
    })
    .finally(() => pendingRequests.delete(normalized));
  pendingRequests.set(normalized, pending);
  return pending;
}

function numberText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const abs = Math.abs(number);
  if (abs > 0 && (abs < 0.001 || abs >= 10000)) return number.toExponential(3);
  return number.toFixed(4).replace(/\.?0+$/, '');
}

function badge(text, tone = 'muted') {
  const colors = {
    ok: 'var(--success)', warn: 'var(--warning)', danger: 'var(--danger)', muted: 'var(--text-muted)',
  };
  return `<span style="display:inline-flex;align-items:center;padding:2px 6px;border:1px solid ${colors[tone] || colors.muted};border-radius:4px;color:${colors[tone] || colors.muted};font:600 0.64rem var(--font-mono,monospace);">${escapeHtml(String(text || 'unknown').toUpperCase())}</span>`;
}

function statusTone(status) {
  const value = String(status || '').toLowerCase();
  if (['available', 'observed', 'decreasing', 'not_detected'].includes(value)) return 'ok';
  if (['warning', 'partial', 'increasing', 'detected'].includes(value)) return 'warn';
  if (['danger', 'failed'].includes(value)) return 'danger';
  return 'muted';
}

function metricGrid(latest) {
  const labels = {
    loss: 'Loss', validation_loss: 'Val loss', train_validation_gap: 'Train / val gap',
    train_validation_gap_ratio: 'Gap ratio', gradient_norm: 'Grad norm',
    adapter_update_norm: 'Update norm', adapter_weight_norm: 'Weight norm',
  };
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;margin-top:9px;">'
    + Object.entries(labels).map(([key, label]) => (
      '<div style="padding:7px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-hover);">'
      + `<span style="display:block;color:var(--text-muted);font-size:0.61rem;text-transform:uppercase;">${label}</span>`
      + `<b style="font:700 0.82rem var(--font-mono,monospace);">${numberText(latest[key])}</b></div>`
    )).join('')
    + '</div>';
}

function trendRows(trends) {
  const labels = { loss: 'Loss', validation_loss: 'Val loss', train_validation_gap: 'Gap' };
  return Object.entries(labels).map(([key, label]) => {
    const trend = asObject(trends[key]);
    const direction = trend.direction || trend.status || 'unavailable';
    return '<div style="display:grid;grid-template-columns:62px auto 1fr;align-items:center;gap:7px;font-size:0.68rem;">'
      + `<span style="color:var(--text-muted);">${label}</span>${badge(direction, statusTone(direction))}`
      + `<span style="text-align:right;font-family:var(--font-mono,monospace);">${numberText(trend.start)} → ${numberText(trend.end)}</span></div>`;
  }).join('');
}

function renderQuality(report, runId) {
  const latest = asObject(report.latest);
  const trends = asObject(report.trends);
  const health = asObject(report.health);
  const coverage = asObject(report.coverage);
  const regions = asObject(report.regions);
  const visual = asObject(report.visual_evaluation);
  const alerts = Array.isArray(health.alerts) ? health.alerts : [];
  const limitations = Array.isArray(report.limitations) ? report.limitations : [];
  const coverageText = Object.entries(coverage)
    .map(([key, available]) => `<span style="color:${available ? 'var(--success)' : 'var(--text-muted)'};">${escapeHtml(key)} ${available ? '✓' : '—'}</span>`)
    .join(' · ');

  return '<div style="border:1px solid var(--border);border-radius:5px;padding:10px;background:var(--bg-card,var(--bg-secondary));">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">'
    + `<div><b style="font-size:0.78rem;">多指标质量报告</b><span style="display:block;color:var(--text-muted);font-size:0.62rem;margin-top:2px;">后端遥测分析 · run_id ${escapeHtml(runId)}</span></div>`
    + badge(report.status, statusTone(report.status)) + '</div>'
    + metricGrid(latest)
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:8px;">'
    + `<section style="display:grid;gap:5px;padding:8px;border:1px solid var(--border);border-radius:4px;"><b style="font-size:0.68rem;">趋势</b>${trendRows(trends)}</section>`
    + '<section style="display:grid;gap:5px;padding:8px;border:1px solid var(--border);border-radius:4px;font-size:0.68rem;">'
    + `<b>健康状态 · ${badge(health.status, statusTone(health.status))}</b>`
    + `<span>梯度 ${escapeHtml(health.gradient_behavior || 'unknown')} · 权重 ${escapeHtml(health.adapter_weight_growth || 'unknown')} · NaN/Inf ${health.nan_inf_detected ? 'DETECTED' : 'NO'}</span>`
    + (alerts.length ? alerts.map((alert) => `<span style="color:var(--warning);">${escapeHtml(alert.message || alert.code)}</span>`).join('') : '<span style="color:var(--text-muted);">无健康告警</span>')
    + '</section></div>'
    + `<div style="margin-top:7px;color:var(--text-muted);font-size:0.64rem;line-height:1.5;">覆盖：${coverageText || '无'}<br>区域：${escapeHtml(regions.status || 'unavailable')} · 视觉：${escapeHtml(visual.status || 'unavailable')}</div>`
    + (limitations.length ? `<details style="margin-top:6px;color:var(--text-muted);font-size:0.64rem;"><summary>局限性 · ${limitations.length}</summary><div style="margin-top:4px;word-break:break-word;">${limitations.map(escapeHtml).join(' · ')}</div></details>` : '')
    + '</div>';
}

function renderQualityUnavailable(runId, error) {
  const noRunId = !runId;
  return '<div style="border:1px solid var(--border);border-radius:5px;padding:10px;background:var(--bg-card,var(--bg-secondary));">'
    + '<b style="font-size:0.78rem;">多指标质量报告</b>'
    + `<div style="margin-top:5px;color:var(--text-muted);font-size:0.68rem;line-height:1.5;">${noRunId
      ? '不可用：历史任务没有 canonical run_id。不会使用 task_id 猜测。'
      : `不可用：${escapeHtml(error || '报告加载失败')}`}</div></div>`;
}

export function renderTrainingSummaryWithQuality({ legacyHtml = '', report = null, runId = '', error = '' } = {}) {
  const qualityHtml = report ? renderQuality(report, runId) : renderQualityUnavailable(runId, error);
  const legacy = legacyHtml || '<span style="color:var(--text-muted);font-size:0.68rem;">旧版日志中没有可评分的 Loss 数据。</span>';
  return '<div style="display:grid;gap:9px;margin-top:7px;">'
    + qualityHtml
    + '<div style="border-top:1px dashed var(--border);padding-top:8px;">'
    + '<div style="margin-bottom:5px;"><b style="font-size:0.74rem;">旧版 Loss 摘要</b>'
    + '<span style="display:block;color:var(--text-muted);font-size:0.62rem;margin-top:2px;">仅由控制台日志 Loss 生成，与上方后端多指标质量报告不是同一结论。</span></div>'
    + legacy + '</div></div>';
}