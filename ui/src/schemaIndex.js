// ================================================================
// schemaIndex.js — 训练族 schema 汇总入口 + 公共 API
// 把各族(sdxl / anima / 长尾 / DiT 长尾 / 实验)的 section 汇成 SECTIONS_MAP,
// 并对外暴露 getSectionsForType / createDefaultConfig / buildRunConfig 等公共 API。
// 这是 main.js 与各 smoke/parity 工具的唯一公共入口(原先在 sdxlSchema 神文件尾部)。
// ================================================================
import { TRAINING_TYPES as ALL_TRAINING_TYPES, VISIBLE_TRAINING_TYPES, UI_TABS } from './trainingTypeRegistry.js';
import { FRONTIER_OPTIMIZER_CANDIDATE_OPTIONS, TARGET_LORA_OPTIMIZERS, schedulerOptions } from './features/settingsOptions.js';
import { buildRunConfigFromSections } from './runConfigBuilder.js';
import {
  SDXL_LORA_SECTIONS, SDXL_ILECO_SECTIONS, SDXL_ADDIFT_SECTIONS, SDXL_MULTI_ADDIFT_SECTIONS,
  SDXL_FT_SECTIONS, SDXL_CN_SECTIONS, SDXL_TI_SECTIONS,
} from './sdxlSchema.js';
import {
  ANIMA_LORA_SECTIONS, ANIMA_EDIT_MODEL_SECTIONS, ANIMA_ILECO_SECTIONS, ANIMA_ADDIFT_SECTIONS,
  ANIMA_MULTI_ADDIFT_SECTIONS, ANIMA_FT_SECTIONS, ANIMA_CN_SECTIONS,
} from './animaSchema.js';
import {
  SD15_LORA_SECTIONS, SD15_ILECO_SECTIONS, SD15_ADDIFT_SECTIONS, SD15_MULTI_ADDIFT_SECTIONS,
  DB_SECTIONS, SD_CN_SECTIONS, SD_TI_SECTIONS, YOLO_SECTIONS, AESTHETIC_SCORER_SECTIONS,
} from './otherSchemas.js';
import {
  FLUX_LORA_SECTIONS, LUMINA_LORA_SECTIONS, QWEN_IMAGE_LORA_SECTIONS, HUNYUAN_DIT_LORA_SECTIONS,
  HUNYUAN_IMAGE_COMPAT_SECTIONS, FLUX_FT_SECTIONS, LUMINA_FT_SECTIONS, FLUX_CN_SECTIONS, NEWBIE_LORA_SECTIONS,
  KREA2_LORA_SECTIONS, FLUX2_LORA_SECTIONS, ZIMAGE_LORA_SECTIONS, WAN22_TI2V_LORA_SECTIONS, WAN22_T2V_A14B_LORA_SECTIONS, LTX23_LORA_SECTIONS, BOOGU_LORA_SECTIONS, BOOGU_EDIT_LORA_SECTIONS,
} from './otherDitSchemas.js';
import {
  LAB_DISTILLER_SECTIONS, SDXL_TURBO_LORA_SECTIONS, ANIMA_FEW_STEP_LORA_SECTIONS, NEWBIE_FEW_STEP_LORA_SECTIONS,
} from './experimentalTrainingSchemas.js';
import { CONCEPT_EDIT_UNIFIED_SECTIONS } from './conceptEditUnifiedSchema.js';
import { S_TRAINING_INTENT_PROFILE } from './schemaFrontierGroups.js';
import { S_UNIVERSAL_DIT } from './universalDitFields.js';

export { ALL_TRAINING_TYPES, UI_TABS };
export const TRAINING_TYPES = VISIBLE_TRAINING_TYPES;

// TRAINING_TYPES 是侧栏可见列表；ALL_TRAINING_TYPES 用于导入/旧配置兼容校验。

