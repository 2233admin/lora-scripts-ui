const PHASE_ALIASES = Object.freeze({
  id: ['id', 'phase_id', 'name'],
  start: ['start', 'start_progress', 'from'],
  end: ['end', 'end_progress', 'to'],
  lr_scale: ['lr_scale', 'learning_rate_scale', 'lrScale'],
  module_policy: ['module_policy', 'modules', 'module', 'modulePolicy'],
  difficulty_policy: ['difficulty_policy', 'difficulty', 'curriculum', 'difficultyPolicy'],
  timestep_policy: ['timestep_policy', 'timesteps', 'timestep', 'timestepPolicy'],
  resolution_hint: ['resolution_hint', 'resolution', 'resolution_hints', 'resolutionHint'],
  rank_hint: ['rank_hint', 'rank', 'rank_hints', 'rankHint'],
});

export const MODULE_POLICY_OPTIONS = Object.freeze([
  ['all', '全部 LoRA 模块'],
  ['attention', '仅 Attention'],
  ['attention_mlp', 'Attention + MLP'],
  ['mlp', '仅 MLP'],
  ['extended', '仅扩展模块'],
  ['custom', '自定义 JSON'],
]);

export const DIFFICULTY_POLICY_OPTIONS = Object.freeze([
  ['inherit', '继承全局'],
  ['provided', '数据集提供'],
  ['easy', '偏简单样本'],
  ['hard', '偏困难样本'],
  ['custom', '自定义 JSON'],
]);

export const TIMESTEP_POLICY_OPTIONS = Object.freeze([
  ['inherit', '继承全局'],
  ['uniform', '均匀'],
  ['low', '低时间步'],
  ['high', '高时间步'],
  ['middle', '中间时间步'],
  ['extremes', '两端时间步'],
  ['custom', '自定义 JSON'],
]);

const jsonClone = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const finite = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readAlias(source, field, fallback = undefined) {
  for (const key of PHASE_ALIASES[field] || [field]) {
    if (Object.hasOwn(source || {}, key)) return source[key];
  }
  return fallback;
}

function writeAlias(source, field, value) {
  const result = { ...(source || {}) };
  const keys = PHASE_ALIASES[field] || [field];
  const target = keys.find((key) => Object.hasOwn(result, key)) || keys[0];
  result[target] = value;
  return result;
}

function hintNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = hintNumber(entry);
      if (parsed !== '') return parsed;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['value', 'target', 'max', 'resolution', 'rank', 'min']) {
      if (Object.hasOwn(value, key)) {
        const parsed = hintNumber(value[key]);
        if (parsed !== '') return parsed;
      }
    }
  }
  return '';
}

function policyMode(value, fallback = 'inherit') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') return value.trim().toLowerCase().replaceAll('-', '_') || fallback;
  if (typeof value === 'object') {
    const mode = value.mode ?? value.weighting_mode ?? value.difficulty_mode ?? value.timestep_mode;
    if (mode !== undefined) return String(mode).trim().toLowerCase().replaceAll('-', '_');
  }
  return 'custom';
}

function modulePolicyMode(value) {
  if (value === null || value === undefined || value === '') return 'all';
  if (typeof value === 'string') {
    const mode = value.trim().toLowerCase().replaceAll('-', '_');
    return ['all', 'attention', 'attention_mlp', 'mlp', 'extended'].includes(mode) ? mode : 'custom';
  }
  if (typeof value !== 'object' || Array.isArray(value)) return 'custom';
  const train = new Set(Array.isArray(value.train) ? value.train.map((item) => String(item).toLowerCase()) : []);
  if (!train.size) return 'all';
  if (train.size === 1 && train.has('attention')) return 'attention';
  if (train.size === 1 && train.has('mlp')) return 'mlp';
  if (train.size === 1 && train.has('extended')) return 'extended';
  if (train.size === 2 && train.has('attention') && train.has('mlp')) return 'attention_mlp';
  return 'custom';
}

function normalizedOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : 'custom';
}

export function createDefaultProgressivePhase(index = 0, start = 0, end = 1) {
  return {
    id: `phase_${index + 1}`,
    start: clamp(finite(start, 0), 0, 1),
    end: clamp(finite(end, 1), 0, 1),
    lr_scale: 1,
    module_policy: null,
    difficulty_policy: null,
    timestep_policy: null,
    resolution_hint: null,
    rank_hint: null,
  };
}

