// renderers/configForm.js — 配置表单渲染器
// 整合 11 个紧密耦合的函数：renderSection、renderField、renderFieldDescription
// + 5 个 SectionContent 子函数（dataset / caption / network / optimizer / training）
// + 3 个 group 子函数（NetworkOptionGroup / CaptionTagDropoutGroup / RegularizationFieldGroup）
//
// 依赖（通过工厂参数注入）：
//   - state（读 state.config 等）
//   - canUseBuiltinPicker（业务逻辑：判断字段是否能用内置选择器）
//   - isFieldVisible（来自 sdxlSchema.js）
//   - COLLAPSIBLE_FIELD_KEYS（来自 utils/constants.js）
//
// 注：大量内联 onclick="updateConfigValue(...)" / "pickPath(...)" / "openNativePicker(...)"
//     依赖 window.* 全局函数，Stage 5 才转事件委托。

import { escapeHtml } from '../utils/dom.js';
import {
  resolveFieldLabel,
  resolveFieldDesc,
  resolveOptionLabel,
  resolveSectionTitle,
} from '../schemaFieldI18n.js';
import { api } from '../api.js';
import { createWeightComposerActions, renderWeightComposerPreview, scheduleWeightComposerPreview } from './weightComposerPreview.js';
import { createTrainingIntentProfileActions, renderTrainingIntentProfilePreview } from './trainingIntentProfilePreview.js';
import { renderProgressivePhaseEditorField } from './progressivePhaseEditor.js';
import { isAttentionBackendAvailable, makeAttentionOptions } from '../features/attentionCapabilities.js';
import {
  renderCaptionSettingsContentLayout,
  renderDatasetSettingsContentLayout,
  renderNetworkSettingsContentLayout,
  renderOptimizerSettingsContentLayout,
  renderTrainingSettingsContentLayout,
} from './configSectionLayouts.js';
import {
  getFieldConflict as getTemplateFieldConflict,
  getPreviewGroupsForRender as getTemplatePreviewGroupsForRender,
  renderCaptionTagDropoutGroup as renderCaptionTagDropoutGroupTemplate,
  renderConflictHint,
  renderFieldDescription,
  renderGhostReplayHelperCard as renderGhostReplayHelperCardTemplate,
  renderNetworkOptionGroup as renderNetworkOptionGroupTemplate,
  renderPreviewGroupsField as renderPreviewGroupsFieldTemplate,
  renderRegularizationFieldGroup as renderRegularizationFieldGroupTemplate,
  renderSemanticRegionWeightsField,
  toBool,
} from './configFormTemplates.js';

