import assert from 'node:assert/strict';
import {
  ALL_TRAINING_TYPES,
  TRAINING_TYPES,
  buildRunConfig,
  createDefaultConfig,
  getFieldDefinition,
} from '../src/schemaIndex.js';

function optionValues(options) {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    if (typeof option === 'string') return [option];
    if (!option || typeof option !== 'object') return [];
    if (Array.isArray(option.options)) return optionValues(option.options);
    return option.value == null ? [] : [option.value];
  });
}

function fieldOptionValues(key, typeId) {
  const field = getFieldDefinition(key, typeId);
  const options = typeof field?.options === 'function'
    ? field.options(createDefaultConfig(typeId))
    : field?.options;
  return optionValues(options || []);
}

const visibleTrainingTypeIds = new Set(TRAINING_TYPES.map((item) => item.id));
const allTrainingTypeEntries = new Map(ALL_TRAINING_TYPES.map((item) => [item.id, item]));
assert.equal(visibleTrainingTypeIds.has('krea2-lora'), true, 'krea2-lora should be visible now that backend route is wired');
assert.equal(visibleTrainingTypeIds.has('concept-edit'), false, 'concept-edit must stay hidden until backend route is wired');
assert.equal(Boolean(allTrainingTypeEntries.get('krea2-lora')?.disabled), false, 'krea2-lora should be selectable');
assert.equal(allTrainingTypeEntries.get('concept-edit')?.disabled, true);
for (const legacyTypeId of ['sdxl-ileco', 'sdxl-addift', 'sdxl-multi-addift', 'anima-ileco', 'anima-addift', 'anima-multi-addift']) {
  assert.equal(visibleTrainingTypeIds.has(legacyTypeId), false, `${legacyTypeId} should stay hidden from the navigator`);
  assert.equal(allTrainingTypeEntries.has(legacyTypeId), true, `${legacyTypeId} should remain loadable for saved configs`);
  assert.equal(Boolean(allTrainingTypeEntries.get(legacyTypeId)?.disabled), false, `${legacyTypeId} saved configs should not be rejected as disabled`);
}

const prodigyConfig = {
  ...createDefaultConfig('sdxl-lora'),
  optimizer_type: 'Prodigy',
  prodigy_d_coef: '3.5',
  prodigy_d0: '1e-6',
  optimizer_args_custom: 'weight_decay=0.02\nextra_flag=True',
  lr_scheduler: 'torch.optim.lr_scheduler.CosineAnnealingLR',
};
const prodigyPayload = buildRunConfig(prodigyConfig, 'sdxl-lora');
assert.equal(prodigyPayload.lr_scheduler, 'constant');
assert.equal(prodigyPayload.lr_scheduler_type, 'torch.optim.lr_scheduler.CosineAnnealingLR');
assert.deepEqual(prodigyPayload.optimizer_args, [
  'decouple=True',
  'weight_decay=0.02',
  'use_bias_correction=True',
  'd_coef=3.5',
  'd0=1e-6',
  'extra_flag=True',
]);
assert.equal(prodigyPayload.attention_backend, 'auto');

const lycorisConfig = {
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'lycoris.kohya',
  lycoris_algo: 'lokr',
  conv_dim: 8,
  conv_alpha: 4,
  lokr_factor: 2,
  full_matrix: true,
  network_args_custom: 'custom_arg=True',
  enable_base_weight: true,
  base_weights: 'a.safetensors\nb.safetensors',
  base_weights_multiplier: '0.25\n0.75',
};
const lycorisPayload = buildRunConfig(lycorisConfig, 'sdxl-lora');
assert.ok(lycorisPayload.network_args.includes('algo=lokr'));
assert.ok(lycorisPayload.network_args.includes('conv_dim=8'));
assert.ok(lycorisPayload.network_args.includes('factor=2'));
assert.ok(lycorisPayload.network_args.includes('full_matrix=True'));
assert.ok(lycorisPayload.network_args.includes('custom_arg=True'));
assert.equal(lycorisPayload.lycoris_algo, 'lokr');
assert.equal(lycorisPayload.lycoris_conv_dim, 8);
assert.equal(lycorisPayload.lycoris_conv_alpha, 4);
assert.equal(lycorisPayload.lycoris_lokr_factor, 2);
assert.equal(lycorisPayload.lokr_full_matrix, true);
assert.equal(lycorisPayload.base_weights, undefined);
assert.equal(lycorisPayload.base_weights_multiplier, undefined);
assert.equal('network_args_custom' in lycorisPayload, false);

