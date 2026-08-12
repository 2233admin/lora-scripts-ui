// actions/savedConfigs.js —配置保存/读取/导入导出 actions
//   setupImportConfig /switchTrainingType / saveCurrentParams / loadSavedParams /
//   loadNamedConfig / deleteSavedConfig / renameSavedConfig / previewSavedConfig /
//   downloadConfigFile / importConfigFile
//
// 依赖（工厂注入）。保持零行为变更。

import { $, escapeHtml } from '../utils/dom.js';

export function createSavedConfigsActions({
  state,
  api,
  showToast,
  renderView,
  renderNavigator,
  saveDraft,
  resetTransientState,
  updateJSONPreview,
  enforceLycorisDoraSafety,
  mergeConfigPatch,
  // schema
  createDefaultConfig,
  TRAINING_TYPES,
  SCHEDULER_TYPE_TO_VALUE,
  // utils
  parseSimpleToml,
  configToToml,
  buildRunConfig,
  // constants
  DRAFT_STORAGE_KEY,
}) {
  function getTrainingTypeEntry(typeId) {
    return TRAINING_TYPES.find((item) => item.id === typeId) || null;
  }

  function getAvailableTrainingType(typeId) {
    const targetType = getTrainingTypeEntry(typeId);
    return targetType && !targetType.disabled ? targetType : null;
  }

  function looksLikeForeignToml(text) {
    const sample = String(text || '');
    return (
      /\[model_arguments\]|\[dataset_arguments\]|\[additional_network_arguments\]|\[optimizer_arguments\]|\[training_arguments\]|\[saving_arguments\]/i.test(sample)
      || /network_module\s*=\s*["']networks\./i.test(sample)
      // musubi-tuner: dataset [[datasets]] image/video dirs, or train --config_file `dit =`
      || /\b(image_directory|video_directory|image_jsonl_file|video_jsonl_file)\s*=/i.test(sample)
      || /^\s*dit\s*=/im.test(sample)
      || /\bdataset_config\s*=/i.test(sample)
      // diffusion-pipe: train [model]/[adapter] or dataset [[directory]]
      || /\bmicro_batch_size_per_gpu\s*=/i.test(sample)
      || /\bpipeline_stages\s*=/i.test(sample)
      || /\[model\][\s\S]{0,400}\b(ckpt_path|diffusers_path|transformer_path)\s*=/i.test(sample)
      || /\[adapter\][\s\S]{0,200}\brank\s*=/i.test(sample)
      || /\[\[directory\]\]/i.test(sample)
      || /\bframe_buckets\s*=/i.test(sample)
    );
  }

  function looksLikeSimpleTunerJson(obj) {
    // multidatabackend array
    if (Array.isArray(obj) && obj.length) {
      let hits = 0;
      for (const entry of obj) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        if ('instance_data_dir' in entry || entry.dataset_type === 'text_embeds') hits += 1;
        if ((entry.type === 'local' || entry.type === 'aws' || entry.type === 'csv')
          && ('id' in entry || 'resolution' in entry)) hits += 1;
      }
      return hits >= 1;
    }
    if (!obj || typeof obj !== 'object') return false;
    let body = obj;
    if (obj.config && typeof obj.config === 'object' && !Array.isArray(obj.config)
      && ('_metadata' in obj || Object.keys(obj.config).some((k) => String(k).startsWith('--')))) {
      body = obj.config;
    }
    const keys = Object.keys(body || {});
    const dash = keys.filter((k) => String(k).startsWith('--')).length;
    const bare = new Set(keys.map((k) => String(k).replace(/^-+/, '')));
    const stMarkers = [
      'model_family', 'data_backend_config', 'lora_type', 'lycoris_config',
      'resolution_type', 'aspect_bucket_rounding', 'checkpoint_step_interval',
      'validation_step_interval', 'hub_model_id', 'tracker_project_name', 'disable_benchmark',
    ];
    let markerHits = 0;
    for (const m of stMarkers) {
      if (bare.has(m)) markerHits += 1;
    }
    if (dash >= 3 && (markerHits >= 1 || bare.has('pretrained_model_name_or_path')
      || bare.has('model_family') || bare.has('learning_rate'))) {
      return true;
    }
    if (markerHits >= 2) return true;
    if ('_metadata' in obj && obj.config && typeof obj.config === 'object'
      && (bare.has('model_family') || bare.has('pretrained_model_name_or_path'))) {
      return true;
    }
    return false;
  }

  function looksLikeForeignKohyaJson(obj) {
    if (looksLikeSimpleTunerJson(obj)) return true;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const wrappers = ['args', 'config', 'parameters', 'params', 'train', 'training', 'settings', 'options'];
    let data = obj;
    let unwrapped = false;
    const signalKeys = [
      'pretrained_model_name_or_path', 'train_data_dir', 'network_dim', 'network_module',
      'learning_rate', 'max_train_steps', 'max_train_epochs', 'output_dir', 'optimizer_type',
      'model_arguments', 'dataset_arguments', 'additional_network_arguments', 'training_arguments',
    ];
    const lulynxOpts = new Set([
      'adamw', 'adamw_8bit', 'lion', 'lion_8bit', 'sgd', 'sgd_8bit', 'dadaptation', 'prodigy',
    ]);
    let rootHits = 0;
    for (const k of signalKeys) {
      if (k in data) rootHits += 1;
    }
    if (rootHits < 2) {
      for (const w of wrappers) {
        const inner = data[w];
        if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
          let hits = 0;
          for (const k of signalKeys) {
            if (k in inner) hits += 1;
          }
          if (hits >= 2) {
            data = inner;
            rootHits = hits;
            unwrapped = true;
            break;
          }
        }
      }
    }
    if (data.model_arguments && typeof data.model_arguments === 'object') return true;
    const mod = data.network_module;
    if (typeof mod === 'string' && (mod.startsWith('networks.') || mod.startsWith('lycoris.'))) {
      return true;
    }
    const opt = data.optimizer_type;
    if (typeof opt === 'string' && /^(AdamW8bit|AdamW|Lion8bit|Lion|Prodigy|DAdaptation|SGDNesterov8bit|SGDNesterov)$/i.test(opt)) {
      return true;
    }
    // Wrapper peel + training keys → foreign (even if values already look normalized)
    if (unwrapped && rootHits >= 2) return true;
    // Flat foreign: several signal keys AND at least one foreign-looking value
    if (rootHits >= 3) {
      if (typeof mod === 'string' && mod && mod !== 'lora' && mod !== 'lycoris') return true;
      if (typeof opt === 'string' && opt && !lulynxOpts.has(String(opt).toLowerCase())) return true;
      if ('vae' in data && !('vae_path' in data)) return true;
      if ('lr_scheduler' in data && !('lr_scheduler_type' in data)) return true;
    }
    return false;
  }

  async function importExternalViaApi(file) {
    if (typeof api.importExternalConfig !== 'function') {
      throw new Error('当前后端未提供外部配置导入接口。');
    }
    const response = await api.importExternalConfig(file);
    if (response?.status === 'error') {
      throw new Error(response.message || '外部配置导入失败。');
    }
    const data = response?.data ?? response ?? {};
    const parsed = data.config && typeof data.config === 'object' ? data.config : null;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('外部配置导入结果为空。');
    }
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const mappedCount = Number(data.mapped_count || Object.keys(parsed).length || 0);
    return { parsed, notes, mappedCount, formatName: data.format_name || '' };
  }

  function setupImportConfig() {
    if (state.importInputBound) {
      return;
    }
    const input = $('#config-file-input');
    if (!input) {
      return;
    }
    // Accept Kohya/anima/musubi/DP TOML / ST·Kohya JSON / ai-toolkit YAML
    try {
      input.setAttribute('accept', '.toml,.json,.yaml,.yml,application/json,application/x-yaml,text/yaml');
    } catch (_e) {
      /* ignore */
    }
    state.importInputBound = true;
    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const lower = String(file.name || '').toLowerCase();
        let parsed;
        let externalNotes = [];
        let externalMeta = null;

        if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
          externalMeta = await importExternalViaApi(file);
          parsed = externalMeta.parsed;
          externalNotes = externalMeta.notes;
        } else if (lower.endsWith('.toml')) {
          const text = await file.text();
          if (looksLikeForeignToml(text)) {
            externalMeta = await importExternalViaApi(new File([text], file.name, { type: file.type || 'application/toml' }));
            parsed = externalMeta.parsed;
            externalNotes = externalMeta.notes;
          } else {
            try {
              parsed = parseSimpleToml(text);
            } catch (localErr) {
              externalMeta = await importExternalViaApi(new File([text], file.name, { type: file.type || 'application/toml' }));
              parsed = externalMeta.parsed;
              externalNotes = externalMeta.notes;
            }
          }
        } else if (lower.endsWith('.json')) {
          const text = await file.text();
          let localObj = null;
          try {
            localObj = JSON.parse(text);
          } catch (jsonErr) {
            throw new Error('JSON 解析失败');
          }
          // Foreign Kohya-like JSON (networks.*, AdamW8bit, args wrapper…) → backend map
          // Pure lulynx draft / saved preset JSON → keep local keys as-is
          if (looksLikeForeignKohyaJson(localObj)) {
            externalMeta = await importExternalViaApi(
              new File([text], file.name, { type: file.type || 'application/json' }),
            );
            parsed = externalMeta.parsed;
            externalNotes = externalMeta.notes;
          } else {
            parsed = localObj;
          }
        } else {
          const text = await file.text();
          parsed = JSON.parse(text);
        }
        // ── 旧格式兼容：把 network_args 数组反向映射回独立 UI 字段 ──
        if (Array.isArray(parsed.network_args) && !parsed.lycoris_algo) {
          const argMap = {};
          for (const item of parsed.network_args) {
            const eq = String(item).indexOf('=');
            if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
          }
          if (argMap.algo) {
            parsed.lycoris_algo = argMap.algo;
            if (!parsed.network_module) parsed.network_module = 'lycoris.kohya';
          }
          if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); parsed.conv_dim = Number.isNaN(n) ? '' : n; }
          if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); parsed.conv_alpha = Number.isNaN(n) ? '' : n; }
          if (argMap.preset != null) parsed.lycoris_preset = argMap.preset;
          if (argMap.dropout != null) { const n = Number(argMap.dropout); parsed.dropout = Number.isNaN(n) ? '' : n; }
          if (argMap.rank_dropout != null) { const n = Number(argMap.rank_dropout); parsed.rank_dropout = Number.isNaN(n) ? '' : n; }
          if (argMap.module_dropout != null) { const n = Number(argMap.module_dropout); parsed.module_dropout = Number.isNaN(n) ? '' : n; }
          if (argMap.train_norm != null) parsed.train_norm = argMap.train_norm === 'True';
          if (argMap.use_tucker != null) parsed.use_tucker = argMap.use_tucker === 'True';
          else if (argMap.use_cp != null) parsed.use_tucker = argMap.use_cp === 'True';
          else if (argMap.use_conv_cp != null) parsed.use_tucker = argMap.use_conv_cp === 'True';
    else if (argMap.disable_conv_cp != null) parsed.use_tucker = argMap.disable_conv_cp !== 'True';
          if (argMap.use_scalar != null) parsed.use_scalar = argMap.use_scalar === 'True';
          if (argMap.block_size != null) { const n = Number(argMap.block_size); parsed.block_size = Number.isNaN(n) ? '' : n; }
          if (argMap.rescaled != null) parsed.rescaled = argMap.rescaled === 'True';
          if (argMap.constraint != null) { const n = Number(argMap.constraint); parsed.constraint = Number.isNaN(n) ? '' : n; }
          else if (argMap.constrain != null) { const n = Number(argMap.constrain); parsed.constraint = Number.isNaN(n) ? '' : n; }
          if (argMap.rs_lora != null) parsed.rs_lora = argMap.rs_lora === 'True';
          if (argMap.factor != null){ const n = Number(argMap.factor); parsed.lokr_factor = Number.isNaN(n) ? '' : n; }
          if (argMap.dora_wd != null) parsed.dora_wd = argMap.dora_wd === 'True';
          if (argMap.wd_on_output != null) parsed.wd_on_output = argMap.wd_on_output === 'True';
          if (argMap.bypass_mode != null) parsed.bypass_mode = argMap.bypass_mode === 'True';
          if (argMap.decompose_both != null) parsed.decompose_both = argMap.decompose_both === 'True';
          if (argMap.full_matrix != null) parsed.full_matrix = argMap.full_matrix === 'True';
          if (argMap.unbalanced_factorization != null) parsed.unbalanced_factorization = argMap.unbalanced_factorization === 'True';
          if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); parsed.scale_weight_norms = Number.isNaN(n) ? '' : n; }
          const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'preset', 'dropout', 'rank_dropout', 'module_dropout', 'train_norm', 'use_tucker', 'use_scalar', 'block_size', 'rescaled', 'constraint', 'constrain', 'rs_lora', 'factor', 'dora_wd', 'wd_on_output', 'bypass_mode', 'decompose_both', 'full_matrix', 'unbalanced_factorization', 'scale_weight_norms', 'disable_conv_cp', 'use_cp', 'use_conv_cp']);
          const remaining =parsed.network_args.filter(a => { const k = String(a).split('=')[0].trim(); return !structured.has(k); });
          if (remaining.length > 0) parsed.network_args_custom = remaining.join('\n');
          delete parsed.network_args;
        }
        // 旧格式：optimizer_args 数组 → 还原 Prodigy 字段
        if (Array.isArray(parsed.optimizer_args) && !parsed.optimizer_args_custom) {
          const remainingArgs = [];
          for (const arg of parsed.optimizer_args) {
            const eqIdx = String(arg).indexOf('=');
            const k = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
            const v = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
            if (k === 'd_coef') { parsed.prodigy_d_coef = v; }
            else if (k === 'd0') { parsed.prodigy_d0 = v; }
            else { remainingArgs.push(String(arg)); }
          }
          if (remainingArgs.length > 0) parsed.optimizer_args_custom = remainingArgs.join('\n');
          delete parsed.optimizer_args;
        }
        // 旧格式：lr_scheduler_args 数组 → string
        if (Array.isArray(parsed.lr_scheduler_args)) {
          parsed.lr_scheduler_args = parsed.lr_scheduler_args.join('\n');
        }
        // 自定义调度器类路径 → UI 下拉显示值
        if (typeof parsed.lr_scheduler_type === 'string') {
          const schedulerType = parsed.lr_scheduler_type.trim();
          const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
          if (bridgedScheduler) {
            parsed.lr_scheduler = bridgedScheduler;
            delete parsed.lr_scheduler_type;
          }
        }
        // 导入文件时先重置为默认配置，防止旧参数残留
        const importType = parsed.model_train_type || state.activeTrainingType;
        if (importType &&importType !== state.activeTrainingType) {
          const switched = window.switchTrainingType(importType);
          if (!switched) {
            parsed.model_train_type = state.activeTrainingType;
          }
        }
        state.config = createDefaultConfig(state.activeTrainingType);
        mergeConfigPatch(parsed);
        state.hasLocalDraft = true;
        saveDraft();
        renderView(state.activeModule);
        if (externalMeta) {
          const notePreview = externalNotes
            .filter((line) => line && !String(line).startsWith('==='))
            .slice(0, 4)
            .join('；');
          const head = `已从${externalMeta.formatName || '外部配置'}填入 ${externalMeta.mappedCount || Object.keys(parsed).length} 个字段`;
          showToast(notePreview ? `${head}。${notePreview}` : `${head}，请核对路径与未映射项。`);
        } else {
          showToast('配置文件已导入。');
        }
      } catch (error) {
        showToast(error.message || '导入配置文件失败。');
      } finally {
        input.value = '';
      }
    });
  }

  function switchTrainingType(typeId) {
    if (typeId === state.activeTrainingType) return true;
    const targetType = getTrainingTypeEntry(typeId);
    if (!targetType) {
      showToast('该训练类型已从当前 WebUI 入口移除。');
      return false;
    }
    if (targetType?.disabled) {
      showToast(targetType.disabledReason || '该训练类型暂未开放。');
      return false;
    }
    state.activeTrainingType = typeId;
    localStorage.setItem('sd-rescripts:training-type', typeId);
    // Update global training type for model arch detection
    if (window.currentTrainingType !== undefined) {
      window.currentTrainingType = typeId;
    }
    // 重建配置，保留共用字段的当前值
    const oldConfig = { ...state.config };
    state.config = createDefaultConfig(typeId);
    for (const key of Object.keys(state.config)) {
      if (key === 'model_train_type') continue;
      if (oldConfig[key] !== undefined && oldConfig[key] !== '') {
        state.config[key] = oldConfig[key];
      }
    }
    enforceLycorisDoraSafety();
    state.hasLocalDraft = false;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    resetTransientState();
    saveDraft();
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
    return true;
  }

  async function saveCurrentParams() {
    const defaultName = state.config.output_name || state.config.pretrained_model_name_or_path?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '';
    const modal = $('#builtin-picker-modal');
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!modal || !title || !pathEl || !list) return;

    title.textContent = '保存当前参数';
    pathEl.textContent = '请输入保存名称，保存后会直接写入本地文件。';
    list.innerHTML = `
      <div class="save-params-form">
        <input type="text" id="save-params-name" class="text-input" value="${escapeHtml(defaultName)}" placeholder="输入参数名称">
        <button class="btn btn-primary btn-sm" type="button" id="save-params-confirm">保存</button>
      </div>
    `;
    modal.classList.add('open');

    const nameInput = $('#save-params-name');
   const confirmBtn = $('#save-params-confirm');

    // 预加载已存在的名称集合，用于同名检测
    const existingNames = new Set();
    try {
      const listResp = await api.listSavedConfigs();
      const configs = listResp?.data?.configs || [];
      for (const item of configs) {
        if (item && typeof item.name === 'string') existingNames.add(item.name);
      }
    } catch (_) {
      // 获取列表失败不阻断保存流程，后端仍会接收请求
    }

    const submit = async () => {
      const name = nameInput?.value?.trim();
      if (!name) {
        if (pathEl) pathEl.textContent = '请输入保存名称。';
        nameInput?.focus();
        return;
      }
      // 同名双重确认，避免静默覆盖已保存的参数
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
      if (existingNames.has(name) || existingNames.has(safeName)) {
        const confirmed = window.confirm(`已存在同名参数：“${name}”。\n是否覆盖原有保存内容？\n如需保留原有参数，请取消后修改名称。`);
        if (!confirmed) {
          if (pathEl) pathEl.textContent = '为避免覆盖原有参数，请修改名称后重试。';
          if (nameInput) {
            nameInput.focus();
            nameInput.select();
          }
          return;
        }
      }
      try {
        // 保存原始 UI 状态（而非 buildRunConfig 转换后的后端 payload），
        // 这样 LyCORIS 算法、日志前缀等 UI 专属字段不会丢失
        const payload = {};
for (const [k, v] of Object.entries(state.config)) {
          if (v !== '' && v != null) payload[k] = v;
        }
        payload.__training_type__ = state.activeTrainingType;
        await api.saveConfig(name, payload);
        saveDraft();
        state.hasLocalDraft = true;
        modal.classList.remove('open');
        showToast('参数已保存：' + name);
        if (state.activeModule === 'config') {
          renderView('config');
  } else {
          renderNavigator();
        }
      } catch (error) {
        if (pathEl) pathEl.textContent = error.message || '保存失败。';
        if (nameInput) {
          nameInput.style.borderColor = 'var(--danger, #d9534f)';
          nameInput.focus();
          nameInput.select();
        }
      }
    };

    // 不用 once：同名确认被取消后需要允许再次点击/回车提交
    confirmBtn?.addEventListener('click', submit);
   nameInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    nameInput?.focus();
    nameInput?.select();
  }

  async function loadSavedParams() {
    const modal = $('#builtin-picker-modal');
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!modal || !title || !pathEl || !list) return;

    title.textContent = '读取已保存参数';
    pathEl.textContent = '选择一个已保存的参数，点击后立即载入。';
    list.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `<button class="btn btn-outline btn-sm" type="button" id="builtin-picker-cancel" onclick="closeBuiltinPicker()">取消</button>`;
    modal.classList.add('open');

