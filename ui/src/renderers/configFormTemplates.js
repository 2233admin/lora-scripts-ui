import { resolveFieldDesc } from '../schemaFieldI18n.js';
import { escapeHtml } from '../utils/dom.js';
import { getAdapterEntityConflict } from '../schemaCommon.js';
import { renderSemanticRegionCurveEditor } from './semanticRegionCurveEditor.js';

export function renderGhostReplayHelperCard(recorderState = {}) {
  const statusText = recorderState.running
    ? `后台预蒸馏进行中${recorderState.jobProgressText ? ` · ${recorderState.jobProgressText}` : ''}`
    : recorderState.lastOutputPath
      ? `最近输出：${escapeHtml(recorderState.lastOutputPath)}`
      : '生成后的 .lulynx 指纹会自动回填到 Ghost 指纹路径。';
  return `
    <div class="ghost-replay-helper-card">
      <div class="ghost-replay-helper-copy">
        <strong>预蒸馏</strong>
        <span>${escapeHtml(statusText)}</span>
      </div>
      <div class="ghost-replay-helper-actions">
        <button class="btn btn-outline btn-sm" type="button" onclick="openGhostReplayRecorderModal()">
          ${recorderState.running ? '查看进度' : '打开预蒸馏窗口'}
        </button>
      </div>
    </div>
  `;
}

export function getPreviewGroupsForRender(config = {}) {
  const raw = config.preview_groups;
  let groups = [];
  if (Array.isArray(raw)) {
    groups = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      groups = Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      groups = [];
    }
  }
  if (!groups.length) {
    const prompts = String(config.positive_prompts || config.sample_prompts || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const negative = String(config.negative_prompts || config.sample_negative || '');
    groups = (prompts.length ? prompts : ['']).map((prompt, index) => ({
      name: index === 0 ? 'LoRA 对照' : `测试组 ${index + 1}`,
      mode: 'lora',
      prompt,
      negative_prompt: negative,
      seed: config.sample_seed || '',
      lora_weight: 1,
      start_epoch: '',
      start_after_epochs: '',
    }));
  }
  return groups.map((group, index) => ({
    name: group && group.name != null ? String(group.name) : `测试组 ${index + 1}`,
    mode: group && group.mode != null ? String(group.mode) : 'lora',
    prompt: group && group.prompt != null ? String(group.prompt) : '',
    negative_prompt: group && group.negative_prompt != null ? String(group.negative_prompt) : '',
    seed: group && group.seed != null ? String(group.seed) : '',
    lora_weight: group && group.lora_weight != null ? String(group.lora_weight) : '1',
    start_epoch: group && group.start_epoch != null ? String(group.start_epoch) : '',
    start_after_epochs: group && group.start_after_epochs != null ? String(group.start_after_epochs) : '',
  }));
}

