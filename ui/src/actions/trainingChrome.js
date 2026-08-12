export function createTrainingChromeActions({
  state,
  getFieldDefinition,
  loadTrainingWikiEntry,
  buildSchemaFallbackEntry,
  escapeHtml,
  renderNavigator,
  renderView,
  queryAll,
}) {
  let waterfallScrollHandler = null;

  function persistTrainingGroupsCollapsed() {
    try {
      const arr = Array.from(state._collapsedTrainingGroups || []);
      localStorage.setItem('sd-rescripts:training-groups-collapsed', JSON.stringify(arr));
    } catch (_e) {
      // Ignore blocked storage; UI state can be restored from defaults.
    }
  }

  function toggleTrainingGroup(group) {
    if (!state._collapsedTrainingGroups) state._collapsedTrainingGroups = new Set();
    if (state._collapsedTrainingGroups.has(group)) {
      state._collapsedTrainingGroups.delete(group);
    } else {
      state._collapsedTrainingGroups.add(group);
    }
    persistTrainingGroupsCollapsed();
    renderNavigator();
  }

  function toggleTrainingAdvisor() {
    state.trainingAdvisorCollapsed = !state.trainingAdvisorCollapsed;
    localStorage.setItem('sd-rescripts:training-advisor-collapsed', state.trainingAdvisorCollapsed ? 'true' : 'false');
    renderView(state.activeModule || 'config');
  }

  async function openTrainingOptionHelp(fieldKey) {
    const field = getFieldDefinition(fieldKey, state.activeTrainingType);
    renderTrainingOptionHelpModal({ loading: true, field, fieldKey });
    try {
      const wikiEntry = await loadTrainingWikiEntry(fieldKey);
      renderTrainingOptionHelpModal({ entry: wikiEntry || buildSchemaFallbackEntry(field), field, fieldKey });
    } catch (_error) {
      renderTrainingOptionHelpModal({ entry: buildSchemaFallbackEntry(field), field, fieldKey });
    }
  }

  function closeTrainingOptionHelp() {
    const modal = document.querySelector('.training-option-help-modal');
    if (modal) modal.remove();
  }

  function renderTrainingOptionHelpModal({ entry = null, loading = false, field = null, fieldKey = '' }) {
    closeTrainingOptionHelp();
    const safeEntry = entry || buildSchemaFallbackEntry(field) || {
      key: fieldKey,
      title: fieldKey || '参数说明',
      category: '训练参数',
      standard: {
        summary: '正在加载参数说明...',
        effect: '',
        whenToUse: '',
        avoidWhen: '',
      },
      relatedConfigs: [],
    };
    const standard = safeEntry.standard || {};
    const related = Array.isArray(safeEntry.relatedConfigs) ? safeEntry.relatedConfigs : [];
    const optionsHtml = loading ? '' : renderSelectOptionsHelp(field, safeEntry);
    const body = document.createElement('div');
    body.className = 'training-option-help-modal open';
    body.innerHTML = `
      <div class="training-option-help-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(safeEntry.title || '参数说明')}">
        <div class="training-option-help-head">
          <div>
            <span class="training-option-help-category">${escapeHtml(safeEntry.category || '训练参数')}</span>
            <h3>${escapeHtml(safeEntry.title || field?.label || fieldKey || '参数说明')}</h3>
          </div>
          <button class="modal-close" type="button" title="关闭" onclick="closeTrainingOptionHelp()">×</button>
        </div>
        <div class="training-option-help-body">
          ${loading ? '<p class="field-desc">正在加载参数说明...</p>' : ''}
          ${renderHelpRow('简单说', typeof standard.summary === 'string' ? standard.summary : '')}
          ${renderHelpRow('打开后效果', typeof standard.effect === 'string' ? standard.effect : '')}
          ${renderHelpRow('适合什么时候开', typeof standard.whenToUse === 'string' ? standard.whenToUse : '')}
          ${renderHelpRow('什么时候先别开', typeof standard.avoidWhen === 'string' ? standard.avoidWhen : '')}
          ${optionsHtml}
          ${safeEntry.fallback ? '<p class="training-option-help-note">完整 Wiki 条目还在补充中，当前内容来自训练 schema。</p>' : ''}
          ${related.length ? `<div class="training-option-help-related">${related.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    `;
    body.addEventListener('click', (event) => {
      if (event.target === body) closeTrainingOptionHelp();
    });
    document.body.appendChild(body);
  }

  function renderHelpRow(title, text) {
    if (!text) return '';
    return `
      <div class="training-option-help-row">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }

  function asStringMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[String(k)] = String(v);
    }
    return out;
  }

  function normalizeHelpOption(opt) {
    if (opt == null) return null;
    if (typeof opt === 'string' || typeof opt === 'number' || typeof opt === 'boolean') {
      const value = String(opt);
      return { value, label: value };
    }
    if (typeof opt === 'object') {
      const value = opt.value == null ? '' : String(opt.value);
      if (!value && !opt.label) return null;
      return { value, label: String(opt.label || value) };
    }
    return null;
  }

  function optionKeyAliases(value) {
    const raw = String(value || '');
    const lower = raw.toLowerCase();
    const snake = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    const compact = snake.replace(/_/g, '');
    const digitSplit = snake.replace(/([a-z])(\d)/g, '$1_$2');
    return [...new Set([raw, lower, snake, compact, digitSplit, digitSplit.replace(/_/g, '')].filter(Boolean))];
  }

  function lookupOptionDescription(wikiDesc, value, label) {
    for (const k of [...optionKeyAliases(value), ...optionKeyAliases(label)]) {
      if (wikiDesc[k]) return wikiDesc[k];
    }
    const want = new Set(optionKeyAliases(value).map((s) => s.replace(/_/g, '')));
    for (const [k, desc] of Object.entries(wikiDesc)) {
      if (want.has(String(k).toLowerCase().replace(/_/g, ''))) return desc;
    }
    return '';
  }

  function renderSelectOptionsHelp(field, entry) {
    const schemaOpts = Array.isArray(field?.options) ? field.options : [];
    const wikiDesc = {
      ...asStringMap(entry?.optionDescriptions),
      ...asStringMap(entry?.standard?.optionDescriptions),
      ...asStringMap(entry?.standard?.recommendedValues),
    };
    const rows = [];
    const seen = new Set();
    for (const opt of schemaOpts) {
      const n = normalizeHelpOption(opt);
      if (!n) continue;
      const key = n.value || n.label;
      if (seen.has(key)) continue;
      seen.add(key);
      const description = lookupOptionDescription(wikiDesc, n.value, n.label);
      rows.push({ ...n, description });
    }
    for (const [k, desc] of Object.entries(wikiDesc)) {
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ value: k, label: k, description: desc });
    }
    if (!rows.length) return '';
    const items = rows
      .map((row) => {
        const valueHtml =
          row.value && row.value !== row.label
            ? `<code class="training-option-help-opt-value">${escapeHtml(row.value)}</code>`
            : '';
        const descHtml = row.description
          ? `<p class="training-option-help-opt-desc">${escapeHtml(row.description)}</p>`
          : '';
        return `<li class="training-option-help-opt">
          <div class="training-option-help-opt-head">
            <span class="training-option-help-opt-label">${escapeHtml(row.label)}</span>
            ${valueHtml}
          </div>
          ${descHtml}
        </li>`;
      })
      .join('');
    return `
      <div class="training-option-help-row training-option-help-options-block">
        <strong>可选值</strong>
        <ul class="training-option-help-options">${items}</ul>
      </div>
    `;
  }

  function toggleWaterfallMiniNav() {
    state.waterfallMiniNavCollapsed = !state.waterfallMiniNavCollapsed;
    localStorage.setItem('sd-rescripts:waterfall-mini-nav-collapsed', state.waterfallMiniNavCollapsed ? 'true' : 'false');
    renderView(state.activeModule || 'config');
  }

  // 通用浮动面板拖拽：左键按住头部空白处拖动，松手时通过 onPersist 持久化位置
  // allowButtonDrag=true 时允许从 button 元素发起拖拽（用于收起态小圆点）
  function _startFloatingPanelDrag(event, selector, onPersist, allowButtonDrag = false) {
    if (event.button !== 0) return;
    if (!allowButtonDrag && event.target?.closest?.('button')) return;
    const panel = event.currentTarget?.closest?.(selector);
    if (!panel) return;
    event.preventDefault();

    // 记录鼠标在面板内的偏移（相对于面板左上角）
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const margin = 12;
    let hasMoved = false;

    panel.classList.add('is-dragging');
    // 切换为 left/top 定位，保持当前视觉位置不变
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;

    const clampPosition = (clientX, clientY) => {
      const maxX = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
      const maxY = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
      return {
        x: Math.min(Math.max(margin, clientX - offsetX), maxX),
        y: Math.min(Math.max(margin, clientY - offsetY), maxY),
      };
    };

    const move = (moveEvent) => {
      hasMoved = true;
      const pos = clampPosition(moveEvent.clientX, moveEvent.clientY);
      panel.style.left = `${pos.x}px`;
      panel.style.top = `${pos.y}px`;
    };

    const stop = (upEvent) => {
      const pos = clampPosition(upEvent.clientX, upEvent.clientY);
      onPersist(pos);
      panel.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      // 如果发生了拖拽移动，阻止后续的 click 事件（避免误触展开/收起）
      if (hasMoved) {
        const suppressClick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          document.removeEventListener('click', suppressClick, true);
        };
        document.addEventListener('click', suppressClick, true);
        // 兜底：100ms 后自动移除，防止意外阻塞其他点击
        setTimeout(() => document.removeEventListener('click', suppressClick, true), 100);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function startTrainingAdvisorDrag(event) {
    // 收起态小圆点本身是 button，需要允许从 button 发起拖拽
    const isMini = !!event.currentTarget?.closest?.('.floating-advisor-mini');
    _startFloatingPanelDrag(event, '.floating-training-advisor', (pos) => {
      state.trainingAdvisorPosition = pos;
      localStorage.setItem('sd-rescripts:training-advisor-position', JSON.stringify(pos));
    }, isMini);
  }

  function startWaterfallMiniNavDrag(event) {
    // 收起态小圆点本身是 button，需要允许从 button 发起拖拽
    const isMini = !!event.currentTarget?.closest?.('.waterfall-mini-nav-mini');
    _startFloatingPanelDrag(event, '.waterfall-mini-nav', (pos) => {
      state.waterfallMiniNavPosition = pos;
      localStorage.setItem('sd-rescripts:waterfall-mini-nav-position', JSON.stringify(pos));
    }, isMini);
  }

  function setupWaterfallScrollSpy(container) {
    if (waterfallScrollHandler) {
      document.removeEventListener('scroll', waterfallScrollHandler, true);
      waterfallScrollHandler = null;
    }
    const anchors = container.querySelectorAll('.waterfall-tab-anchor');
    if (!anchors.length) return;
    waterfallScrollHandler = () => {
      if (state.activeModule !== 'config' || !state.configWaterfall) return;
      let curTab = '';
      const triggerY = 140;
      anchors.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= triggerY) curTab = el.dataset.waterfallTab;
      });
      if (curTab && curTab !== state.activeTab) {
        state.activeTab = curTab;
        localStorage.setItem('sdxl_ui_tab', curTab);
        queryAll('.top-nav-item').forEach((item) => {
          item.classList.toggle('active', item.dataset.tab === curTab);
        });
      }
    };
    document.addEventListener('scroll', waterfallScrollHandler, true);
  }

  return {
    persistTrainingGroupsCollapsed,
    toggleTrainingGroup,
    toggleTrainingAdvisor,
    openTrainingOptionHelp,
    closeTrainingOptionHelp,
    startTrainingAdvisorDrag,
    startWaterfallMiniNavDrag,
    toggleWaterfallMiniNav,
    setupWaterfallScrollSpy,
  };
}