const lycorisFullConfig = {
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'lycoris.kohya',
  lycoris_algo: 'full',
  dropout: 0.15,
};
const lycorisFullPayload = buildRunConfig(lycorisFullConfig, 'sdxl-lora');
assert.equal(lycorisFullPayload.lycoris_algo, 'full');
assert.equal(lycorisFullPayload.network_dropout, 0.15);
assert.ok(lycorisFullPayload.network_args.includes('algo=full'));
assert.ok(lycorisFullPayload.network_args.includes('dropout=0.15'));

const adapterMaskPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  adapter_mask_pruning_enabled: true,
  adapter_mask_pruning_target_ratio: 0.5,
  adapter_mask_pruning_warmup_steps: 12,
  adapter_mask_pruning_interval: 34,
  adapter_mask_pruning_min_rank: 2,
  adapter_mask_pruning_ema_decay: 0.91,
}, 'sdxl-lora');
assert.equal(adapterMaskPayload.adapter_mask_pruning_enabled, true);
assert.equal(adapterMaskPayload.adapter_mask_pruning_target_ratio, 0.5);
assert.equal(adapterMaskPayload.adapter_mask_pruning_warmup_steps, 12);
assert.equal(adapterMaskPayload.adapter_mask_pruning_interval, 34);
assert.equal(adapterMaskPayload.adapter_mask_pruning_min_rank, 2);
assert.equal(adapterMaskPayload.adapter_mask_pruning_ema_decay, 0.91);

const ditBlockskipPayload = buildRunConfig({
  ...createDefaultConfig('anima-lora'),
  dit_compute_reducer_strategy: 'blockskip',
  dit_compute_reducer_skip_ratio: 0.25,
  dit_compute_reducer_skip_every: 0,
  dit_compute_reducer_warmup_steps: 6,
  dit_compute_reducer_min_block: 2,
}, 'anima-lora');
assert.equal(ditBlockskipPayload.dit_compute_reducer_strategy, 'blockskip');
assert.equal(ditBlockskipPayload.dit_compute_reducer_skip_ratio, 0.25);
assert.equal(ditBlockskipPayload.dit_compute_reducer_skip_every, 0);
assert.equal(ditBlockskipPayload.dit_compute_reducer_warmup_steps, 6);
assert.equal(ditBlockskipPayload.dit_compute_reducer_min_block, 2);

const oftPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'networks.oft',
}, 'sdxl-lora');
assert.equal(oftPayload.network_module, 'lycoris.kohya');
assert.equal(oftPayload.lycoris_algo, 'diag-oft');
assert.ok(oftPayload.network_args.includes('algo=diag-oft'));

const lycorisAliasPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'lycoris',
  lycoris_algo: 'loha',
  dropout: 0.1,
}, 'sdxl-lora');
assert.equal(lycorisAliasPayload.network_module, 'lycoris.kohya');
assert.equal(lycorisAliasPayload.lycoris_algo, 'loha');
assert.ok(lycorisAliasPayload.network_args.includes('algo=loha'));
assert.ok(lycorisAliasPayload.network_args.includes('dropout=0.1'));

const animaPayload = buildRunConfig({
  ...createDefaultConfig('anima-lora'),
  lora_type: 'diag-oft',
}, 'anima-lora');
assert.equal(animaPayload.lora_type, 'diag-oft');

const newbiePayload = buildRunConfig({
  ...createDefaultConfig('newbie-lora'),
  adapter_type: 'full',
}, 'newbie-lora');
assert.equal(newbiePayload.adapter_type, 'full');

for (const [typeId, fieldKey] of [['anima-lora', 'lora_type'], ['newbie-lora', 'adapter_type']]) {
  const adapterOptions = getFieldDefinition(fieldKey, typeId)?.options || [];
  for (const adapter of ['lora', 'lora_plus', 'rs_lora', 'lora_fa', 'vera', 'tlora', 'flexrank', 'fera', 'gdlokr', 'locon', 'loha', 'lokr', 'glora', 'glokr', 'ia3', 'full', 'diag-oft', 'oft']) {
    assert.ok(adapterOptions.includes(adapter), `${typeId} should expose adapter ${adapter}`);
  }
  for (const separateToggle of ['dora', 'hydralora']) {
    assert.equal(adapterOptions.includes(separateToggle), false, `${typeId} should expose ${separateToggle} through its dedicated switch only`);
    assert.equal(getFieldDefinition(`${separateToggle}_enabled`, typeId)?.defaultValue, false);
  }
  for (const unsupported of ['eva', 'qlora', 'adalora', 'dylora', 'vb_lora', 'xlora', 'boft']) {
    assert.equal(adapterOptions.includes(unsupported), false, `${typeId} should not expose unsupported adapter ${unsupported}`);
  }
}