export function renderPreviewGroupsField({ field, groups, disabledAttr, disabledCls, modCls, conflictWith, renderHeader, renderFieldDescription, renderConflictHint, lang = 'zh' }) {
  const en = String(lang || 'zh').toLowerCase().startsWith('en');
  const modeOptions = en
    ? [
      ['lora', 'LoRA compare'],
      ['base', 'Base model'],
      ['fit', 'Fit test'],
      ['overfit', 'Overfit test'],
    ]
    : [
      ['lora', 'LoRA 对照'],
      ['base', '底模对照'],
      ['fit', '拟合测试'],
      ['overfit', '过拟合测试'],
    ];
  const cards = groups.map((group, index) => `
    <div class="preview-test-card" style="border:1px solid var(--line, rgba(148,163,184,.35)); border-radius:14px; padding:12px; margin:10px 0; background:rgba(15,23,42,.03);">
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <strong>${en ? `Test group ${index + 1}` : `测试组 ${index + 1}`}</strong>
        <button class="btn btn-outline btn-sm" type="button"${disabledAttr} onclick="removePreviewGroup(${index})">${en ? 'Remove' : '删除'}</button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; align-items:end;">
        <label class="mini-field"><span>${en ? 'Name' : '名称'}</span><input class="text-input" type="text" value="${escapeHtml(group.name)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'name', this.value)"></label>
        <label class="mini-field"><span>${en ? 'Mode' : '模式'}</span><select${disabledAttr} onchange="updatePreviewGroup(${index}, 'mode', this.value)">${modeOptions.map(([value, label]) => `<option value="${value}" ${group.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="mini-field"><span>Seed</span><input class="text-input" type="number" value="${escapeHtml(group.seed)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'seed', this.value)"></label>
        <label class="mini-field"><span>${en ? 'LoRA weight' : 'LoRA 权重'}</span><input class="text-input" type="number" step="0.1" value="${escapeHtml(group.lora_weight)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'lora_weight', this.value)"></label>
        <label class="mini-field"><span>${en ? 'Start epoch N' : '从第 N 轮开始'}</span><input class="text-input" type="number" min="0" step="1" value="${escapeHtml(group.start_epoch)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'start_epoch', this.value)"></label>
        <label class="mini-field"><span>${en ? 'After N epochs' : 'N 轮后开始'}</span><input class="text-input" type="number" min="0" step="1" value="${escapeHtml(group.start_after_epochs)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'start_after_epochs', this.value)"></label>
      </div>
      <label class="mini-field" style="display:block; margin-top:10px;"><span>${en ? 'Positive prompt' : '正向提示词'}</span><textarea class="text-area" rows="3"${disabledAttr} oninput="updatePreviewGroup(${index}, 'prompt', this.value)">${escapeHtml(group.prompt)}</textarea></label>
      <label class="mini-field" style="display:block; margin-top:10px;"><span>${en ? 'Negative prompt' : '反向提示词'}</span><textarea class="text-area" rows="2"${disabledAttr} oninput="updatePreviewGroup(${index}, 'negative_prompt', this.value)">${escapeHtml(group.negative_prompt)}</textarea></label>
    </div>
  `).join('');
  return `
    <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
      ${renderHeader()}
      ${renderFieldDescription(field, lang)}
      ${renderConflictHint(conflictWith)}
      <div class="preview-test-groups">
        ${cards}
        <button class="btn btn-outline" type="button"${disabledAttr} onclick="addPreviewGroup()">${en ? '+ Add test group' : '+ 添加测试组'}</button>
      </div>
    </div>
  `;
}

const SEMANTIC_REGION_OPTIONS = [
  ['face', '面部'], ['head', '头部'], ['hair', '头发'], ['upper_body', '上半身'],
  ['body', '身体'], ['arm', '手臂'], ['hand', '手'], ['leg', '腿'], ['foot', '脚'],
  ['clothing', '服装'], ['subject', '主体'], ['background', '背景'], ['other', '其他'],
];
const SEMANTIC_REGION_SCHEDULE_OPTIONS = [
  ['linear', '线性'], ['ease_in', '后期加速'], ['ease_out', '前期加速'],
  ['smoothstep', '平滑 S 曲线'], ['hold_ramp_hold', '保持-回归-稳定'], ['custom', '自定义曲线'],
];

function semanticRowsForRender(raw) {
  let rows = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { rows = JSON.parse(raw); } catch (_error) { rows = []; }
  }
  if (!Array.isArray(rows) || !rows.length) {
    rows = [{ region: 'face', start_weight: 0.3, schedule: 'linear', end_weight: 1, custom_curve: null }];
  }
  return rows.map((row) => ({
    region: String(row?.region || 'face'),
    start_weight: Number.isFinite(Number(row?.start_weight)) ? Number(row.start_weight) : 0.3,
    schedule: String(row?.schedule || 'linear'),
    end_weight: Number.isFinite(Number(row?.end_weight)) ? Number(row.end_weight) : 1,
    custom_curve: row?.custom_curve || null,
  }));
}

function renderSemanticCoverage(coverage = {}) {
  const entries = Object.entries(coverage || {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  if (!entries.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${entries.map(([region, ratio]) => `<span style="padding:3px 7px;border-radius:999px;background:rgba(56,189,248,.12);font-size:11px">${escapeHtml(region)} ${(Number(ratio) * 100).toFixed(1)}%</span>`).join('')}</div>`;
}

function renderSemanticSegmentationTools(config = {}, ui = {}, disabledAttr = '') {
  const busy = Boolean(ui.busyAction);
  const buttonDisabled = disabledAttr || busy ? ' disabled' : '';
  const statusColor = ui.error ? '#fca5a5' : 'var(--text-muted,#94a3b8)';
  const overlay = ui.overlayUrl ? `
    <figure style="margin:12px 0 0;display:grid;gap:7px">
      <img src="${escapeHtml(ui.overlayUrl)}" alt="随机样本语义分割覆盖图" style="display:block;max-width:100%;max-height:460px;object-fit:contain;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:#0f172a">
      <figcaption style="font-size:11px;color:var(--text-muted,#94a3b8)">${ui.sourceName ? `样本：${escapeHtml(ui.sourceName)}` : '随机数据集样本覆盖图'}</figcaption>
      ${renderSemanticCoverage(ui.coverage)}
    </figure>` : '';
  const cacheId = String(config.semantic_segmentation_cache_id || '').trim();
  return `
    <div data-semantic-segmentation-tools style="margin:10px 0 14px;padding:12px;border:1px solid rgba(56,189,248,.25);border-radius:12px;background:rgba(15,23,42,.18)">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button class="btn btn-outline btn-sm" type="button"${buttonDisabled} onclick="probeSemanticSegmentation()">${ui.busyAction === 'probe' ? '检查中…' : '检查分割模型'}</button>
        <button class="btn btn-outline btn-sm" type="button"${buttonDisabled} onclick="previewSemanticSegmentation()">${ui.busyAction === 'preview' ? '预览中…' : '随机预览'}</button>
        <button class="btn btn-outline btn-sm" type="button"${buttonDisabled} onclick="buildSemanticSegmentationCache()">${ui.busyAction === 'build-cache' ? '构建中…' : '构建缓存'}</button>
        ${cacheId ? `<code title="semantic_segmentation_cache_id" style="font-size:11px;overflow-wrap:anywhere">缓存：${escapeHtml(cacheId)}</code>` : ''}
      </div>
      <div data-semantic-segmentation-status role="status" aria-live="polite" style="margin-top:8px;font-size:12px;color:${statusColor}">${escapeHtml(ui.status || '尚未检查分割模型。')}</div>
      ${overlay}
    </div>`;
}

export function renderSemanticRegionWeightsField({ field, value, config = {}, segmentationUi = {}, disabledAttr = '', disabledCls = '', modCls = '', conflictWith = '', renderHeader, renderFieldDescription, renderConflictHint }) {
  const rows = semanticRowsForRender(value);
  const usedRegions = new Set(rows.map((row) => row.region));
  const rowBlocks = rows.map((row, rowIndex) => {
    const regionOptions = SEMANTIC_REGION_OPTIONS.map(([optionValue, optionLabel]) => {
      const duplicate = optionValue !== row.region && usedRegions.has(optionValue);
      return `<option value="${optionValue}"${row.region === optionValue ? ' selected' : ''}${duplicate ? ' disabled title="该区域已配置"' : ''}>${optionLabel}</option>`;
    }).join('');
    const scheduleOptions = SEMANTIC_REGION_SCHEDULE_OPTIONS.map(([optionValue, optionLabel]) => `<option value="${optionValue}"${row.schedule === optionValue ? ' selected' : ''}>${optionLabel}</option>`).join('');
    const curve = row.schedule === 'custom' ? renderSemanticRegionCurveEditor({ row, rowIndex, disabled: Boolean(disabledAttr) }) : '';
    const startValue = Number(row.start_weight).toFixed(2);
    const endValue = Number(row.end_weight).toFixed(2);
    return `
      <div class="semantic-region-weight-row-block" data-semantic-region-row-block="${rowIndex}" style="min-width:820px;margin-top:${rowIndex ? '10px' : '0'};padding:${curve ? '0 0 2px' : '0'}">
        <div data-semantic-region-row="${rowIndex}" style="display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(150px,1fr) minmax(180px,1.2fr) minmax(150px,1fr) auto auto;gap:8px;align-items:end">
          <label class="mini-field"><span>区域</span><select${disabledAttr} onchange="updateSemanticRegionWeight(${rowIndex}, 'region', this.value)">${regionOptions}</select></label>
          <label class="mini-field"><span style="display:flex;justify-content:space-between;gap:8px">起始权重 <output id="semantic-start-value-${rowIndex}">${startValue}</output></span><input type="range" min="0" max="3" step="0.05" value="${escapeHtml(row.start_weight)}"${disabledAttr} oninput="document.getElementById('semantic-start-value-${rowIndex}').textContent=Number(this.value).toFixed(2);updateSemanticRegionWeight(${rowIndex}, 'start_weight', this.value)" style="width:100%"></label>
          <label class="mini-field"><span>调度策略</span><select${disabledAttr} onchange="updateSemanticRegionWeight(${rowIndex}, 'schedule', this.value)">${scheduleOptions}</select></label>
          <label class="mini-field"><span style="display:flex;justify-content:space-between;gap:8px">终止权重 <output id="semantic-end-value-${rowIndex}">${endValue}</output></span><input type="range" min="0" max="3" step="0.05" value="${escapeHtml(row.end_weight)}"${disabledAttr} oninput="document.getElementById('semantic-end-value-${rowIndex}').textContent=Number(this.value).toFixed(2);updateSemanticRegionWeight(${rowIndex}, 'end_weight', this.value)" style="width:100%"></label>
          <button class="btn btn-outline btn-sm" type="button"${disabledAttr}${usedRegions.size >= SEMANTIC_REGION_OPTIONS.length ? ' disabled' : ''} title="添加区域" aria-label="添加区域" onclick="addSemanticRegionWeight(${rowIndex})" style="min-width:38px">+</button>
          ${rows.length > 1 ? `<button class="btn btn-outline btn-sm" type="button"${disabledAttr} title="删除区域" aria-label="删除区域" onclick="removeSemanticRegionWeight(${rowIndex})" style="min-width:38px">−</button>` : '<span aria-hidden="true" style="width:38px"></span>'}
        </div>
        ${curve}
      </div>`;
  }).join('');
  return `
    <div class="config-group semantic-region-weights-field${modCls}${disabledCls}" data-field-key="${escapeHtml(field.key)}">
      ${renderHeader()}${renderFieldDescription(field)}${renderConflictHint(conflictWith)}
      ${renderSemanticSegmentationTools(config, segmentationUi, disabledAttr)}
      <div data-semantic-region-weights style="overflow-x:auto;padding-bottom:4px">${rowBlocks}</div>
    </div>`;
}
export function renderFieldDescription(field, lang = 'zh') {
  const desc = resolveFieldDesc(field, lang) || field.desc || '';
  const normal = desc ? `<p class="field-desc">${escapeHtml(desc)}</p>` : '';
  const important = field.importantDesc ? `<p class="field-desc field-desc-strong">${escapeHtml(field.importantDesc || '')}</p>` : '';
  return normal + important;
}

export function toBool(value) {
  if (value === true || value === 1) return true;
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export function toNum(value) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

export function getFieldConflict(field, config = {}) {
  const key = field.key;
  const value = config[key];
  const isActive = field.type === 'boolean'
    ? toBool(value)
    : key === 'swap_granularity'
      ? Boolean(String(value ?? 'off').trim()) && String(value ?? 'off').trim() !== 'off'
      : (field.type === 'number' || field.type === 'slider')
        ? toNum(value) > 0
        : Boolean(String(value ?? '').trim());

  // 适配器实体硬互斥（已开字段可关；未开且被压制则 disabled + 提示）
  const adapterConflict = getAdapterEntityConflict(key, config);
  if (adapterConflict) return adapterConflict;

  // BlockSkip 固定计划 vs Adaptive Caching：禁止再开 Adaptive；已开可关
  if (key === 'adaptive_caching_enabled' && !isActive) {
    const reducer = String(config.dit_compute_reducer_strategy || 'none').trim().toLowerCase();
    if (reducer === 'blockskip') return 'DiT BlockSkip';
  }

  // TurboCore CUDA 顶栏 vs Triton optimizer step：顶栏开时锁定 Triton 为 off
  if (key === 'turbocore_optimizer_mode' && toBool(config.turbocore_enabled)) {
    return 'TurboCore（顶栏 CUDA）';
  }

  if (isActive) return '';

  const cacheText = toBool(config.cache_text_encoder_outputs);
  const cacheLatents = toBool(config.cache_latents);
  const shuffleCaption = toBool(config.shuffle_caption);
  const shuffleCaptionTagsOnly = toBool(config.shuffle_caption_tags_only);
  const captionDropout = toNum(config.caption_dropout_rate) > 0;
  const captionTagDropout = toNum(config.caption_tag_dropout_rate) > 0;
  const captionDropoutEvery = toNum(config.caption_dropout_every_n_epochs) > 0;
  const tokenWarmup = toNum(config.token_warmup_step) > 0;
  const trainsTextEncoder = !toBool(config.network_train_unet_only);
  const unetOnly = toBool(config.network_train_unet_only);
  const textEncoderOnly = toBool(config.network_train_text_encoder_only);
  const flowEnabled = toBool(config.flow_model) || String(config.flow_model || '').trim() === 'rectified_flow' || String(config.flow_model || '').trim() === 'cfm';
  const vParameterization = toBool(config.v_parameterization);
  const swapMode = String(config.swap_granularity || 'off').trim().toLowerCase().replace('-', '_');
  const swapActive = swapMode !== '' && swapMode !== 'off';
  const moduleOffload = toBool(config.module_offload_enabled);
  const vramSwapToRam = toBool(config.vram_swap_to_ram);
  const torchCompile = toBool(config.torch_compile);
  const distributed = toBool(config.enable_distributed_training) || toBool(config.enable_distributed) || toNum(config.num_processes) > 1 || toNum(config.num_machines) > 1;
  const deepspeed = toBool(config.deepspeed);
  const safeFallback = toBool(config.safe_fallback) || toBool(config.newbie_safe_fallback);

  if (key === 'shuffle_caption' && cacheText) return '缓存文本编码器输出';
  if (key === 'shuffle_caption_tags_only' && cacheText) return '缓存文本编码器输出';
  if (key === 'caption_dropout_rate' && cacheText) return '缓存文本编码器输出';
  if (key === 'caption_tag_dropout_rate' && cacheText) return '缓存文本编码器输出';
  if (key === 'caption_dropout_every_n_epochs' && cacheText) return '缓存文本编码器输出';
  if (key === 'token_warmup_step' && cacheText) return '缓存文本编码器输出';

  if (key === 'cache_text_encoder_outputs') {
    const blockers = [];
    if (shuffleCaption) blockers.push('随机打乱标签');
    if (shuffleCaptionTagsOnly) blockers.push('仅打乱 Tag 部分');
    if (captionDropout) blockers.push('全部标签丢弃概率');
    if (captionTagDropout) blockers.push('按标签丢弃概率');
    if (captionDropoutEvery) blockers.push('每 N 轮丢弃标签');
    if (tokenWarmup) blockers.push('Token 预热步数');
    if (trainsTextEncoder) blockers.push('训练文本编码器');
    if (blockers.length) return blockers.join(' / ');
  }

  if (key === 'cache_text_encoder_outputs_to_disk' && !cacheText) return '缓存文本编码器输出';
  if (key === 'cache_latents_to_disk' && !cacheLatents) return '缓存 Latent';
  if (key === 'cache_latents' && toBool(config.cache_latents_to_disk)) return '缓存 Latent 到磁盘';
  if (key === 'network_train_unet_only' && textEncoderOnly) return '仅训练文本编码器';
  if (key === 'network_train_text_encoder_only' && unetOnly) return '仅训练 U-Net / DiT';
  if (key === 'full_fp16' && toBool(config.full_bf16)) return '完全 BF16';
  if (key === 'full_fp16' && vramSwapToRam) return 'VRAM Swap to RAM';
  if (key === 'full_bf16' && toBool(config.full_fp16)) return '完全 FP16';
  if (key === 'full_bf16' && vramSwapToRam) return 'VRAM Swap to RAM';
  if (key === 'noise_offset' && toNum(config.multires_noise_iterations) > 0) return '多分辨率噪声迭代';
  if (key === 'multires_noise_iterations' && toNum(config.noise_offset) > 0) return '噪声偏移';
  if (key === 'flow_model' && vParameterization) return 'V 参数化';
  if (key === 'v_parameterization' && flowEnabled) return 'Rectified Flow';
  if (key === 'vram_swap_to_ram') {
    const blockers = [];
    if (swapActive) blockers.push('显存交换模式');
    if (moduleOffload) blockers.push('模块级 Offload');
    if (toBool(config.full_fp16)) blockers.push('完全 FP16');
    if (toBool(config.full_bf16)) blockers.push('完全 BF16');
    if (distributed) blockers.push('分布式训练');
    if (deepspeed) blockers.push('DeepSpeed');
    if (blockers.length) return blockers.join(' / ');
  }
  if (key === 'swap_granularity') {
    const blockers = [];
    if (moduleOffload) blockers.push('模块级 Offload');
    if (vramSwapToRam) blockers.push('VRAM Swap to RAM');
    if (torchCompile) blockers.push('torch.compile');
    if (safeFallback) blockers.push('OOM 安全回退');
    if (blockers.length) return blockers.join(' / ');
  }
  if (key === 'module_offload_enabled') {
    const blockers = [];
    if (swapActive) blockers.push('显存交换模式');
    if (vramSwapToRam) blockers.push('VRAM Swap to RAM');
    if (torchCompile) blockers.push('torch.compile');
    if (distributed) blockers.push('分布式训练');
    if (deepspeed) blockers.push('DeepSpeed');
    if (toBool(config.gradient_checkpointing)) blockers.push('梯度检查点');
    if (toBool(config.cpu_offload_checkpointing)) blockers.push('CPU 卸载检查点');
    if (safeFallback) blockers.push('OOM 安全回退');
    if (blockers.length) return blockers.join(' / ');
  }
  if (key === 'torch_compile' && (swapActive || moduleOffload)) {
    return [swapActive ? '显存交换模式' : '', moduleOffload ? '模块级 Offload' : ''].filter(Boolean).join(' / ');
  }
  if (key === 'gradient_checkpointing') {
    if (moduleOffload) return '模块级 Offload';
    if (swapMode === 'layer') return 'Layer Swap';
  }
  if (key === 'cpu_offload_checkpointing' && moduleOffload) return '模块级 Offload';
  if (key === 'enable_distributed_training' && (moduleOffload || vramSwapToRam)) {
    return [moduleOffload ? '模块级 Offload' : '', vramSwapToRam ? 'VRAM Swap to RAM' : ''].filter(Boolean).join(' / ');
  }
  if ((key === 'safe_fallback' || key === 'newbie_safe_fallback') && (swapActive || moduleOffload)) {
    return [swapActive ? '显存交换模式' : '', moduleOffload ? '模块级 Offload' : ''].filter(Boolean).join(' / ');
  }
  return '';
}

export function renderConflictHint(conflictWith) {
  if (!conflictWith) return '';
  if (String(conflictWith).startsWith('当前 ')) {
    return `<p class="field-desc field-conflict-hint">${escapeHtml(conflictWith)}，请切换运行时或使用 SDPA/自动。</p>`;
  }
  return `<p class="field-desc field-conflict-hint">与「${escapeHtml(conflictWith)}」互斥，请关闭后开启本选项。</p>`;
}

export function renderNetworkOptionGroup({ title, note, fields, dataFieldKey, config = {}, renderField }) {
  const configuredCount = fields.reduce((count, field) => {
    const value = config[field.key];
    if (field.type === 'boolean') return value ? count + 1 : count;
    return value === undefined || value === null || value === '' ? count : count + 1;
  }, 0);
  const summaryText = configuredCount ? `${configuredCount} 项已设` : '未设置';
  const summaryClass = configuredCount ? '' : ' is-empty';
  const isModified = fields.some((field) => String(config[field.key] ?? '') !== String(field.defaultValue ?? ''));
  const modCls = isModified ? ' field-modified' : '';

  return `
    <details class="config-group collapsible-field collapsible-field-group dataset-layout-full network-group-panel${modCls}" data-field-key="${escapeHtml(dataFieldKey || 'network-option-group')}">
      <summary class="collapsible-field-summary">
        <span class="collapsible-field-summary-main">
          <span class="collapsible-field-title">${escapeHtml(title)}</span>
          ${note ? `<span class="collapsible-field-note">${escapeHtml(note)}</span>` : ''}
        </span>
        <span class="collapsible-field-value${summaryClass}">${escapeHtml(summaryText)}</span>
        <span class="collapsible-caret" aria-hidden="true">⌄</span>
      </summary>
      <div class="collapsible-field-body">
        <div class="network-group-grid">
          ${fields.map((field) => renderField(field)).join('')}
        </div>
      </div>
    </details>
  `;
}

export function renderCaptionTagDropoutGroup({ fields, config = {}, renderField }) {
  const summaryValue = fields.reduce((count, field) => {
    const value = config[field.key];
    return value === undefined || value === null || value === '' ? count : count + 1;
  }, 0);
  const summaryText = summaryValue ? `${summaryValue} 项已设` : '未设置';
  const summaryClass = summaryValue ? '' : ' is-empty';
  const isModified = fields.some((field) => String(config[field.key] ?? '') !== String(field.defaultValue ?? ''));
  const modCls = isModified ? ' field-modified' : '';

  return `
    <details class="config-group collapsible-field collapsible-field-group dataset-layout-full${modCls}" data-field-key="caption-tag-dropout-group">
      <summary class="collapsible-field-summary">
        <span class="collapsible-field-summary-main">
          <span class="collapsible-field-title">tag_dropout拓展</span>
          <span class="collapsible-field-note">全部标签丢弃、周期丢弃、指定 Tag 列表和处理方式</span>
        </span>
        <span class="collapsible-field-value${summaryClass}">${escapeHtml(summaryText)}</span>
        <span class="collapsible-caret" aria-hidden="true">⌄</span>
      </summary>
      <div class="collapsible-field-body collapsible-field-group-body">
        ${fields.map((field) => renderField(field)).join('')}
      </div>
    </details>
  `;
}

export function renderRegularizationFieldGroup({ regField, priorField, config = {} }) {
  const regValue = config[regField.key];
  const priorValue = config[priorField.key];
  const regSummary = regValue === undefined || regValue === null || regValue === '' ? '未设置' : String(regValue);
  const regSummaryClass = regSummary === '未设置' ? ' is-empty' : '';
  const regModified = String(regValue ?? '') !== String(regField.defaultValue ?? '');
  const priorModified = String(priorValue ?? '') !== String(priorField.defaultValue ?? '');
  const modCls = regModified || priorModified ? ' field-modified' : '';
  const priorInputValue = priorValue === undefined || priorValue === null || priorValue === '' ? (priorField.defaultValue ?? 1) : priorValue;

  return `
    <details class="config-group collapsible-field collapsible-field-group${modCls}" data-field-key="${regField.key}">
      <summary class="collapsible-field-summary">
        <span class="collapsible-field-summary-main">
          <span class="collapsible-field-title">${escapeHtml(regField.label)}</span>
          <span class="collapsible-field-note">${escapeHtml(regField.desc || '')}</span>
        </span>
        <span class="collapsible-field-value${regSummaryClass}">${escapeHtml(regSummary)}</span>
        <span class="collapsible-caret" aria-hidden="true">⌄</span>
      </summary>
      <div class="collapsible-field-body collapsible-field-group-body">
        <div class="input-picker">
          <button class="picker-icon" type="button" onclick="pickPath('${regField.key}', '${regField.pickerType || 'folder'}')">
            <svg class="icon"><use href="#icon-folder"></use></svg>
          </button>
          <input type="text" value="${escapeHtml(regValue || '')}" oninput="updateConfigValue('${regField.key}', this.value)">
        </div>
        <div class="collapsible-field-subfield" data-field-key="${priorField.key}">
          <label class="collapsible-field-subtitle">${escapeHtml(priorField.label)}</label>
          <p class="field-desc">${escapeHtml(priorField.desc || '')}</p>
          <input class="text-input" type="number" value="${escapeHtml(priorInputValue)}" ${priorField.min !== undefined ? `min="${priorField.min}"` : ''} ${priorField.max !== undefined ? `max="${priorField.max}"` : ''} ${priorField.step !== undefined ? `step="${priorField.step}"` : ''} oninput="updateConfigValue('${priorField.key}', this.value)">
        </div>
      </div>
    </details>
  `;
}