try {
      const response = await api.listSavedConfigs();
      const configs = response?.data?.configs || [];
      if (!configs.length) {
        list.innerHTML = '<div class="builtin-picker-empty"><span>未检测到内容</span></div>';
        return;
      }
 list.innerHTML = configs.map((configItem) => `
        <div class="builtin-picker-item" type="button">
          <span class="builtin-picker-name">${escapeHtml(configItem.name)}</span>
          <span class="builtin-picker-time">${new Date(configItem.time).toLocaleString('zh-CN')}</span>
          <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="previewSavedConfig('${escapeHtml(configItem.name)}')">预览</button>
          <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="loadNamedConfig('${escapeHtml(configItem.name)}')">载入</button>
          <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="event.stopPropagation(); renameSavedConfig('${escapeHtml(configItem.name)}')">重命名</button>
          <button class="builtin-picker-delete-btn" type="button" title="删除" onclick="event.stopPropagation(); deleteSavedConfig('${escapeHtml(configItem.name)}')">✕</button>
        </div>
      `).join('');
    } catch (error) {
      pathEl.textContent = error.message|| '读取列表失败。';
      list.innerHTML= '<div class="builtin-picker-empty"><span>未检测到内容</span></div>';
    }
  }

  async function loadNamedConfig(name) {
    const pathEl = $('#builtin-picker-path');
    try {
      const response = await api.loadSavedConfig(name);
      const data = response?.data;
      if (!data) {
        throw new Error('参数内容为空。');
      }
      // 自动切换训练类型
      const savedType = data.__training_type__ || data.model_train_type || '';
      delete data.__training_type__;

      // ── 旧格式兼容：把 buildRunConfig 产出的后端字段反向映射回 UI 字段 ──
      // 旧保存格式中 LyCORIS 参数被合并进 network_args 数组，日志/优化器等 UI 字段被删除
      if (Array.isArray(data.network_args) && !data.lycoris_algo) {
        const argMap = {};
        for (const item of data.network_args) {
          const eq = String(item).indexOf('=');
          if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
        }
        if (argMap.algo) {
          data.lycoris_algo = argMap.algo;
          if (!data.network_module) data.network_module = 'lycoris.kohya';
   }
  if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); data.conv_dim = Number.isNaN(n) ? '' : n; }
        if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); data.conv_alpha = Number.isNaN(n) ? '' : n; }
        if (argMap.preset != null) data.lycoris_preset = argMap.preset;
        if (argMap.dropout != null) { const n = Number(argMap.dropout); data.dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.rank_dropout != null) { const n = Number(argMap.rank_dropout); data.rank_dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.module_dropout != null) { const n = Number(argMap.module_dropout); data.module_dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.train_norm != null) data.train_norm =argMap.train_norm === 'True';
        if (argMap.use_tucker != null) data.use_tucker = argMap.use_tucker === 'True';
        else if (argMap.use_cp != null) data.use_tucker = argMap.use_cp === 'True';
        else if (argMap.use_conv_cp != null) data.use_tucker = argMap.use_conv_cp === 'True';
        else if (argMap.disable_conv_cp != null) data.use_tucker = argMap.disable_conv_cp !== 'True';
        if (argMap.use_scalar != null) data.use_scalar = argMap.use_scalar === 'True';
        if (argMap.block_size != null) { const n = Number(argMap.block_size); data.block_size = Number.isNaN(n) ? '' : n; }
        if (argMap.rescaled != null) data.rescaled = argMap.rescaled === 'True';
        if (argMap.constraint != null) { const n = Number(argMap.constraint); data.constraint = Number.isNaN(n) ? '' : n; }
        else if (argMap.constrain != null) { const n = Number(argMap.constrain); data.constraint = Number.isNaN(n) ? '' : n; }
        if(argMap.rs_lora != null) data.rs_lora = argMap.rs_lora === 'True';
        if (argMap.factor != null) { const n = Number(argMap.factor); data.lokr_factor = Number.isNaN(n) ? '' : n; }
        if (argMap.dora_wd != null) data.dora_wd = argMap.dora_wd === 'True';
      if (argMap.wd_on_output != null) data.wd_on_output = argMap.wd_on_output === 'True';
        if (argMap.bypass_mode != null) data.bypass_mode = argMap.bypass_mode === 'True';
        if (argMap.decompose_both != null) data.decompose_both = argMap.decompose_both === 'True';
        if (argMap.full_matrix != null) data.full_matrix = argMap.full_matrix === 'True';
        if (argMap.unbalanced_factorization != null) data.unbalanced_factorization = argMap.unbalanced_factorization === 'True';
        if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); data.scale_weight_norms = Number.isNaN(n) ? '' : n; }
        // 剩余非结构化的 args 放入 network_args_custom
        const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'preset', 'dropout', 'rank_dropout', 'module_dropout', 'train_norm', 'use_tucker', 'use_scalar', 'block_size', 'rescaled', 'constraint', 'constrain', 'rs_lora', 'factor', 'dora_wd', 'wd_on_output', 'bypass_mode', 'decompose_both', 'full_matrix', 'unbalanced_factorization', 'scale_weight_norms', 'disable_conv_cp', 'use_cp', 'use_conv_cp']);
        const remaining = data.network_args.filter(a => { const k = String(a).split('=')[0].trim(); return !structured.has(k); });
        if (remaining.length > 0) data.network_args_custom = remaining.join('\n');
        delete data.network_args;
      }
      // 旧格式：optimizer_args数组 → optimizer_args_custom
      if (Array.isArray(data.optimizer_args) && !data.optimizer_args_custom) {
       // Prodigy 特有字段还原
        const prodigyRestore = {};
        const remainingArgs = [];
        for (const arg of data.optimizer_args) {
          const eqIdx = String(arg).indexOf('=');
          const k = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
      const v = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
          if (k === 'd_coef') { prodigyRestore.prodigy_d_coef = v; }
          else if (k === 'd0') { prodigyRestore.prodigy_d0 = v; }
          else { remainingArgs.push(String(arg)); }
        }
        if (prodigyRestore.prodigy_d_coef != null) data.prodigy_d_coef = prodigyRestore.prodigy_d_coef;
   if (prodigyRestore.prodigy_d0 != null) data.prodigy_d0 = prodigyRestore.prodigy_d0;
        if (remainingArgs.length > 0) data.optimizer_args_custom =remainingArgs.join('\n');
        delete data.optimizer_args;
      }
      // 旧格式：lr_scheduler_args 数组 → string
      if (Array.isArray(data.lr_scheduler_args)) {
        data.lr_scheduler_args = data.lr_scheduler_args.join('\n');
      }
      // 自定义调度器类路径 → UI 下拉显示值
      if (typeof data.lr_scheduler_type === 'string') {
        const schedulerType = data.lr_scheduler_type.trim();
        const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
        if (bridgedScheduler) {
          data.lr_scheduler = bridgedScheduler;
          delete data.lr_scheduler_type;
        }
      }
      // 旧格式：base_weights 数组 → string
      if (Array.isArray(data.base_weights)) {
        data.base_weights = data.base_weights.join('\n');
        if (!data.enable_base_weight) data.enable_base_weight = true;
      }

      enforceLycorisDoraSafety(data);

      if (savedType && savedType !== state.activeTrainingType) {
        const targetType = getAvailableTrainingType(savedType);
        if (targetType) {
          state.activeTrainingType = savedType;
          localStorage.setItem('sd-rescripts:training-type', savedType);
          state.config = createDefaultConfig(savedType);
        } else {
          data.model_train_type = state.activeTrainingType;
          showToast(`参数中的训练类型已移除，已按当前类型载入：${state.activeTrainingType}`);
        }
      }
      mergeConfigPatch(data);
      state.hasLocalDraft = true;
      resetTransientState();
      saveDraft();
      window.closeBuiltinPicker();
      showToast(`已载入参数：${name}${savedType ? ` (${savedType})` : ''}`);
      if (state.activeModule === 'config') {
        renderView('config');
      } else {
        renderNavigator();
      }
    } catch (error) {
      if (pathEl) {
        pathEl.textContent = error.message || '读取参数失败。';
      }
    }
  }

  async function deleteSavedConfig(name) {
    try {
      await api.deleteSavedConfig(name);
      showToast('已删除：' + name);
      window.loadSavedParams();
    } catch (error) {
      showToast(error.message || '删除失败');
    }
  }

  async function renameSavedConfig(oldName) {
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!title || !pathEl || !list) return;

    title.textContent = '重命名参数';
    pathEl.textContent = `当前名称：${oldName}`;
    list.innerHTML = `
      <div style="padding: 16px;">
        <input type="text" id="rename-config-input" value="${escapeHtml(oldName)}"
          style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.88rem;background:var(--bg-main);color:var(--text-main);"
          placeholder="输入新名称" />
      </div>
    `;
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `
      <button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">← 返回列表</button>
      <button class="btn btn-primary btn-sm" type="button" id="rename-config-confirm">确认重命名</button>
    `;

    const input = $('#rename-config-input');
    const confirmBtn = $('#rename-config-confirm');

    const doRename = async () => {
      const newName = input?.value?.trim();
      if (!newName) {
        pathEl.textContent = '请输入新名称。';
        input?.focus();
        return;
      }
      if (newName === oldName) {
        window.loadSavedParams();
        return;
      }
      try {
        await api.renameSavedConfig(oldName, newName);
        showToast('已重命名：' + oldName +' → ' + newName);
        window.loadSavedParams();
      } catch (error) {
        pathEl.textContent = error.message || '重命名失败。';
        if (input) {
          input.style.borderColor = 'var(--danger, #d9534f)';
          input.focus();
          input.select();
        }
      }
    };

    confirmBtn?.addEventListener('click', doRename, { once: true });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        doRename();
      }
    }, { once: true });
    input?.focus();
    input?.select();
  }

  async function previewSavedConfig(name) {
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!title || !pathEl || !list) return;

    title.textContent = `参数预览：${name}`;
    pathEl.textContent = '加载中...';
    list.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `<button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">← 返回列表</button><button class="btn btn-outline btn-sm" type="button" id="builtin-picker-cancel" onclick="closeBuiltinPicker()">取消</button>`;

    try {
      const response = await api.loadSavedConfig(name);
      const data = response?.data;
      if (!data) throw new Error('参数内容为空。');
      const entries = Object.entries(data);
      pathEl.textContent = `共 ${entries.length} 个参数`;
      list.innerHTML = `
      <div class="params-preview-list">
          ${entries.map(([k, v]) => {
            const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
            return `<div class="params-preview-row"><span class="params-key">${escapeHtml(k)}</span><span class="params-val">${escapeHtml(display)}</span></div>`;
          }).join('')}
        </div>
      `;
    } catch (error) {
      pathEl.textContent = error.message || '预览失败。';
    }
  }

  function downloadConfigFile() {
    const config = buildRunConfig(state.config, state.activeTrainingType);
    const tomlStr = configToToml(config);
    const blob = new Blob([tomlStr], { type: 'application/toml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.config.output_name || 'config'}-${timestamp}.toml`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importConfigFile() {
    $('#config-file-input')?.click();
  }

  return {
    setupImportConfig,
    switchTrainingType,
    saveCurrentParams,
    loadSavedParams,
    loadNamedConfig,
    deleteSavedConfig,
    renameSavedConfig,
    previewSavedConfig,
    downloadConfigFile,
    importConfigFile,
  };
}