const sdxlNetworkOptions = fieldOptionValues('network_module', 'sdxl-lora');
for (const networkModule of ['networks.lora', 'networks.lora_fa', 'networks.vera', 'networks.tlora', 'networks.flexrank_lora', 'networks.oft', 'lycoris.kohya']) {
  assert.ok(sdxlNetworkOptions.includes(networkModule), `sdxl-lora should expose network module ${networkModule}`);
}
for (const unsupported of ['networks.dylora', 'networks.boft', 'networks.qlora']) {
  assert.equal(sdxlNetworkOptions.includes(unsupported), false, `sdxl-lora should not expose unsupported module ${unsupported}`);
}

const newbieOptimizerPayload = buildRunConfig({
  ...createDefaultConfig('newbie-lora'),
  optimizer_type: 'pytorch_optimizer.CAME',
  optimizer_args_custom: 'eps=1e-8',
  lr_scheduler: 'torch.optim.lr_scheduler.CosineAnnealingLR',
  lr_scheduler_args: 'T_max=10',
}, 'newbie-lora');
assert.equal(newbieOptimizerPayload.optimizer_type, 'PytorchOptimizer');
assert.deepEqual(newbieOptimizerPayload.optimizer_args, ['name=CAME', 'eps=1e-8']);
assert.equal(newbieOptimizerPayload.lr_scheduler, 'constant');
assert.equal(newbieOptimizerPayload.lr_scheduler_type, 'torch.optim.lr_scheduler.CosineAnnealingLR');
assert.deepEqual(newbieOptimizerPayload.lr_scheduler_args, ['T_max=10']);

const sdxlGenericOptimizerPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  optimizer_type: 'bitsandbytes.optim.AdEMAMix8bit',
  optimizer_args_custom: 'min_8bit_size=4096',
}, 'sdxl-lora');
assert.equal(sdxlGenericOptimizerPayload.optimizer_type, 'GenericOptimizer');
assert.deepEqual(sdxlGenericOptimizerPayload.optimizer_args, [
  'name=bitsandbytes.optim.AdEMAMix8bit',
  'min_8bit_size=4096',
]);

for (const typeId of ['sdxl-lora', 'anima-lora', 'newbie-lora']) {
  const optimizerOptions = fieldOptionValues('optimizer_type', typeId);
  assert.ok(optimizerOptions.includes('Automagic++'), `${typeId} should expose Automagic++`);
  assert.ok(optimizerOptions.includes('AutoProdigy'), `${typeId} should expose AutoProdigy`);
  assert.ok(optimizerOptions.includes('KahanAdamW'), `${typeId} should expose KahanAdamW`);
  assert.ok(optimizerOptions.includes('GenericOptimizer'), `${typeId} should expose GenericOptimizer`);
  assert.equal(
    optimizerOptions.includes('AnimaFactoredAdamW'),
    typeId === 'newbie-lora',
    `${typeId} should expose AnimaFactoredAdamW only when its schema allows it`,
  );
  assert.ok(optimizerOptions.includes('bitsandbytes.optim.AdEMAMix8bit'), `${typeId} should expose bitsandbytes class path`);
}

for (const typeId of ['sdxl-lora', 'sd-lora', 'anima-lora', 'newbie-lora', 'flux-lora']) {
  const field = getFieldDefinition('acceleration_profile', typeId);
  assert.ok(field, `${typeId} should expose acceleration_profile`);
  assert.equal(field.defaultValue, 'off');
  assert.deepEqual(fieldOptionValues('acceleration_profile', typeId), ['off', 'safe', 'balanced', 'aggressive', 'low_vram']);

  const payload = buildRunConfig({
    ...createDefaultConfig(typeId),
    acceleration_profile: typeId === 'flux-lora' ? 'balanced' : 'aggressive',
  }, typeId);
  assert.equal(payload.acceleration_profile, typeId === 'flux-lora' ? 'balanced' : 'aggressive');
}