// ================================================================
// SECTIONS_MAP
// ================================================================
const SECTIONS_MAP = {
  'sdxl-lora':              SDXL_LORA_SECTIONS,
  'sdxl-ileco':             SDXL_ILECO_SECTIONS,
  'sdxl-addift':            SDXL_ADDIFT_SECTIONS,
  'sdxl-multi-addift':      SDXL_MULTI_ADDIFT_SECTIONS,
  'sd-lora':                SD15_LORA_SECTIONS,
  'sd-ileco':               SD15_ILECO_SECTIONS,
  'sd-addift':              SD15_ADDIFT_SECTIONS,
  'sd-multi-addift':        SD15_MULTI_ADDIFT_SECTIONS,
  'flux-lora':              FLUX_LORA_SECTIONS,
  'lumina-lora':            LUMINA_LORA_SECTIONS,
  'qwen-image-lora':        QWEN_IMAGE_LORA_SECTIONS,
  'hunyuan-dit-lora':       HUNYUAN_DIT_LORA_SECTIONS,
  'hunyuan-image-lora':     HUNYUAN_IMAGE_COMPAT_SECTIONS,
  'anima-lora':             ANIMA_LORA_SECTIONS,
  'anima-edit-model':       ANIMA_EDIT_MODEL_SECTIONS,
  'anima-ileco':            ANIMA_ILECO_SECTIONS,
  'anima-addift':           ANIMA_ADDIFT_SECTIONS,
  'anima-multi-addift':     ANIMA_MULTI_ADDIFT_SECTIONS,
  'newbie-lora':            NEWBIE_LORA_SECTIONS,
  'krea2-lora':             KREA2_LORA_SECTIONS,
  'flux2-lora':             FLUX2_LORA_SECTIONS,
  'zimage-lora':            ZIMAGE_LORA_SECTIONS,
  'wan22-ti2v-lora':        WAN22_TI2V_LORA_SECTIONS,
  'wan22-t2v-a14b-lora':     WAN22_T2V_A14B_LORA_SECTIONS,
  'ltx23-lora':             LTX23_LORA_SECTIONS,
  'boogu-lora':             BOOGU_LORA_SECTIONS,
  'boogu-edit-lora': BOOGU_EDIT_LORA_SECTIONS,
  'lab-distiller':          LAB_DISTILLER_SECTIONS,
  'sdxl-turbo-lora':        SDXL_TURBO_LORA_SECTIONS,
  'anima-few-step-lora':    ANIMA_FEW_STEP_LORA_SECTIONS,
  'newbie-few-step-lora':   NEWBIE_FEW_STEP_LORA_SECTIONS,
  'concept-edit':           CONCEPT_EDIT_UNIFIED_SECTIONS,
  'sd-dreambooth':          DB_SECTIONS,
  'sdxl-finetune':          SDXL_FT_SECTIONS,
  'flux-finetune':          FLUX_FT_SECTIONS,
  'lumina-finetune':        LUMINA_FT_SECTIONS,
  'anima-finetune':         ANIMA_FT_SECTIONS,
  'sd-controlnet':          SD_CN_SECTIONS,
  'sdxl-controlnet':        SDXL_CN_SECTIONS,
  'anima-controlnet':       ANIMA_CN_SECTIONS,
  'flux-controlnet':        FLUX_CN_SECTIONS,
  'sd-textual-inversion':   SD_TI_SECTIONS,
  'sdxl-textual-inversion': SDXL_TI_SECTIONS,
  'yolo':                   YOLO_SECTIONS,
  'aesthetic-scorer':       AESTHETIC_SCORER_SECTIONS,
};

const TARGET_OPTIMIZER_TRAINING_TYPES = new Set(['sdxl-lora', 'anima-lora', 'anima-edit-model', 'newbie-lora']);
const TRAINING_INTENT_SUPPORTED_TYPES = new Set([
  'sdxl-lora',
  'sd-lora',
  'flux-lora',
  'lumina-lora',
  'qwen-image-lora',
  'hunyuan-dit-lora',
  'hunyuan-image-lora',
  'anima-lora',
  'anima-edit-model',
  'newbie-lora',
  'krea2-lora',
  'flux2-lora',
  'zimage-lora',
  'boogu-lora',
  'boogu-edit-lora',
  'sdxl-turbo-lora',
  'anima-few-step-lora',
  'newbie-few-step-lora',
]);
const UNIVERSAL_DIT_SECTION = {
  id: 'universal-dit-settings',
  tab: 'advanced',
  title: 'Universal DiT LoRA fallback',
  description: '对未被专用族路由识别的 DiT/Transformer 提供的探测与基础 LoRA 接入。',
  fields: S_UNIVERSAL_DIT,
};
const TRAINING_INTENT_PROFILE_SECTION = {
  id: 'training-intent-profile',
  tab: 'training',
  title: '训练用途建议',
  description: '用途 Profile 只生成配置建议，不会在运行时静默改写参数。',
  fields: S_TRAINING_INTENT_PROFILE,
};
const _profiledSectionsCache = {};

// 兼容旧名
export const SDXL_SECTIONS = SDXL_LORA_SECTIONS;

// ================================================================
// 公共 API
// ================================================================
export function getSectionsForType(typeId) {
  const base = SECTIONS_MAP[typeId] || SDXL_LORA_SECTIONS;
  if (!TRAINING_INTENT_SUPPORTED_TYPES.has(typeId)) return base;
  if (!_profiledSectionsCache[typeId]) {
    _profiledSectionsCache[typeId] = [TRAINING_INTENT_PROFILE_SECTION, UNIVERSAL_DIT_SECTION, ...base];
  }
  return _profiledSectionsCache[typeId];
}

