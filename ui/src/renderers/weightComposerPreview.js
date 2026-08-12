// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { escapeHtml } from '../utils/dom.js';

const COLORS = {
  timestep: '#38bdf8', noise: '#a78bfa', sample_difficulty: '#f59e0b',
  combined_raw: '#94a3b8', combined_normalized: '#22c55e',
};
const LABELS = {
  timestep: '时间步', noise: '噪声', sample_difficulty: '样本难度',
  combined_raw: '原始乘积', combined_normalized: '均值归一化',
};
let refreshTimer = 0;
let refreshSerial = 0;
let scoringTimer = 0;

function unwrap(response) {
  if (response?.status === 'error') throw new Error(response.message || '请求失败');
  return response?.data ?? response;
}

function curvePath(values, yMin, yMax) {
  const span = Math.max(yMax - yMin, 1e-6);
  return values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * 620;
    const y = 150 - (Number(value) - yMin) / span * 130;
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function renderWeightComposerPreview() {
  return `
    <div class="weight-composer-preview" data-weight-composer-preview style="grid-column:1/-1;display:grid;gap:12px;width:100%;">
      <div style="border:1px solid var(--border-color,#334155);border-radius:10px;padding:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;"><b>WeightComposer 组合预览</b><small data-wc-stats>等待计算…</small></div>
        <div data-wc-chart style="min-height:170px;"></div>
        <div data-wc-legend style="display:flex;gap:14px;flex-wrap:wrap;"></div>
        <small data-wc-warning style="display:block;color:#f59e0b;margin-top:6px;"></small>
      </div>
      <div style="border:1px solid var(--border-color,#334155);border-radius:10px;padding:12px;display:grid;gap:10px;">
        <div><b>离线质量评分 → 样本难度文件</b><br><small>质量分数与训练难度不是同一概念；默认“仅评分”不会生成训练权重。</small></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select data-wc-mapping>
            <option value="neutral">仅质量评分（推荐）</option>
            <option value="inverse">低分样本权重更高（谨慎，可能放大污染）</option>
            <option value="direct">高分样本权重更高</option>
            <option value="center">中间分样本权重更高</option>
            <option value="extremes">两端样本权重更高</option>
          </select>
          <label>最小 <input data-wc-min type="number" min="0" max="16" step="0.05" value="0.5" style="width:72px"></label>
          <label>最大 <input data-wc-max type="number" min="0.01" max="64" step="0.05" value="1.5" style="width:72px"></label>
          <label>映射强度 <input data-wc-strength type="number" min="0" max="1" step="0.05" value="1" style="width:72px"></label>
          <label><input data-wc-preview-only type="checkbox"> 只预览</label>
          <label><input data-wc-overwrite type="checkbox"> 覆盖已有文件</label>
          <button class="btn btn-outline" type="button" onclick="startSampleDifficultyScoring()" data-wc-score-button>启动离线评分</button>
        </div>
        <small data-wc-score-status></small>
      </div>
    </div>`;
}

export function scheduleWeightComposerPreview(config, api) {
  const serial = ++refreshSerial;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(async () => {
    const root = document.querySelector('[data-weight-composer-preview]');
    if (!root) return;
    try {
      const payload = unwrap(await api.previewWeightComposer(config, 65));
      if (serial !== refreshSerial) return;
      const curves = Object.entries(payload.curves || {});
      const values = curves.flatMap(([, series]) => series).filter(Number.isFinite);
      const yMin = Math.min(...values, 0.9);
      const yMax = Math.max(...values, 1.1);
      const paths = curves.map(([key, series]) => `<path d="${curvePath(series, yMin, yMax)}" fill="none" stroke="${COLORS[key] || '#e2e8f0'}" stroke-width="${key === 'combined_normalized' ? 3 : 1.7}" opacity="${key === 'combined_raw' ? .55 : 1}"></path>`).join('');
      root.querySelector('[data-wc-chart]').innerHTML = `<svg viewBox="0 0 620 170" role="img" aria-label="权重组合曲线" style="width:100%;min-height:170px"><line x1="0" y1="150" x2="620" y2="150" stroke="currentColor" opacity=".2"></line><line x1="0" y1="20" x2="0" y2="150" stroke="currentColor" opacity=".2"></line>${paths}</svg>`;
      root.querySelector('[data-wc-legend]').innerHTML = curves.length
        ? curves.map(([key]) => `<small style="color:${COLORS[key] || 'inherit'}">● ${escapeHtml(LABELS[key] || key)}</small>`).join('')
        : '<small>当前没有有效的一维权重轴</small>';
      const stats = payload.stats?.combined_normalized;
      root.querySelector('[data-wc-stats]').textContent = stats ? `归一化均值 ${Number(stats.mean).toFixed(3)} · ${Number(stats.min).toFixed(3)}–${Number(stats.max).toFixed(3)}` : '';
      root.querySelector('[data-wc-warning]').textContent = (payload.warnings || []).join('；');
    } catch (error) {
      root.querySelector('[data-wc-warning]').textContent = error?.message || '权重预览失败';
    }
  }, 180);
}

export function createWeightComposerActions({ state, api, updateConfigValue, showToast }) {
  async function startSampleDifficultyScoring() {
    const root = document.querySelector('[data-weight-composer-preview]');
    if (!root) return false;
    const datasetDir = String(state.config.train_data_dir || '').trim();
    if (!datasetDir) {
      showToast?.('请先设置训练数据集目录');
      return false;
    }
    const minimum = Number(root.querySelector('[data-wc-min]')?.value || 0.5);
    const maximum = Number(root.querySelector('[data-wc-max]')?.value || 1.5);
    if (maximum < minimum) {
      showToast?.('最大权重不能小于最小权重');
      return false;
    }
    const button = root.querySelector('[data-wc-score-button]');
    const statusEl = root.querySelector('[data-wc-score-status]');
    button.disabled = true;
    statusEl.textContent = '正在启动离线评分…';
    try {
      const submitted = unwrap(await api.startSampleDifficultyScoring({
        dataset_dir: datasetDir,
        mapping: root.querySelector('[data-wc-mapping]')?.value || 'neutral',
        minimum,
        maximum,
        strength: Number(root.querySelector('[data-wc-strength]')?.value || 1),
        recursive: true,
        preview_only: !!root.querySelector('[data-wc-preview-only]')?.checked,
        overwrite: !!root.querySelector('[data-wc-overwrite]')?.checked,
      }));
      const jobId = submitted.job_id;
      window.clearInterval(scoringTimer);
      scoringTimer = window.setInterval(async () => {
        try {
          const job = unwrap(await api.getSampleDifficultyScoring(jobId));
          statusEl.textContent = `状态：${job.status} · ${Math.round(Number(job.progress || 0) * 100)}%`;
          if (job.status === 'completed') {
            window.clearInterval(scoringTimer);
            button.disabled = false;
            const result = job.result || {};
            statusEl.textContent = `报告：${result.report_path || '-'}${result.sidecar_path ? ` · 权重：${result.sidecar_path}` : ''}`;
            if (result.sidecar_path) updateConfigValue('sample_difficulty_metadata_path', result.sidecar_path);
            showToast?.(result.sidecar_generated ? '评分与难度权重文件已生成' : '质量评分报告已生成');
          } else if (job.status === 'failed' || job.status === 'cancelled') {
            window.clearInterval(scoringTimer);
            button.disabled = false;
            statusEl.textContent = job.error || `评分任务${job.status}`;
          }
        } catch (_error) {}
      }, 800);
      return true;
    } catch (error) {
      button.disabled = false;
      statusEl.textContent = error?.message || '离线评分启动失败';
      showToast?.(statusEl.textContent);
      return false;
    }
  }
  return { startSampleDifficultyScoring };
}

