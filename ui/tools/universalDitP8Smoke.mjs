import assert from 'node:assert/strict';
import {
  ALL_TRAINING_TYPES,
  buildRunConfig,
  createDefaultConfig,
  getFieldDefinition,
  isFieldVisible,
} from '../src/schemaIndex.js';

const typeId = 'sdxl-lora';
const trainingTypeIds = ALL_TRAINING_TYPES.map((item) => item.id);
assert.equal(trainingTypeIds.includes('universal-dit'), false, 'P8 must not add a training type');

const defaults = createDefaultConfig(typeId);
assert.equal(defaults.universal_dit_enabled, false, 'Universal DiT must remain default-off');
assert.equal(defaults.universal_dit_probe_mode, 'auto');
assert.equal(defaults.universal_dit_objective_template, 'auto');
assert.equal(defaults.universal_dit_target_policy, 'attention_mlp');
assert.equal(defaults.universal_dit_allow_fused_qkv, false);
assert.equal(defaults.universal_dit_allow_remote_download, false);
assert.equal(defaults.universal_dit_trust_remote_code, false);

const gatedKeys = [
  'universal_dit_probe_mode',
  'universal_dit_objective_template',
  'universal_dit_target_policy',
  'universal_dit_allow_fused_qkv',
  'universal_dit_allow_remote_download',
  'universal_dit_trust_remote_code',
];
for (const key of gatedKeys) {
  const field = getFieldDefinition(key, typeId);
  assert.ok(field?.visibleWhen, key + ' should keep visibleWhen');
  assert.equal(isFieldVisible(field, defaults), false, key + ' should be hidden while disabled');
  assert.equal(isFieldVisible(field, { ...defaults, universal_dit_enabled: true }), true, key + ' should show when enabled');
}

const targetModulesField = getFieldDefinition('universal_dit_target_modules_json', typeId);
const probeInputsField = getFieldDefinition('universal_dit_probe_inputs_json', typeId);
assert.equal(isFieldVisible(targetModulesField, { ...defaults, universal_dit_enabled: true }), false);
assert.equal(isFieldVisible(targetModulesField, {
  ...defaults,
  universal_dit_enabled: true,
  universal_dit_target_policy: 'explicit',
}), true);
assert.equal(isFieldVisible(probeInputsField, {
  ...defaults,
  universal_dit_enabled: true,
  universal_dit_probe_mode: 'static',
}), false);
assert.equal(isFieldVisible(probeInputsField, {
  ...defaults,
  universal_dit_enabled: true,
  universal_dit_probe_mode: 'forward',
}), true);

const disabledPayload = buildRunConfig(defaults, typeId);
assert.equal(disabledPayload.universal_dit_enabled, false);
for (const key of [...gatedKeys, 'universal_dit_target_modules_json', 'universal_dit_probe_inputs_json']) {
  assert.equal(disabledPayload[key], undefined, key + ' should be omitted while disabled');
}

const explicitTargets = '["blocks.0.attn.to_q","blocks.0.mlp.fc1"]';
const probeInputs = '{"kwargs":{"hidden_states":{"shape":[1,4,8]}}}';
const enabledPayload = buildRunConfig({
  ...defaults,
  universal_dit_enabled: true,
  universal_dit_probe_mode: 'train_smoke',
  universal_dit_objective_template: 'flow_matching',
  universal_dit_target_policy: 'explicit',
  universal_dit_allow_fused_qkv: true,
  universal_dit_allow_remote_download: true,
  universal_dit_trust_remote_code: true,
  universal_dit_target_modules_json: explicitTargets,
  universal_dit_probe_inputs_json: probeInputs,
}, typeId);
assert.equal(enabledPayload.model_type, 'universal_dit');
assert.equal(enabledPayload.universal_dit_enabled, true);
assert.equal(enabledPayload.universal_dit_probe_mode, 'train_smoke');
assert.equal(enabledPayload.universal_dit_objective_template, 'flow_matching');
assert.equal(enabledPayload.universal_dit_target_policy, 'explicit');
assert.equal(enabledPayload.universal_dit_allow_fused_qkv, true);
assert.equal(enabledPayload.universal_dit_allow_remote_download, true);
assert.equal(enabledPayload.universal_dit_trust_remote_code, true);
assert.equal(enabledPayload.universal_dit_target_modules_json, explicitTargets);
assert.equal(enabledPayload.universal_dit_probe_inputs_json, probeInputs);

const staleHiddenPayload = buildRunConfig({
  ...defaults,
  universal_dit_enabled: true,
  universal_dit_probe_mode: 'static',
  universal_dit_target_policy: 'attention_mlp',
  universal_dit_target_modules_json: explicitTargets,
  universal_dit_probe_inputs_json: probeInputs,
}, typeId);
assert.equal(staleHiddenPayload.universal_dit_target_modules_json, undefined);
assert.equal(staleHiddenPayload.universal_dit_probe_inputs_json, undefined);

const animaEditDefaults = createDefaultConfig('anima-edit-model');
const animaDisabledPayload = buildRunConfig(animaEditDefaults, 'anima-edit-model');
assert.equal(animaDisabledPayload.model_type, 'anima', 'disabled Universal DiT must preserve an explicit schema route');
const animaEnabledPayload = buildRunConfig({
  ...animaEditDefaults,
  universal_dit_enabled: true,
}, 'anima-edit-model');
assert.equal(animaEnabledPayload.model_type, 'universal_dit');

console.log('universalDitP8Smoke: ok');
