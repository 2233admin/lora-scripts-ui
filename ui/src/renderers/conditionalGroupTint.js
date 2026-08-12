// renderers/conditionalGroupTint.js — 父子联动字段的视觉分组着色
// ----------------------------------------------------------------
// 背景：某个布尔开关（如 DoRA）打开后展开的子字段，在网格里跟父卡片视觉断开，
// 用户看不出"这几项属于哪个父"。这里在 config 视图 DOM 提交后做一次后处理：
//   1) 对每个 .config-group[data-field-key]，用 getFieldConditionalParents 找它的父键；
//   2) 只认"当前 === true 的布尔父"作为归属父（选择器父级值是字符串，不参与，避免整表染色）；
//   3) 按父在 DOM 中首次出现顺序分配轮转色板 → 相邻父组自动异色；
//   4) 父卡片与其子项共享同一档色号（data-lx-cgroup），CSS 上同色底 + 左侧连接条。
// 用 .deps 自动推导父子关系，不手工维护清单，schema 增删字段零维护。
// ----------------------------------------------------------------

// 轮转档位数：与 CSS 里 [data-lx-cgroup="N"] 的档数保持一致。
const PALETTE_SLOTS = 5;

/**
 * @param {HTMLElement} container  config 视图根容器
 * @param {object}   opts
 * @param {object}   opts.config          state.config
 * @param {(field:object)=>Set<string>} opts.getFieldConditionalParents
 * @param {(key:string)=>(object|undefined)} opts.getFieldDefinition
 */
export function applyConditionalGroupTint(container, opts = {}) {
  const { config, getFieldConditionalParents, getFieldDefinition } = opts;
  if (!container || !config || typeof getFieldConditionalParents !== 'function' || typeof getFieldDefinition !== 'function') return;

  // 清理上一轮着色，避免重渲染残留。
  container.querySelectorAll('[data-lx-cgroup]').forEach((el) => {
    el.removeAttribute('data-lx-cgroup');
    el.removeAttribute('data-lx-cgroup-role');
  });

  const groups = container.querySelectorAll('.config-group[data-field-key]');
  if (!groups.length) return;

  // 父键 → 分配到的色号；按父卡片在 DOM 中首次出现顺序轮转，保证相邻父组异色。
  const parentSlot = new Map();
  let nextSlot = 0;
  const slotFor = (parentKey) => {
    if (!parentSlot.has(parentKey)) {
      parentSlot.set(parentKey, nextSlot % PALETTE_SLOTS);
      nextSlot += 1;
    }
    return parentSlot.get(parentKey);
  };

  // "布尔父开关当前为 on" 才参与分组：值为 true / 1 / "true"。
  const isEnabledBooleanParent = (parentKey) => {
    const raw = config[parentKey];
    if (raw === true || raw === 1) return true;
    if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
    return false;
  };

  // 第一遍：先给作为父的开关卡片打 slot（保证父卡片先于子项拿到 DOM 顺序色号）。
  // 这里遍历所有子字段，把它命中的启用布尔父登记进 parentSlot。
  const childToParent = new Map(); // fieldKey -> parentKey
  for (const el of groups) {
    const key = el.getAttribute('data-field-key');
    if (!key) continue;
    const field = getFieldDefinition(key);
    if (!field) continue;
    const parents = getFieldConditionalParents(field);
    if (!parents || !parents.size) continue;
    // 命中的启用布尔父可能有多个（如 all(A,B)）；取"在 DOM 中更靠前的父卡片"更直觉，
    // 但简单起见取第一个启用的布尔父即可，视觉上足够表达归属。
    let chosen = null;
    for (const p of parents) {
      if (isEnabledBooleanParent(p)) { chosen = p; break; }
    }
    if (chosen) childToParent.set(key, chosen);
  }

  if (!childToParent.size) return;

  // 第二遍：按 DOM 顺序给父卡片和子卡片打色号 + 角色。
  for (const el of groups) {
    const key = el.getAttribute('data-field-key');
    if (!key) continue;
    // 该元素是不是某个已启用布尔父本身？
    if (isEnabledBooleanParent(key) && [...childToParent.values()].includes(key)) {
      const slot = slotFor(key);
      el.setAttribute('data-lx-cgroup', String(slot));
      el.setAttribute('data-lx-cgroup-role', 'parent');
      continue;
    }
    // 该元素是不是某个父的子项？
    const parentKey = childToParent.get(key);
    if (parentKey) {
      const slot = slotFor(parentKey);
      el.setAttribute('data-lx-cgroup', String(slot));
      el.setAttribute('data-lx-cgroup-role', 'child');
    }
  }
}