export function parseProgressivePhaseSchedule(raw) {
  let parsed = raw;
  const blank = raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim());
  if (blank) {
    return {
      valid: true,
      defaulted: true,
      error: '',
      rootKind: 'object',
      root: {},
      phases: [createDefaultProgressivePhase()],
    };
  }
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        valid: false,
        defaulted: false,
        error: `JSON 解析失败：${error.message}`,
        rootKind: 'object',
        root: {},
        phases: [createDefaultProgressivePhase()],
      };
    }
  }
  if (Array.isArray(parsed)) {
    if (!parsed.length) {
      return { valid: true, defaulted: true, error: '', rootKind: 'array', root: [], phases: [createDefaultProgressivePhase()] };
    }
    return { valid: true, defaulted: false, error: '', rootKind: 'array', root: [], phases: jsonClone(parsed) };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, defaulted: false, error: 'Phase Schedule 必须是数组或包含 phases 的对象。', rootKind: 'object', root: {}, phases: [createDefaultProgressivePhase()] };
  }
  if (!Array.isArray(parsed.phases)) {
    return { valid: false, defaulted: false, error: 'Phase Schedule 对象缺少 phases 数组。', rootKind: 'object', root: jsonClone(parsed), phases: [createDefaultProgressivePhase()] };
  }
  return {
    valid: true,
    defaulted: parsed.phases.length === 0,
    error: '',
    rootKind: 'object',
    root: jsonClone(parsed),
    phases: parsed.phases.length ? jsonClone(parsed.phases) : [createDefaultProgressivePhase()],
  };
}

export function progressivePhaseRows(raw) {
  const document = parseProgressivePhaseSchedule(raw);
  const rows = document.phases.map((source, index) => {
    const phase = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const modulePolicy = modulePolicyMode(readAlias(phase, 'module_policy'));
    const difficultyPolicy = normalizedOption(
      policyMode(readAlias(phase, 'difficulty_policy')),
      DIFFICULTY_POLICY_OPTIONS.map(([value]) => value).filter((value) => value !== 'custom'),
      'inherit',
    );
    const timestepPolicy = normalizedOption(
      policyMode(readAlias(phase, 'timestep_policy')),
      TIMESTEP_POLICY_OPTIONS.map(([value]) => value).filter((value) => value !== 'custom'),
      'inherit',
    );
    return {
      source: phase,
      id: String(readAlias(phase, 'id', `phase_${index + 1}`) || `phase_${index + 1}`),
      start: clamp(finite(readAlias(phase, 'start', index === 0 ? 0 : 1), 0), 0, 1),
      end: clamp(finite(readAlias(phase, 'end', 1), 1), 0, 1),
      lrScale: Math.max(0, finite(readAlias(phase, 'lr_scale', 1), 1)),
      modulePolicy,
      difficultyPolicy,
      timestepPolicy,
      resolution: hintNumber(readAlias(phase, 'resolution_hint')),
      rank: hintNumber(readAlias(phase, 'rank_hint')),
    };
  });
  return { document, rows };
}

function modulePolicyValue(mode, previous) {
  if (mode === 'custom') return jsonClone(previous);
  if (mode === 'all') return null;
  const train = mode === 'attention_mlp' ? ['attention', 'mlp'] : [mode];
  const groups = ['attention', 'mlp', 'extended'];
  return { train, freeze: groups.filter((group) => !train.includes(group)) };
}

function simplePolicyValue(mode, previous) {
  if (mode === 'custom') return jsonClone(previous);
  if (mode === 'inherit') return null;
  return { mode };
}

export function updateProgressivePhaseSource(source, field, rawValue) {
  const phase = source && typeof source === 'object' && !Array.isArray(source) ? jsonClone(source) : {};
  if (field === 'id') return writeAlias(phase, field, String(rawValue || '').trim() || 'phase');
  if (field === 'start' || field === 'end') return writeAlias(phase, field, clamp(finite(rawValue, field === 'start' ? 0 : 1), 0, 1));
  if (field === 'lr_scale') return writeAlias(phase, field, Math.max(0, finite(rawValue, 1)));
  if (field === 'module_policy') return writeAlias(phase, field, modulePolicyValue(String(rawValue), readAlias(phase, field)));
  if (field === 'difficulty_policy' || field === 'timestep_policy') {
    return writeAlias(phase, field, simplePolicyValue(String(rawValue), readAlias(phase, field)));
  }
  if (field === 'resolution_hint' || field === 'rank_hint') {
    const text = String(rawValue ?? '').trim();
    if (!text) return writeAlias(phase, field, null);
    const integer = Math.max(1, Math.round(finite(text, 1)));
    return writeAlias(phase, field, integer);
  }
  return phase;
}

export function serializeProgressivePhaseSchedule(document, phases) {
  const clonedPhases = jsonClone(phases);
  const payload = document?.rootKind === 'array'
    ? clonedPhases
    : { ...(jsonClone(document?.root) || {}), phases: clonedPhases };
  return JSON.stringify(payload, null, 2);
}

export function progressivePhaseScheduleIssues(rows) {
  const issues = [];
  const ids = new Set();
  rows.forEach((row, index) => {
    if (ids.has(row.id)) issues.push(`第 ${index + 1} 行 Phase ID 重复。`);
    ids.add(row.id);
    if (row.start >= row.end) issues.push(`第 ${index + 1} 行必须满足 start < end。`);
    if (index === 0 && row.start !== 0) issues.push('第一阶段建议从 0 开始。');
    if (index > 0) {
      const previous = rows[index - 1];
      if (row.start < previous.end) issues.push(`第 ${index}、${index + 1} 行发生重叠。`);
      if (row.start > previous.end) issues.push(`第 ${index}、${index + 1} 行之间存在空档。`);
    }
  });
  if (rows.length && rows.at(-1).end !== 1) issues.push('最后阶段建议结束于 1。');
  return [...new Set(issues)];
}
