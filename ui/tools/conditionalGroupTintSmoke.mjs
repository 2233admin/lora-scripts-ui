// conditionalGroupTintSmoke.mjs
// 守卫「父子联动字段视觉分组着色」的核心决策：
//   1) 只认当前为 on 的布尔父，选择器父（字符串值）不参与，避免整表染色；
//   2) 父卡片与其子项共享同一色号 data-lx-cgroup；
//   3) 按父在 DOM 中首次出现顺序轮转色号 → 相邻父组自动异色。
// applyConditionalGroupTint 只用到 container.querySelectorAll 两种选择器
// 和元素的 get/set/removeAttribute，这里用最小 fake DOM 打桩，不引 jsdom。
import assert from 'node:assert/strict';
import { applyConditionalGroupTint } from '../src/renderers/conditionalGroupTint.js';

// ---- 最小 fake DOM ----
class FakeEl {
  constructor(fieldKey) {
    this.attrs = new Map();
    if (fieldKey != null) this.attrs.set('data-field-key', fieldKey);
    this.classes = new Set(['config-group']);
  }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, val) { this.attrs.set(name, String(val)); }
  removeAttribute(name) { this.attrs.delete(name); }
}

class FakeContainer {
  constructor(els) { this.els = els; }
  querySelectorAll(selector) {
    if (selector === '[data-lx-cgroup]') {
      return this.els.filter((e) => e.attrs.has('data-lx-cgroup'));
    }
    if (selector === '.config-group[data-field-key]') {
      return this.els.filter((e) => e.classes.has('config-group') && e.attrs.has('data-field-key'));
    }
    return [];
  }
}

// visibleWhen 依赖父键的抽象：字段 -> 父键集合
function makeDeps(map) {
  return {
    getFieldConditionalParents(field) { return new Set(field.__parents || []); },
    getFieldDefinition(key) { return map[key] || null; },
  };
}

// ---- 场景 1：单个启用布尔父 + 两个子项 → 三者同色号且父/子角色正确 ----
{
  const fieldMap = {
    dora_enabled: { __parents: [] },
    dora_mode: { __parents: ['dora_enabled'] },
    dora_init_scale: { __parents: ['dora_enabled'] },
  };
  const els = [
    new FakeEl('dora_enabled'),
    new FakeEl('dora_mode'),
    new FakeEl('dora_init_scale'),
  ];
  const container = new FakeContainer(els);
  applyConditionalGroupTint(container, {
    config: { dora_enabled: true },
    ...makeDeps(fieldMap),
  });
  const [p, c1, c2] = els;
  assert.equal(p.getAttribute('data-lx-cgroup-role'), 'parent', 'dora_enabled 应为 parent');
  assert.equal(c1.getAttribute('data-lx-cgroup-role'), 'child', 'dora_mode 应为 child');
  assert.equal(c2.getAttribute('data-lx-cgroup-role'), 'child', 'dora_init_scale 应为 child');
  const slot = p.getAttribute('data-lx-cgroup');
  assert.ok(slot != null, '父应有色号');
  assert.equal(c1.getAttribute('data-lx-cgroup'), slot, '子与父同色号');
  assert.equal(c2.getAttribute('data-lx-cgroup'), slot, '子与父同色号');
}

// ---- 场景 2：父未启用 → 完全不着色 ----
{
  const fieldMap = {
    dora_enabled: { __parents: [] },
    dora_mode: { __parents: ['dora_enabled'] },
  };
  const els = [new FakeEl('dora_enabled'), new FakeEl('dora_mode')];
  const container = new FakeContainer(els);
  applyConditionalGroupTint(container, {
    config: { dora_enabled: false },
    ...makeDeps(fieldMap),
  });
  for (const el of els) {
    assert.equal(el.getAttribute('data-lx-cgroup'), null, '父未启用时不应着色');
  }
}

// ---- 场景 3：相邻两个启用父组必须异色（轮转色板核心保证）----
{
  const fieldMap = {
    dora_enabled: { __parents: [] },
    dora_mode: { __parents: ['dora_enabled'] },
    fera_enabled: { __parents: [] },
    fera_mode: { __parents: ['fera_enabled'] },
  };
  const els = [
    new FakeEl('dora_enabled'),
    new FakeEl('dora_mode'),
    new FakeEl('fera_enabled'),
    new FakeEl('fera_mode'),
  ];
  const container = new FakeContainer(els);
  applyConditionalGroupTint(container, {
    config: { dora_enabled: true, fera_enabled: true },
    ...makeDeps(fieldMap),
  });
  const doraSlot = els[0].getAttribute('data-lx-cgroup');
  const feraSlot = els[2].getAttribute('data-lx-cgroup');
  assert.ok(doraSlot != null && feraSlot != null, '两个父都应着色');
  assert.notEqual(doraSlot, feraSlot, '相邻父组必须异色');
  assert.equal(els[1].getAttribute('data-lx-cgroup'), doraSlot, 'dora 子同父色');
  assert.equal(els[3].getAttribute('data-lx-cgroup'), feraSlot, 'fera 子同父色');
}

// ---- 场景 4：选择器父（字符串值）不参与，避免整表染色 ----
{
  const fieldMap = {
    optimizer_type: { __parents: [] },
    // 假想一个只依赖选择器父的字段
    adamw_extra: { __parents: ['optimizer_type'] },
  };
  const els = [new FakeEl('optimizer_type'), new FakeEl('adamw_extra')];
  const container = new FakeContainer(els);
  applyConditionalGroupTint(container, {
    config: { optimizer_type: 'adamw' },
    ...makeDeps(fieldMap),
  });
  for (const el of els) {
    assert.equal(el.getAttribute('data-lx-cgroup'), null, '选择器父不参与着色');
  }
}

// ---- 场景 5：重复调用（重渲染）应先清理旧着色再重算，父从启用变禁用时残留清零 ----
{
  const fieldMap = {
    dora_enabled: { __parents: [] },
    dora_mode: { __parents: ['dora_enabled'] },
  };
  const els = [new FakeEl('dora_enabled'), new FakeEl('dora_mode')];
  const container = new FakeContainer(els);
  applyConditionalGroupTint(container, { config: { dora_enabled: true }, ...makeDeps(fieldMap) });
  assert.ok(els[0].getAttribute('data-lx-cgroup') != null, '首次应着色');
  // 关掉父，重渲染
  applyConditionalGroupTint(container, { config: { dora_enabled: false }, ...makeDeps(fieldMap) });
  for (const el of els) {
    assert.equal(el.getAttribute('data-lx-cgroup'), null, '关闭后残留应清零');
    assert.equal(el.getAttribute('data-lx-cgroup-role'), null, '角色残留应清零');
  }
}

console.log('conditionalGroupTintSmoke: ok (5 scenarios)');