function buildFieldMap(sections) {
  const map = new Map();
  for (const s of sections) for (const f of s.fields) map.set(f.key, f);
  return map;
}

const _fmCache = {};
function getFieldMapForType(typeId) {
  if (!_fmCache[typeId]) _fmCache[typeId] = buildFieldMap(getSectionsForType(typeId));
  return _fmCache[typeId];
}

export function getFieldDefinition(key, typeId) {
  if (typeId) return getFieldMapForType(typeId).get(key);
  for (const sections of Object.values(SECTIONS_MAP)) {
    const map = buildFieldMap(sections);
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

export function applyBackendConfigOptions(optionsPayload) {
  const payload = optionsPayload && typeof optionsPayload === 'object' ? optionsPayload : {};
  const optionValue = (option) => option && typeof option === 'object'
    ? String(option.value ?? '').trim()
    : String(option || '').trim();
  const uniqueOptions = (values) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map((option) => {
        const value = optionValue(option);
        if (!value || seen.has(value)) return null;
        seen.add(value);
        return option && typeof option === 'object' ? { ...option, value } : value;
      })
      .filter(Boolean);
  };
  const optimizers = uniqueOptions(payload.optimizers || payload.optimizer_type);
  const schedulers = uniqueOptions(payload.schedulers || payload.lr_scheduler);
  const frontierCandidates = uniqueOptions(
    (payload.frontier_optimizer_candidates || []).map((item) => (
      item && typeof item === 'object'
        ? { value: item.name || item.value, label: item.label || item.name || item.value }
        : item
    ))
  );
  if (optimizers.length === 0 && schedulers.length === 0 && frontierCandidates.length === 0) return false;
  const mergedOptimizerOptions = uniqueOptions([...optimizers, ...TARGET_LORA_OPTIMIZERS]);
  const frontierOptimizerOptions = uniqueOptions([
    ...frontierCandidates,
    ...FRONTIER_OPTIMIZER_CANDIDATE_OPTIONS,
  ]);

  for (const [typeId, sections] of Object.entries(SECTIONS_MAP)) {
    for (const section of sections) {
      for (const field of section.fields || []) {
        if (field.key === 'optimizer_type' && optimizers.length > 0 && TARGET_OPTIMIZER_TRAINING_TYPES.has(typeId)) {
          field.options = mergedOptimizerOptions;
        } else if (field.key === 'frontier_optimizer_candidate' && frontierOptimizerOptions.length > 0) {
          field.options = frontierOptimizerOptions;
        } else if (field.key === 'lr_scheduler' && schedulers.length > 0) {
          field.options = schedulerOptions(schedulers);
        }
      }
    }
  }
  Object.keys(_fmCache).forEach((key) => delete _fmCache[key]);
  return true;
}

export function getSectionsForTab(tabKey, typeId) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  let filtered = sections.filter((s) => {
    if (tabKey === 'dataset') return s.tab === 'dataset' || s.id === 'noise-settings';
    if (tabKey === 'advanced') return s.tab === 'advanced' && s.id !== 'noise-settings';
    if (tabKey === 'frontier') return s.tab === 'frontier';
    if (tabKey === 'model') return (s.tab === 'model' && s.id !== 'save-settings') || s.id === 'v-parameterization-settings' || s.id === 'rf-settings';
    if (tabKey === 'training') return (s.tab === 'training' || s.id === 'save-settings') && s.id !== 'v-parameterization-settings' && s.id !== 'rf-settings';
    return s.tab === tabKey;
  });

  if (tabKey === 'dataset') {
    const dataAugIndex = filtered.findIndex((s) => s.id === 'data-aug-settings');
    const noiseIndex = filtered.findIndex((s) => s.id === 'noise-settings');
    if (dataAugIndex !== -1 && noiseIndex !== -1 && noiseIndex !== dataAugIndex + 1) {
      const [noiseSection] = filtered.splice(noiseIndex, 1);
      filtered.splice(dataAugIndex + 1, 0, noiseSection);
    }
  }

  if (tabKey === 'training') {
    const trainingIndex = filtered.findIndex((s) => s.id === 'training-settings');
    const saveIndex = filtered.findIndex((s) => s.id === 'save-settings');
    if (trainingIndex !== -1 && saveIndex !== -1 && saveIndex !== trainingIndex + 1) {
      const [saveSection] = filtered.splice(saveIndex, 1);
      filtered.splice(trainingIndex + 1, 0, saveSection);
    }
  }

  if (tabKey === 'model') {
    const modelIndex = filtered.findIndex((s) => s.id === 'model-settings');
    const vParamIndex = filtered.findIndex((s) => s.id === 'v-parameterization-settings');
    const rfIndex = filtered.findIndex((s) => s.id === 'rf-settings');
    const moved = [];
    if (vParamIndex !== -1) {
      moved.push(filtered.splice(vParamIndex, 1)[0]);
    }
    const rfCurrentIndex = filtered.findIndex((s) => s.id === 'rf-settings');
    if (rfCurrentIndex !== -1) {
      moved.push(filtered.splice(rfCurrentIndex, 1)[0]);
    }
    if (modelIndex !== -1 && moved.length) {
      filtered.splice(modelIndex + 1, 0, ...moved);
    }
  }

  return filtered;
}