export function createConfigFormRenderer({ state, canUseBuiltinPicker, isFieldVisible, COLLAPSIBLE_FIELD_KEYS }) {
  function renderGhostReplayHelperCard() {
    if (!state.config.lulynx_ghost_replay) {
      return '';
    }
    return renderGhostReplayHelperCardTemplate(state.ghostReplayRecorder || {});
  }

  function getPreviewGroupsForRender() {
    return getTemplatePreviewGroupsForRender(state.config || {});
  }

  function renderPreviewGroupsField(field, disabledAttr, disabledCls, modCls, conflictWith, renderHeader) {
    return renderPreviewGroupsFieldTemplate({
      field,
      groups: getPreviewGroupsForRender(),
      disabledAttr,
      disabledCls,
      modCls,
      conflictWith,
      renderHeader,
      renderFieldDescription,
      renderConflictHint,
      lang: state.lang,
    });
  }

  function resolveFieldOptions(field) {
    const options = field.options || [];
    if (field.attentionBackendOptions) {
      return makeAttentionOptions(options, state.executionProfiles || [], { ...(state.config || {}), runtime: state.runtime });
    }
    return options;
  }

  function getAttentionBackendBlocker(field) {
    if (!field.requiresAttentionBackend) return '';
    const context = { ...(state.config || {}), runtime: state.runtime };
    if (isAttentionBackendAvailable(field.requiresAttentionBackend, state.executionProfiles || [], context)) {
      return '';
    }
    const runtimeInfo = state.runtime?.runtime || {};
    const profile = String(
      state.config.execution_profile_id
      || state.config.runtime_id
      || runtimeInfo.runtime_id
      || runtimeInfo.environment
      || 'standard'
    );
    return `当前 ${profile || 'standard'} 运行时不可用`;
  }

  function getFieldConflict(field) {
    return getTemplateFieldConflict(field, state.config || {});
  }

  function renderField(field) {
    const value = state.config[field.key];
    const label = resolveFieldLabel(field, state.lang);
    const defaultValue = field.defaultValue ?? '';
    if (field.type === 'ui_group') {
      return `
        <div class="config-group group-heading" data-field-key="${field.key}">
          <div class="group-heading-title">${escapeHtml(label || '')}</div>
          ${(resolveFieldDesc(field, state.lang) || field.desc) ? `<p class="group-heading-desc">${escapeHtml(resolveFieldDesc(field, state.lang) || field.desc)}</p>` : ''}
        </div>
      `;
    }
    if (field.type === 'action') {
      const summaryRaw = state.config[field.summaryKey] || '';
      const summary = summaryRaw ? String(summaryRaw) : '';
      const handler = String(field.handler || '').replace(/'/g, "\\'");
      return `
        <div class="config-group config-action-field-compact" data-field-key="${field.key}">
          <div class="action-field-content">
            <div class="action-field-header">
              <label><span>${escapeHtml(label || '')}</span></label>
            </div>
            ${resolveFieldDesc(field, state.lang) ? `<p class="action-field-desc">${escapeHtml(resolveFieldDesc(field, state.lang))}</p>` : ''}
          </div>
          <div class="action-field-button-wrapper">
            <button class="btn btn-outline config-action-btn-full" type="button" onclick="${handler ? `window['${handler}'] && window['${handler}']()` : ''}">
              ${escapeHtml(field.buttonLabel || '打开')}
            </button>
          </div>
          ${summary ? `<p class="action-field-summary">${escapeHtml(summary)}</p>` : ''}
        </div>
      `;
    }
    const isPicker = field.type === 'file' || field.type === 'folder';
    const isModified = String(value ?? '') !== String(defaultValue);
    const showBuiltinPicker = canUseBuiltinPicker(field);
    const canUndo = Object.hasOwn(state.fieldUndo, field.key);
    const canReset = String(value ?? '') !== String(defaultValue ?? '');
    const pickerMode = field.pickerType || field.type;
    const builtinPickerIcon = (pickerMode === 'folder' || pickerMode === 'output-folder') ? '#icon-folder' : '#icon-file';
    const attentionBackendBlocker = getAttentionBackendBlocker(field);
    const conflictWith = getFieldConflict(field) || attentionBackendBlocker;
    const keepActiveAttentionToggleEditable = field.type === 'boolean' && attentionBackendBlocker && toBool(value);
    const disabledAttr = conflictWith && !keepActiveAttentionToggleEditable ? ' disabled' : '';
    const fieldKeyArg = escapeHtml(JSON.stringify(String(field.key || '')));
    const renderHeader = () => `
      <div class="field-header-row">
        <label>
          <span>${escapeHtml(label)}</span>
          <button class="field-help-btn" type="button" title="查看参数说明" aria-label="查看参数说明" onclick="event.preventDefault(); event.stopPropagation(); openTrainingOptionHelp(${fieldKeyArg})">?</button>
        </label>
        <div class="field-inline-actions" data-field-key="${field.key}">
          <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
          ${showBuiltinPicker ? `<button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openNativePicker('${field.key}', '${pickerMode}')"><svg class="icon"><use href="${builtinPickerIcon}"></use></svg></button>` : ''}
        </div>
      </div>
    `;

    const modCls = isModified ? ' field-modified' : '';
    const disabledCls = disabledAttr ? ' field-disabled' : '';
    const renderCollapsibleField = (bodyHtml) => {
      const rawSummaryValue = value === undefined || value === null || value === '' ? '' : String(value);
      const summaryValue = rawSummaryValue || '未设置';
      const summaryClass = rawSummaryValue ? '' : ' is-empty';
      return `
        <details class="config-group collapsible-field${modCls}${disabledCls}" data-field-key="${field.key}">
          <summary class="collapsible-field-summary">
            <span class="collapsible-field-title">${escapeHtml(label)}</span>
            <span class="collapsible-field-value${summaryClass}">${escapeHtml(summaryValue)}</span>
            <span class="collapsible-caret" aria-hidden="true">⌄</span>
          </summary>
          ${resolveFieldDesc(field, state.lang) ? `<p class="field-desc collapsible-field-desc">${escapeHtml(resolveFieldDesc(field, state.lang))}</p>` : ''}
          <div class="collapsible-field-body">
            ${bodyHtml}
          </div>
        </details>
      `;
    };

    if (field.type === 'boolean') {
      // 紧凑布尔卡：标题行内嵌开关（参数名 ? ··· [开关]），简介整行小字置于下方。
      // 控件形态跟设置项走：方框点选式（默认）或滑动开关式。
      const switchControlHtml = state.compactCheckboxSwitches
        ? `<label class="lx-checkbox">
                <input type="checkbox" ${value ? 'checked' : ''}${disabledAttr} onchange="updateConfigValue('${field.key}', this.checked)">
                <span class="lx-checkbox-box" aria-hidden="true"></span>
              </label>`
        : `<label class="switch switch-compact">
                <input type="checkbox" ${value ? 'checked' : ''}${disabledAttr} onchange="updateConfigValue('${field.key}', this.checked)">
                <span class="slider round"></span>
              </label>`;
      return `
        <div class="config-group boolean-card boolean-card-compact${modCls}${disabledCls}" data-field-key="${field.key}">
          <div class="field-header-row">
            <label>
              <span>${escapeHtml(label)}</span>
              <button class="field-help-btn" type="button" title="查看参数说明" aria-label="查看参数说明" onclick="event.preventDefault(); event.stopPropagation(); openTrainingOptionHelp(${fieldKeyArg})">?</button>
            </label>
            <div class="field-inline-actions" data-field-key="${field.key}">
              <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
              ${switchControlHtml}
            </div>
          </div>
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
        </div>
      `;
    }

    if (field.type === 'select') {
      const optionValue = (option) => (option && typeof option === 'object') ? option.value : option;
      const optionLabel = (option) => {
        const resolved = resolveOptionLabel(field.key, option, state.lang);
        if (resolved != null && String(resolved).trim()) return resolved;
        if (option && typeof option === 'object') return option.label ?? option.value ?? '默认';
        return option || '默认';
      };
      const optionDisabled = (option) => Boolean(option && typeof option === 'object' && option.disabled);
      const optionTitle = (option) => option && typeof option === 'object' ? (option.disabledReason || option.title || '') : '';
      const renderOption = (option) => {
        const optionVal = optionValue(option);
        const title = optionTitle(option);
        return `<option value="${escapeHtml(optionVal)}" ${String(value) === String(optionVal) ? 'selected' : ''}${optionDisabled(option) ? ' disabled' : ''}${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(optionLabel(option))}</option>`;
      };
      const ensureCurrentOption = (options) => {
        const current = value === undefined || value === null ? '' : String(value);
        if (!current || options.some((option) => String(optionValue(option)) === current)) {
          return options;
        }
        return [current, ...options];
      };
      let filteredOptions = ensureCurrentOption(resolveFieldOptions(field));
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
          <select${disabledAttr} onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map(renderOption).join('')}
          </select>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
          <select${disabledAttr} onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map(renderOption).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'preview_groups') {
      return renderPreviewGroupsField(field, disabledAttr, disabledCls, modCls, conflictWith, renderHeader);
    }

    if (field.type === 'semantic_region_weights') {
      return renderSemanticRegionWeightsField({
        field,
        value,
        disabledAttr,
        disabledCls,
        modCls,
        conflictWith,
        config: state.config,
        segmentationUi: state.semanticSegmentationUi,
        renderHeader,
        renderFieldDescription,
        renderConflictHint,
      });
    }
    if (field.type === 'progressive_phase_editor') {
      return renderProgressivePhaseEditorField({
        field,
        value,
        editorUi: state.progressivePhaseEditorUi,
        disabledAttr,
        disabledCls,
        modCls,
        conflictWith,
        renderHeader,
        renderFieldDescription,
        renderConflictHint,
      });
    }
    if (field.type === 'textarea') {
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
          <textarea class="text-area"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
          <textarea class="text-area"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
        </div>
      `;
    }

    const inputType = field.type === 'number' || field.type === 'slider' ? 'number' : 'text';
    const inputValue = value === undefined || value === null ? '' : value;

    if (isPicker) {
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
          <div class="input-picker">
            <button class="picker-icon" type="button"${disabledAttr} onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field, state.lang)}
          ${renderConflictHint(conflictWith)}
          <div class="input-picker">
            <button class="picker-icon" type="button"${disabledAttr} onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        </div>
      `;
    }



    if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
      return renderCollapsibleField(`
        ${renderHeader()}
        ${renderFieldDescription(field, state.lang)}
        ${renderConflictHint(conflictWith)}
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}"${disabledAttr} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      `);
    }

    return `
      <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
        ${renderHeader()}
        ${renderFieldDescription(field, state.lang)}
        ${renderConflictHint(conflictWith)}
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}"${disabledAttr} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      </div>
    `;
  }

  function renderNetworkOptionGroup(title, note, fields, dataFieldKey) {
    return renderNetworkOptionGroupTemplate({ title, note, fields, dataFieldKey, config: state.config || {}, renderField });
  }

  function renderCaptionTagDropoutGroup(fields) {
    return renderCaptionTagDropoutGroupTemplate({ fields, config: state.config || {}, renderField });
  }

  function renderRegularizationFieldGroup(regField, priorField) {
    return renderRegularizationFieldGroupTemplate({ regField, priorField, config: state.config || {} });
  }

  function renderDatasetSettingsContent(fields, rf = renderField) {
    return renderDatasetSettingsContentLayout({ fields, renderField: rf, renderRegularizationFieldGroup });
  }

  function renderCaptionSettingsContent(fields, rf = renderField) {
    return renderCaptionSettingsContentLayout({ fields, renderField: rf, renderCaptionTagDropoutGroup });
  }

  function renderNetworkSettingsContent(fields, rf = renderField) {
    return renderNetworkSettingsContentLayout({ fields, config: state.config || {}, renderField: rf, renderNetworkOptionGroup });
  }

  function renderOptimizerSettingsContent(fields, rf = renderField) {
    return renderOptimizerSettingsContentLayout({ fields, renderField: rf });
  }

  function renderTrainingSettingsContent(fields, rf = renderField) {
    return renderTrainingSettingsContentLayout({ fields, config: state.config || {}, renderField: rf });
  }

  // 开关聚合区块（方框模式）：同一分段内的所有布尔参数聚集为一个紧凑区块。
  // 行内：参数名 + ?帮助 + 冲突警告 + 方框；简介收到 hover tooltip，保证行高紧凑。
  function renderSwitchClusterRow(field) {
    const value = state.config[field.key];
    const label = resolveFieldLabel(field, state.lang);
    const defaultValue = field.defaultValue ?? '';
    const isModified = String(value ?? '') !== String(defaultValue);
    const attentionBackendBlocker = getAttentionBackendBlocker(field);
    const conflictWith = getFieldConflict(field) || attentionBackendBlocker;
    const keepActiveAttentionToggleEditable = attentionBackendBlocker && toBool(value);
    const disabledAttr = conflictWith && !keepActiveAttentionToggleEditable ? ' disabled' : '';
    const fieldKeyArg = escapeHtml(JSON.stringify(String(field.key || '')));
    const desc = resolveFieldDesc(field, state.lang) || '';
    const rowTitle = desc || (conflictWith || '');
    return `
      <div class="switch-cluster-row${isModified ? ' field-modified' : ''}${disabledAttr ? ' field-disabled' : ''}" data-field-key="${field.key}"${rowTitle ? ` title="${escapeHtml(rowTitle)}"` : ''}>
        <span class="switch-cluster-label">
          <span>${escapeHtml(label)}</span>
          <button class="field-help-btn" type="button" title="查看参数说明" aria-label="查看参数说明" onclick="event.preventDefault(); event.stopPropagation(); openTrainingOptionHelp(${fieldKeyArg})">?</button>
          ${conflictWith ? `<span class="switch-cluster-conflict" title="${escapeHtml(conflictWith)}">⚠</span>` : ''}
        </span>
        <label class="lx-checkbox">
          <input type="checkbox" ${value ? 'checked' : ''}${disabledAttr} onchange="updateConfigValue('${field.key}', this.checked)">
          <span class="lx-checkbox-box" aria-hidden="true"></span>
        </label>
      </div>
    `;
  }

  function renderSwitchCluster(fields) {
    const title = state.lang === 'en' ? 'Switches' : '开关';
    return `
      <div class="config-group switch-cluster">
        <div class="switch-cluster-title">${title}</div>
        <div class="switch-cluster-list">${fields.map((field) => renderSwitchClusterRow(field)).join('')}</div>
      </div>
    `;
  }

  function renderSection(section) {
    const fields = section.fields.filter((field) => field.type !== 'hidden' && isFieldVisible(field, state.config));
    const realFieldCount = fields.filter((field) => field.type !== 'ui_group').length;
    const sectionTitle = resolveSectionTitle(section, state.lang);
    const sectionDescription = section.id === 'noise-settings'
      ? (state.lang === 'en'
        ? `Improves LoRA brightness balance ${section.description || ''}`.trim()
        : `改善lora明暗度 ${section.description || ''}`.trim())
      : section.description;
    // 方框开关模式：同一分段的布尔字段不逐个渲染卡片，而是收集起来聚合为一个开关区块，
    // 置于该分段内容顶部。group 模板（DoRA/标签丢弃等）内部用的是原始 renderField，不受影响。
    const useSwitchCluster = !!state.compactCheckboxSwitches;
    const clusterFields = [];
    const effectiveRenderField = useSwitchCluster
      ? (field) => {
          if (field.type === 'boolean') {
            clusterFields.push(field);
            return '';
          }
          return renderField(field);
        }
      : renderField;
    const content = section.id === 'dataset-settings'
      ? renderDatasetSettingsContent(fields, effectiveRenderField)
      : section.id === 'caption-settings'
        ? renderCaptionSettingsContent(fields, effectiveRenderField)
        : section.id === 'network-settings'
          ? renderNetworkSettingsContent(fields, effectiveRenderField)
          : section.id === 'optimizer-settings'
            ? renderOptimizerSettingsContent(fields, effectiveRenderField)
            : section.id === 'training-settings'
              ? renderTrainingSettingsContent(fields, effectiveRenderField)
        : fields.map((field) => effectiveRenderField(field)).join('');
    const clusterHtml = clusterFields.length ? renderSwitchCluster(clusterFields) : '';
    const showGhostReplayHelper = !!(
      state.config.lulynx_ghost_replay
      && fields.some((field) => String(field.key || '').startsWith('lulynx_ghost_'))
    );
    const contentWithHelpers = clusterHtml + content
      + (showGhostReplayHelper ? renderGhostReplayHelperCard() : '')
      + (section.id === 'weight-composer' ? renderWeightComposerPreview() : '')
      + (section.id === 'training-intent-profile' ? renderTrainingIntentProfilePreview() : '');
    if (section.id === 'weight-composer') scheduleWeightComposerPreview(state.config || {}, api);

    // 瀑布流紧凑双排：长分段占满整行，其余分段左右两列排列
    const longSectionIds = new Set(['network-settings', 'optimizer-settings', 'training-settings', 'dataset-settings', 'caption-settings']);
    const waterfallWideClass = (state.configWaterfall && state.configWaterfallTwoColumn && (longSectionIds.has(section.id) || realFieldCount >= 8))
      ? ' waterfall-wide-section'
      : '';

    if (section.id === 'data-aug-settings' || section.id === 'noise-settings' || section.id === 'validation-settings') {
      const panelClass = section.id === 'noise-settings'
        ? 'noise-settings-panel'
        : section.id === 'validation-settings'
          ? 'validation-settings-panel'
          : 'data-aug-panel';
      const summaryClass = section.id === 'noise-settings'
        ? 'noise-settings-summary'
        : section.id === 'validation-settings'
          ? 'validation-settings-summary'
          : 'data-aug-summary';
      const summaryDesc = section.id === 'data-aug-settings'
        ? '方法老旧不推荐使用'
        : section.id === 'noise-settings'
          ? '改善lora明暗度'
          : '';
      return `
        <details class="form-section collapsible-panel ${panelClass}${waterfallWideClass}" id="${escapeHtml(section.id)}">
          <summary class="section-header collapsible-summary ${summaryClass}">
            <span class="collapsible-summary-main">
              <span class="collapsible-title">${escapeHtml(sectionTitle)}</span>
              ${summaryDesc ? `<span class="collapsible-desc">${escapeHtml(summaryDesc)}</span>` : ''}
            </span>
            <span class="collapsible-actions">
              <span class="section-meta">${realFieldCount} ${state.lang === 'en' ? 'fields' : '项参数'}</span>
              <span class="collapsible-caret" aria-hidden="true">⌄</span>
            </span>
          </summary>
          <div class="section-summary">${escapeHtml(sectionDescription || '')}</div>
          <div class="section-content">${contentWithHelpers}</div>
        </details>
      `;
    }

    return `
      <section class="form-section${waterfallWideClass}" id="${escapeHtml(section.id)}">
        <header class="section-header">
          <h3>${escapeHtml(sectionTitle)}</h3>
          <span class="section-meta">${realFieldCount} ${state.lang === 'en' ? 'fields' : '项参数'}</span>
        </header>
        <div class="section-summary">${escapeHtml(sectionDescription)}</div>
        <div class="section-content">${contentWithHelpers}</div>
      </section>
    `;
  }

  const weightComposerActions = createWeightComposerActions({
    state,
    api,
    updateConfigValue: (key, value) => window.updateConfigValue?.(key, value),
    showToast: (message) => window.showToast?.(message),
  });

  const trainingIntentProfileActions = createTrainingIntentProfileActions({
    state,
    api,
    updateConfigValue: (key, value, options) => window.updateConfigValue?.(key, value, options),
    showToast: (message) => window.showToast?.(message),
  });
  return {
    ...weightComposerActions,
    ...trainingIntentProfileActions,
    renderField,
    renderFieldDescription,
    renderSection,
    renderDatasetSettingsContent,
    renderCaptionSettingsContent,
    renderNetworkSettingsContent,
    renderOptimizerSettingsContent,
    renderTrainingSettingsContent,
    renderNetworkOptionGroup,
    renderCaptionTagDropoutGroup,
    renderRegularizationFieldGroup,
  };
}