const fluxOptimizerOptions = fieldOptionValues('optimizer_type', 'flux-lora');
assert.equal(fluxOptimizerOptions.includes('Automagic++'), false);
assert.equal(fluxOptimizerOptions.includes('AutoProdigy'), false);
assert.equal(fluxOptimizerOptions.includes('KahanAdamW8bit'), false);
assert.equal(fluxOptimizerOptions.includes('GenericOptimizer'), false);
assert.equal(fluxOptimizerOptions.includes('AnimaFactoredAdamW'), false);

const attentionConfig = {
  ...createDefaultConfig('hunyuan-image-lora'),
  attn_mode: 'flash',
  xformers: true,
  sageattn: true,
};
const attentionPayload = buildRunConfig(attentionConfig, 'hunyuan-image-lora');
assert.equal(attentionPayload.attention_backend, 'flash2');
assert.equal(attentionPayload.xformers, false);
assert.equal(attentionPayload.sageattn, false);

const lowVramAutotunePayload = buildRunConfig({
  ...createDefaultConfig('anima-lora'),
  low_vram_autotune_mode: 'conservative',
}, 'anima-lora');
assert.equal(lowVramAutotunePayload.low_vram_autotune_mode, 'conservative');

const krea2VramPresetField = getFieldDefinition('krea2_vram_preset', 'krea2-lora');
assert.ok(krea2VramPresetField, 'krea2-lora should expose krea2_vram_preset');
assert.equal(krea2VramPresetField.defaultValue, 'standard');
assert.deepEqual(fieldOptionValues('krea2_vram_preset', 'krea2-lora'), ['standard', 'aggressive']);

const krea2Payload = buildRunConfig({
  ...createDefaultConfig('krea2-lora'),
  krea2_vram_preset: 'aggressive',
}, 'krea2-lora');
assert.equal(krea2Payload.krea2_vram_preset, 'aggressive');

const krea2WeightCompressionField = getFieldDefinition('weight_compression_preset', 'krea2-lora');
assert.ok(krea2WeightCompressionField, 'krea2-lora should expose weight_compression_preset');
assert.ok(fieldOptionValues('weight_compression_preset', 'krea2-lora').includes('experimental_float8'));

const krea2NativeFp8Field = getFieldDefinition('fp8_base', 'krea2-lora');
assert.equal(krea2NativeFp8Field, undefined, 'krea2-lora should not expose native fp8_base in the main UI');

const krea2WeightCompressionVerifyField = getFieldDefinition('weight_compression_verify', 'krea2-lora');
assert.ok(krea2WeightCompressionVerifyField, 'krea2-lora should expose weight_compression_verify');
assert.equal(krea2WeightCompressionVerifyField.defaultValue, true);

const krea2Qfloat8Payload = buildRunConfig({
  ...createDefaultConfig('krea2-lora'),
  weight_compression_preset: 'experimental_float8',
  weight_compression_verify: false,
}, 'krea2-lora');
assert.equal(krea2Qfloat8Payload.weight_compression_preset, 'experimental_float8');
assert.equal(krea2Qfloat8Payload.weight_compression_verify, false);

for (const typeId of ['newbie-lora', 'krea2-lora']) {
  const rawAlphaMap = 'attention.qkv=16\nattention.out=8';
  const genericLayeredAlphaPayload = buildRunConfig({
    ...createDefaultConfig(typeId),
    network_alpha_map_json: rawAlphaMap,
  }, typeId);
  assert.equal(
    genericLayeredAlphaPayload.network_alpha_map_json,
    rawAlphaMap,
    `${typeId} should preserve generic network_alpha_map_json`,
  );
}

const animaGroupedLayeredAlphaPayload = buildRunConfig({
  ...createDefaultConfig('anima-lora'),
  layered_alpha_enabled: true,
  alpha_self_attn: 32,
  alpha_mlp: 8,
}, 'anima-lora');
assert.deepEqual(JSON.parse(animaGroupedLayeredAlphaPayload.network_alpha_map_json), {
  self_attn: 32,
  mlp: 8,
});