export function getAvailableTabs(typeId, config) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  const tabSet = new Set();
  for (const s of sections) tabSet.add(s.tab);
  // expertMode = 顶栏「高级」= performance_expert_mode；标准模式隐藏 expertOnly 页签（高级/先锋）
  const expertMode = !!(config && config.performance_expert_mode);
  return UI_TABS.filter((t) => tabSet.has(t.key) && (!t.expertOnly || expertMode));
}

export function isFieldVisible(field, config) {
  if (!field?.visibleWhen) return true;
  return field.visibleWhen(config);
}

export function createDefaultConfig(typeId) {
  const config = {};
  for (const s of getSectionsForType(typeId || 'sdxl-lora'))
    for (const f of s.fields)
      config[f.key] = Array.isArray(f.defaultValue) ? [...f.defaultValue] : (f.defaultValue ?? '');
  return config;
}

export function normalizeDraftValue(field, rawValue) {
  if (!field) return rawValue;
  if (field.type === 'ui_group') return '';
  if (field.key === 'prior_loss_weight' && (rawValue === '' || rawValue === null || rawValue === undefined)) return 1;
  if (field.type === 'boolean') return Boolean(rawValue);
  if (field.type === 'number' || field.type === 'slider') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    const p = Number(rawValue);
    return Number.isNaN(p) ? '' : p;
  }
  return rawValue;
}

export function buildRunConfig(config, typeId) {
  return buildRunConfigFromSections(config, typeId, { getSectionsForType, isFieldVisible });
}

// ================================================================
// 联动重渲染键（CONDITIONAL_KEYS）自动推导
// ----------------------------------------------------------------
// 背景：任何 visibleWhen 依赖的 config key，用户改动它时都必须触发整表重渲染，
// 否则子字段会一直藏着（"开了父开关子项不出现" bug）。原先靠手工维护 constants.js
// 里的清单，schema 每加一个字段就漏一个 → 长期腐化。这里改成从 schema 自动推导：
//   1) 用 schemaCommon 里的 when/all/oneOf 等组合器写的 visibleWhen 会带 `.deps`（Set）；
//   2) 内联箭头 (c) => c.xxx / config.xxx 没有 .deps，用源码正则兜底抽取被读取的 key。
// 遍历所有训练类型的所有字段，取并集。新增字段零维护。
// ----------------------------------------------------------------
// 正则兜底：匹配形参.key 的读取，形参名取箭头/function 的第一个参数。
function _extractKeysFromSource(fn) {
  const keys = new Set();
  let src;
  try {
    src = Function.prototype.toString.call(fn);
  } catch {
    return keys;
  }
  // 提取第一个形参名：支持 (c) => / c => / function (config) {
  const paramMatch = src.match(/^\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)/);
  const param = paramMatch ? paramMatch[1] : null;
  if (!param) return keys;
  // 匹配 param.key / param["key"] / param['key']
  const dotRe = new RegExp(`\\b${param}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
  const braRe = new RegExp(`\\b${param}\\s*\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g');
  let m;
  while ((m = dotRe.exec(src))) keys.add(m[1]);
  while ((m = braRe.exec(src))) keys.add(m[1]);
  return keys;
}

// 取某字段 visibleWhen 依赖的父键集合（供 UI 做父子视觉分组）。
// 优先用组合器挂的 .deps；内联箭头回退到源码正则。无 visibleWhen 返回空 Set。
export function getFieldConditionalParents(field) {
  const vw = field && field.visibleWhen;
  if (typeof vw !== 'function') return new Set();
  if (vw.deps instanceof Set) return vw.deps;
  return _extractKeysFromSource(vw);
}

let _conditionalKeysCache = null;
export function collectConditionalKeys() {
  if (_conditionalKeysCache) return _conditionalKeysCache;
  const keys = new Set();
  const seenFns = new Set();
  for (const typeId of Object.keys(SECTIONS_MAP)) {
    for (const section of getSectionsForType(typeId)) {
      for (const field of section.fields || []) {
        const vw = field.visibleWhen;
        if (typeof vw !== 'function' || seenFns.has(vw)) continue;
        seenFns.add(vw);
        if (vw.deps instanceof Set) {
          for (const k of vw.deps) keys.add(k);
        } else {
          for (const k of _extractKeysFromSource(vw)) keys.add(k);
        }
      }
    }
  }
  _conditionalKeysCache = keys;
  return keys;
}
