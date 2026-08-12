// conditionalKeysCoverageSmoke.mjs
// 守卫「开了父开关子项不出现」这类腐化：断言每一个 visibleWhen 依赖的 config key
// 都能被联动重渲染键集合（手工 base ∪ 从 schema 自动推导）覆盖。
//
// 历史：CONDITIONAL_KEYS 早期靠手工清单维护，schema 一年内新增大量前沿字段后
// 漏登记 166 个父开关键，导致父开关打开时子项要等一次额外重渲染才出现。
// 现改为从 visibleWhen 自动推导（schemaCommon 谓词挂 .deps + 内联箭头源码正则兜底）。
// 本 smoke 把「自动推导必须覆盖全部 visibleWhen 依赖」钉成 CI 断言。
import assert from 'node:assert/strict';
import { collectConditionalKeys } from '../src/schemaIndex.js';
import * as schemaIndex from '../src/schemaIndex.js';
import { CONDITIONAL_KEYS as MANUAL } from '../src/utils/constants.js';

// 复用 schemaIndex 内部的源码正则兜底逻辑：这里独立实现一份等价抽取，
// 用来「独立地」重新扫描全部 visibleWhen 依赖，避免自证。
function extractKeysFromSource(fn) {
  const keys = new Set();
  let src;
  try { src = Function.prototype.toString.call(fn); } catch { return keys; }
  const paramMatch = src.match(/^\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)/);
  const param = paramMatch ? paramMatch[1] : null;
  if (!param) return keys;
  const dotRe = new RegExp(`\\b${param}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
  const braRe = new RegExp(`\\b${param}\\s*\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g');
  let m;
  while ((m = dotRe.exec(src))) keys.add(m[1]);
  while ((m = braRe.exec(src))) keys.add(m[1]);
  return keys;
}

// 独立枚举所有训练类型的所有字段 visibleWhen 依赖。
// getSectionsForType 覆盖 SECTIONS_MAP 的每个键；训练类型清单从 TRAINING_TYPES/ALL 取。
const { getSectionsForType, ALL_TRAINING_TYPES, TRAINING_TYPES } = schemaIndex;
const typeIds = new Set();
for (const t of [...(ALL_TRAINING_TYPES || []), ...(TRAINING_TYPES || [])]) {
  if (t && t.id) typeIds.add(t.id);
}
assert.ok(typeIds.size > 0, 'expected at least one training type');

const requiredDeps = new Set();
const seenFns = new Set();
for (const typeId of typeIds) {
  for (const section of getSectionsForType(typeId)) {
    for (const field of section.fields || []) {
      const vw = field.visibleWhen;
      if (typeof vw !== 'function' || seenFns.has(vw)) continue;
      seenFns.add(vw);
      if (vw.deps instanceof Set) {
        for (const k of vw.deps) requiredDeps.add(k);
      } else {
        for (const k of extractKeysFromSource(vw)) requiredDeps.add(k);
      }
    }
  }
}
assert.ok(requiredDeps.size > 50, `expected many visibleWhen deps, got ${requiredDeps.size}`);

// 合并键集：手工 base ∪ 运行时自动推导
const merged = new Set(MANUAL);
for (const k of collectConditionalKeys()) merged.add(k);

// 断言：所有 visibleWhen 依赖都被合并集覆盖。
// 排除少数一定不会被用户"点开"的伪键（若有以派生/常量方式引用的非配置字段）。
const IGNORED = new Set([
  // 派生 UI 分组占位键不参与用户输入联动，占位组本身的 visibleWhen 也在集合里，
  // 这里不需要额外白名单；保留空集，一旦将来出现真实误报再显式登记。
]);

const missing = [...requiredDeps].filter((k) => !merged.has(k) && !IGNORED.has(k)).sort();
assert.equal(
  missing.length,
  0,
  `以下 visibleWhen 依赖键未被 CONDITIONAL_KEYS 覆盖（父开关子项不会即时联动）：\n  ${missing.join('\n  ')}\n` +
  `修复：用 schemaCommon 的 when/all/oneOf 等组合器写 visibleWhen（自动带 .deps），` +
  `或内联箭头保持 (c) => c.key 形式以便源码兜底能抽到。`,
);

console.log(`conditionalKeysCoverageSmoke: ok (deps=${requiredDeps.size}, merged=${merged.size}, manual=${MANUAL.size})`);