const semanticTrainingTypes = [
  'sdxl-lora', 'anima-lora', 'flux-lora', 'newbie-lora',
  'krea2-lora', 'flux2-lora', 'zimage-lora',
];
for (const typeId of semanticTrainingTypes) {
  const enabledField = getFieldDefinition('semantic_region_weighting_enabled', typeId);
  const providerField = getFieldDefinition('semantic_segmentation_provider', typeId);
  const modelPathField = getFieldDefinition('semantic_segmentation_model_path', typeId);
  const weightsField = getFieldDefinition('semantic_region_weights', typeId);
  assert.ok(enabledField, `${typeId} should expose semantic region weighting`);
  assert.ok(providerField, `${typeId} should expose semantic segmentation provider`);
  assert.ok(modelPathField, `${typeId} should expose semantic segmentation model path`);
  assert.equal(weightsField?.type, 'semantic_region_weights');
  assert.deepEqual(weightsField.defaultValue, [{
    region: 'face',
    start_weight: 0.3,
    schedule: 'linear',
    end_weight: 1,
    custom_curve: null,
  }]);
}

const semanticPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  semantic_region_weighting_enabled: true,
  semantic_segmentation_provider: 'transformers',
  semantic_segmentation_model_path: 'H:/models/segmentation',
  semantic_segmentation_cache_id: 'semantic-cache-1',
  semantic_region_weights: [
    { region: 'face', start_weight: '0.3', schedule: 'smoothstep', end_weight: '1.0', custom_curve: [{ x: 0, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 1, y: 1 }] },
    { region: 'hand', start_weight: '0.5', schedule: 'custom', end_weight: '1.5', custom_curve: [{ x: 0.2, y: 0.4 }, { x: 0.7, y: 0.8 }, { x: 0.4, y: 0.2 }, { x: 0.8, y: 0.6 }] },
    { region: 'arm', start_weight: 2, schedule: 'linear', end_weight: 2 },
    { region: 'not-a-region', start_weight: 1, schedule: 'linear', end_weight: 1 },
  ],
}, 'sdxl-lora');
assert.equal(semanticPayload.semantic_segmentation_provider, 'transformers');
assert.equal(semanticPayload.semantic_segmentation_model_path, 'H:/models/segmentation');
assert.equal(semanticPayload.semantic_segmentation_cache_id, 'semantic-cache-1');
assert.equal(semanticPayload.semantic_region_weights.length, 3, 'invalid semantic regions should be filtered without dropping canonical rows');
assert.deepEqual(semanticPayload.semantic_region_weights[0], {
  region: 'face',
  start_weight: 0.3,
  schedule: 'smoothstep',
  end_weight: 1,
  custom_curve: null,
});
assert.equal(semanticPayload.semantic_region_weights[1].region, 'hand', 'semantic region should use canonical singular key');
assert.equal(semanticPayload.semantic_region_weights[1].start_weight, 0.5);
assert.equal(semanticPayload.semantic_region_weights[1].end_weight, 1.5);
assert.equal(semanticPayload.semantic_region_weights[1].custom_curve.length, 4);
assert.deepEqual(semanticPayload.semantic_region_weights[1].custom_curve[0], { x: 0, y: 0 });
assert.deepEqual(semanticPayload.semantic_region_weights[1].custom_curve[3], { x: 1, y: 1 });
for (let index = 1; index < semanticPayload.semantic_region_weights[1].custom_curve.length; index += 1) {
  const previous = semanticPayload.semantic_region_weights[1].custom_curve[index - 1];
  const current = semanticPayload.semantic_region_weights[1].custom_curve[index];
  assert.ok(current.x > previous.x, 'custom curve x values should be strictly monotonic');
  assert.ok(current.y >= previous.y, 'custom curve y values should be monotonic');
}

const semanticDisabledPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  semantic_region_weighting_enabled: false,
  semantic_segmentation_provider: 'transformers',
  semantic_segmentation_model_path: 'H:/models/segmentation',
  semantic_segmentation_cache_id: 'stale-cache',
  semantic_region_weights: [{ region: 'face', start_weight: 0.3, schedule: 'linear', end_weight: 1 }],
}, 'sdxl-lora');
assert.equal(semanticDisabledPayload.semantic_region_weights, undefined);
assert.equal(semanticDisabledPayload.semantic_segmentation_cache_id, undefined);
assert.equal(semanticDisabledPayload.semantic_segmentation_provider, undefined);
assert.equal(semanticDisabledPayload.semantic_segmentation_model_path, undefined);
console.log('runConfigBuilderSmoke: ok');
