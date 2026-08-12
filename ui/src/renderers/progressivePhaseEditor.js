import { escapeHtml } from '../utils/dom.js';
import {
  DIFFICULTY_POLICY_OPTIONS,
  MODULE_POLICY_OPTIONS,
  TIMESTEP_POLICY_OPTIONS,
  progressivePhaseRows,
  progressivePhaseScheduleIssues,
  serializeProgressivePhaseSchedule,
} from '../features/progressivePhaseSchedule.js';

function optionsHtml(options, selected) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function fallbackJson(raw, document) {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object') return JSON.stringify(raw, null, 2);
  return serializeProgressivePhaseSchedule(document, document.phases);
}

function miniField(label, control, title = '') {
  return `<label class="mini-field"${title ? ` title="${escapeHtml(title)}"` : ''}><span>${escapeHtml(label)}</span>${control}</label>`;
}

export function renderProgressivePhaseEditorField({
  field,
  value,
  editorUi = {},
  disabledAttr = '',
  disabledCls = '',
  modCls = '',
  conflictWith = '',
  renderHeader,
  renderFieldDescription,
  renderConflictHint,
}) {
  const { document, rows } = progressivePhaseRows(value);
  const issues = progressivePhaseScheduleIssues(rows);
  const parseError = editorUi.error || document.error;
  // Two-row card layout: identity/progress on top, policies + actions below.
  // Avoid the old single-row min-width:1120px grid that crushed the form.
  const rowHtml = rows.map((row, index) => `
    <div data-progressive-phase-row="${index}" class="progressive-phase-row" style="margin-top:${index ? '12px' : '0'};padding:12px;border:1px solid rgba(148,163,184,.16);border-radius:10px;background:rgba(15,23,42,.28)">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;align-items:end">
        ${miniField('Phase ID', `<input type="text" value="${escapeHtml(row.id)}"${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'id', this.value)">`)}
        ${miniField('Start', `<input type="number" min="0" max="1" step="0.01" value="${escapeHtml(row.start)}"${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'start', this.value)">`)}
        ${miniField('End', `<input type="number" min="0" max="1" step="0.01" value="${escapeHtml(row.end)}"${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'end', this.value)">`)}
        ${miniField('LR Scale', `<input type="number" min="0" step="0.05" value="${escapeHtml(row.lrScale)}"${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'lr_scale', this.value)">`)}
        ${miniField('Resolution', `<input type="number" min="1" step="1" placeholder="继承" value="${escapeHtml(row.resolution)}"${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'resolution_hint', this.value)">`, '空值表示不覆盖当前分辨率。')}
        ${miniField('Rank', `<input type="number" min="1" step="1" placeholder="继承" value="${escapeHtml(row.rank)}"${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'rank_hint', this.value)">`, '仅支持固定最大形状且提供 active-rank 接口的适配器。')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr)) auto;gap:8px;align-items:end;margin-top:10px">
        ${miniField('Module Policy', `<select${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'module_policy', this.value)">${optionsHtml(MODULE_POLICY_OPTIONS, row.modulePolicy)}</select>`, '无法结构化识别的策略会显示为自定义 JSON，并保留原值。')}
        ${miniField('Difficulty', `<select${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'difficulty_policy', this.value)">${optionsHtml(DIFFICULTY_POLICY_OPTIONS, row.difficultyPolicy)}</select>`)}
        ${miniField('Timestep', `<select${disabledAttr} onchange="updateProgressivePhaseField(${index}, 'timestep_policy', this.value)">${optionsHtml(TIMESTEP_POLICY_OPTIONS, row.timestepPolicy)}</select>`)}
        <div style="display:flex;gap:6px;justify-content:flex-end;padding-bottom:2px">
          <button class="btn btn-outline btn-sm" type="button" title="在此阶段后新增并自动拆分进度区间"${disabledAttr} onclick="addProgressivePhase(${index})">+</button>
          <button class="btn btn-outline btn-sm" type="button" title="删除阶段"${disabledAttr}${rows.length <= 1 ? ' disabled' : ''} onclick="removeProgressivePhase(${index})">−</button>
        </div>
      </div>
    </div>
  `).join('');
  const issueHtml = issues.length ? `<div role="status" style="margin-top:10px;color:#fbbf24;font-size:12px">${issues.map((issue) => `<div>• ${escapeHtml(issue)}</div>`).join('')}</div>` : '';
  const errorHtml = parseError ? `<div role="alert" style="margin-top:8px;color:#fca5a5;font-size:12px">${escapeHtml(parseError)}</div>` : '';
  const jsonText = fallbackJson(value, document);
  const openAttr = parseError ? ' open' : '';
  return `
    <div class="config-group progressive-phase-editor${modCls}${disabledCls}" data-field-key="${escapeHtml(field.key)}" style="grid-column:1/-1;min-width:0">
      ${renderHeader()}
      ${renderFieldDescription(field)}
      ${renderConflictHint(conflictWith)}
      <div style="padding:2px 0 6px;min-width:0">${rowHtml}</div>
      ${issueHtml}
      <details data-progressive-phase-json-fallback${openAttr} style="margin-top:12px;border-top:1px solid rgba(148,163,184,.18);padding-top:8px">
        <summary style="cursor:pointer;color:var(--text-muted,#94a3b8);font-size:12px">高级 JSON 导入 / 导出（与上方结构化编辑器共用 progressive_phase_schedule）</summary>
        ${errorHtml}
        <textarea class="text-area" data-progressive-phase-json style="width:100%;min-height:210px;margin-top:8px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace"${disabledAttr} oninput="updateProgressivePhaseScheduleJson(this.value)">${escapeHtml(jsonText)}</textarea>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          <button class="btn btn-outline btn-sm" type="button"${disabledAttr} onclick="applyProgressivePhaseScheduleJson()">应用并格式化 JSON</button>
          <button class="btn btn-outline btn-sm" type="button"${disabledAttr} onclick="resetProgressivePhaseSchedule()">恢复单阶段默认值</button>
        </div>
      </details>
    </div>
  `;
}
