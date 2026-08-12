import { escapeHtml } from '../utils/dom.js';

function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
  return payload;
}

function formatPolicy(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.map(formatPolicy).filter((item) => item !== '—').join('、') || '—';
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${key}: ${formatPolicy(item)}`).join('；') || '—';
  }
  return String(value);
}

function formatValue(value) {
  if (value === undefined) return '未设置';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch (_error) { return String(value); }
  }
  return String(value);
}

export function getApplicableTrainingIntentSuggestions(preview) {
  const applicable = preview?.applicable_suggestions;
  return applicable && typeof applicable === 'object' && !Array.isArray(applicable) ? { ...applicable } : {};
}

function summaryCell(label, value) {
  return `<div style="display:grid;gap:4px;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);"><b style="font-size:11px;color:var(--accent);">${escapeHtml(label)}</b><span style="font-size:12px;line-height:1.45;word-break:break-word;">${escapeHtml(formatPolicy(value))}</span></div>`;
}

function diffItems(fields, preview, mode) {
  const diffMap = new Map((preview?.resolved_config_diff || []).map((item) => [item.field, item]));
  if (!fields.length) return '<p style="margin:8px 0 0;color:var(--text-muted);font-size:12px;">没有项目。</p>';
  return `<ul style="display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none;">${fields.map((field) => {
    const diff = diffMap.get(field) || {};
    const detail = mode === 'apply'
      ? `${formatValue(diff.current_value ?? diff.current)} → ${formatValue(preview.applicable_suggestions[field])}`
      : `保留 ${formatValue(diff.current_value ?? diff.current)}`;
    return `<li style="display:flex;justify-content:space-between;gap:12px;font-size:11px;"><code style="color:var(--accent);word-break:break-all;">${escapeHtml(field)}</code><span style="color:var(--text-muted);text-align:right;word-break:break-word;">${escapeHtml(detail)}</span></li>`;
  }).join('')}</ul>`;
}

function renderResult(preview, intent) {
  const profile = preview?.intent?.profile || {};
  const applicable = getApplicableTrainingIntentSuggestions(preview);
  const applicableKeys = Object.keys(applicable);
  const skipped = Array.isArray(preview?.skipped_explicit_fields) ? preview.skipped_explicit_fields : [];
  const noSuggestions = intent === 'normal' || !Object.keys(preview?.suggested_config || {}).length;
  return `
    <div style="display:grid;gap:12px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">
        ${summaryCell('Profile', profile.label || preview?.intent?.normalized || intent)}
        ${summaryCell('优先区域', profile.priority_regions)}
        ${summaryCell('目标模块', profile.target_module_policy)}
        ${summaryCell('验证重点', profile.validation_focus)}
        ${summaryCell('Caption 策略', profile.caption_policy)}
        ${summaryCell('数据策略', profile.data_policy)}
        ${summaryCell('区域策略', profile.region_policy)}
      </div>
      ${noSuggestions ? '<p style="margin:0;padding:8px 10px;border:1px solid var(--border);border-radius:8px;color:var(--text-muted);font-size:12px;">普通用途不提供参数建议，当前配置保持原样。</p>' : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px;"><b>将修改（${applicableKeys.length}）</b>${diffItems(applicableKeys, preview, 'apply')}</div>
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px;"><b>因显式设置跳过（${skipped.length}）</b>${diffItems(skipped, preview, 'skip')}</div>
        </div>`}
      ${preview?.runtime_applies_suggestions === false ? '<small style="color:var(--text-muted);">运行时不会自动应用这些建议。</small>' : ''}
    </div>`;
}

export function renderTrainingIntentProfilePreview() {
  return `
    <div data-training-intent-preview style="grid-column:1/-1;display:grid;gap:12px;width:100%;padding-top:12px;border-top:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" type="button" data-tip-preview onclick="previewTrainingIntentProfile()">预览建议</button>
        <button class="btn btn-primary btn-sm" type="button" data-tip-apply onclick="applyTrainingIntentSuggestions()" disabled>应用未设置项</button>
        <small data-tip-tracking style="color:var(--text-muted);">切换用途不会自动修改配置</small>
      </div>
      <div data-tip-status style="font-size:12px;color:var(--text-muted);">点击“预览建议”查看 Profile 摘要、可应用项与显式字段保护结果。</div>
      <div data-tip-result></div>
    </div>`;
}

export function createTrainingIntentProfileActions({ state, api, updateConfigValue, showToast }) {
  const latestByType = new Map();

  function explicitFields() {
    const fields = state.trainingIntentExplicitFields?.[state.activeTrainingType];
    return fields instanceof Set ? [...fields] : [];
  }

  async function previewTrainingIntentProfile() {
    const root = document.querySelector('[data-training-intent-preview]');
    if (!root) return false;
    const intent = String(state.config.training_intent || 'normal');
    const button = root.querySelector('[data-tip-preview]');
    const applyButton = root.querySelector('[data-tip-apply]');
    const status = root.querySelector('[data-tip-status]');
    button.disabled = true;
    applyButton.disabled = true;
    status.textContent = '正在预览建议…';
    try {
      const preview = unwrap(await api.previewTrainingIntentProfile(state.config, intent, explicitFields()));
      latestByType.set(state.activeTrainingType, { intent, preview });
      root.querySelector('[data-tip-result]').innerHTML = renderResult(preview, intent);
      const applicableCount = Object.keys(getApplicableTrainingIntentSuggestions(preview)).length;
      applyButton.disabled = intent === 'normal' || applicableCount === 0;
      status.textContent = `已追踪 ${explicitFields().length} 个会话内显式字段；可应用 ${applicableCount} 项。`;
      return true;
    } catch (error) {
      const message = error?.message || '训练用途建议预览失败';
      status.textContent = message;
      showToast?.(message);
      return false;
    } finally {
      button.disabled = false;
    }
  }

  async function applyTrainingIntentSuggestions() {
    const intent = String(state.config.training_intent || 'normal');
    if (intent === 'normal') return false;
    const cached = latestByType.get(state.activeTrainingType);
    if (!cached || cached.intent !== intent) {
      showToast?.('请先预览当前训练用途的建议');
      return false;
    }
    const applicable = getApplicableTrainingIntentSuggestions(cached.preview);
    const entries = Object.entries(applicable);
    if (!entries.length) return false;
    for (const [key, value] of entries) await updateConfigValue(key, value, { explicit: false });
    const root = document.querySelector('[data-training-intent-preview]');
    const status = root?.querySelector('[data-tip-status]');
    const applyButton = root?.querySelector('[data-tip-apply]');
    if (status) status.textContent = `已应用 ${entries.length} 个未显式设置项；建议重新预览确认最新差异。`;
    if (applyButton) applyButton.disabled = true;
    showToast?.(`已应用 ${entries.length} 个未显式设置项`);
    return true;
  }

  return { previewTrainingIntentProfile, applyTrainingIntentSuggestions };
}