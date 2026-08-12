import assert from 'node:assert/strict';
import {
  ALL_TRAINING_TYPES as legacyTrainingTypes,
  buildRunConfig as buildLegacyRunConfig,
  createDefaultConfig as createLegacyDefaults,
  getSectionsForType as getLegacySections,
} from '../src/schemaIndex.js';
import { S_WEIGHT_COMPOSER as legacyComposerFields } from '../src/schemaFrontierGroups.js';
import {
  ALL_TRAINING_TYPES as reactTrainingTypes,
  buildRunConfig as buildReactRunConfig,
  createDefaultConfig as createReactDefaults,
  getSectionsForType as getReactSections,
} from '../../../Lulynx-evolution-ui/ui/src/schema/schemaIndex.js';
import { S_WEIGHT_COMPOSER as reactComposerFields } from '../../../Lulynx-evolution-ui/ui/src/schema/schemaFrontierGroups.js';

const TARGET_TYPES = [
  'anima-edit-model',
  'anima-lora',
  'flux-lora',
  'flux2-lora',
  'krea2-lora',
  'newbie-lora',
  'sdxl-lora',
  'zimage-lora',
  'wan22-ti2v-lora',
  'wan22-t2v-a14b-lora',
  'ltx23-lora',
  'boogu-lora',
  'boogu-edit-lora',
];
const ENABLED_KEYS = [
  'timestep_weighting_enabled',
  'noise_weighting_enabled',
  'sample_difficulty_weighting_enabled',
];
const CONDITIONAL_KEYS = [
  'timestep_weighting_mode',
  'timestep_weighting_strength',
  'noise_weighting_mode',
  'noise_weighting_strength',
  'sample_difficulty_weighting_mode',
  'sample_difficulty_metadata_path',
  'sample_difficulty_weighting_strength',
  'sample_difficulty_weighting_min',
  'sample_difficulty_weighting_max',
];
const PROVIDED_METADATA_KEY = 'sample_difficulty_metadata_path';
const PROVIDED_METADATA_PATH = 'D:/datasets/portraits/custom-difficulty.json';
const ENABLED_CONDITIONAL_VALUES = {
  timestep_weighting_mode: 'high',
  timestep_weighting_strength: 0.75,
  noise_weighting_mode: 'low',
  noise_weighting_strength: 1.25,
  sample_difficulty_weighting_mode: 'hard',
  sample_difficulty_weighting_strength: 1.5,
  sample_difficulty_weighting_min: 0.4,
  sample_difficulty_weighting_max: 3.5,
};

function sorted(values) {
  return [...values].sort();
}

function validateComposerGroup(name, fields) {
  assert.equal(new Set(fields.map((field) => field.key)).size, fields.length, `${name} composer field keys must be unique`);
  assert.deepEqual(
    sorted(fields.filter((field) => field.type === 'boolean').map((field) => field.key)),
    sorted(ENABLED_KEYS),
    `${name} should expose exactly the three opt-in switches`,
  );
  for (const key of ENABLED_KEYS) {
    assert.equal(fields.find((field) => field.key === key)?.defaultValue, false, `${name} ${key} must default to false`);
  }

  const metadataField = fields.find((field) => field.key === PROVIDED_METADATA_KEY);
  assert.ok(metadataField, `${name} should expose ${PROVIDED_METADATA_KEY}`);
  assert.equal(metadataField.type, 'file', `${name} difficulty metadata should use a file/text input`);
  assert.equal(metadataField.pickerType, 'text-file', `${name} difficulty metadata should use the text-file picker`);
  assert.equal(metadataField.defaultValue, '', `${name} difficulty metadata should default to auto discovery`);
  assert.match(metadataField.desc, /<train_data_dir>\/sample_difficulty\.json/, `${name} should document the auto-discovery path`);
  assert.equal(metadataField.visibleWhen({ sample_difficulty_weighting_enabled: false, sample_difficulty_weighting_mode: 'provided' }), false, `${name} metadata path must hide while difficulty weighting is disabled`);
  assert.equal(metadataField.visibleWhen({ sample_difficulty_weighting_enabled: true, sample_difficulty_weighting_mode: 'hard' }), false, `${name} metadata path must hide outside provided mode`);
  assert.equal(metadataField.visibleWhen({ sample_difficulty_weighting_enabled: true, sample_difficulty_weighting_mode: 'provided' }), true, `${name} metadata path must show in provided mode`);
}

function validateUi(name, { trainingTypes, getSections, createDefaults, buildRunConfig }) {
  const typeIds = trainingTypes.map((item) => item.id);
  const mountedTypes = [];

  for (const typeId of typeIds) {
    const composerSections = getSections(typeId).filter((section) => section.id === 'weight-composer');
    assert.ok(composerSections.length <= 1, `${name} ${typeId} must not mount WeightComposer more than once`);
    if (composerSections.length === 1) mountedTypes.push(typeId);
  }
  assert.deepEqual(sorted(mountedTypes), sorted(TARGET_TYPES), `${name} WeightComposer target schemas drifted`);

  for (const typeId of TARGET_TYPES) {
    const section = getSections(typeId).find((candidate) => candidate.id === 'weight-composer');
    assert.ok(section, `${name} ${typeId} should mount WeightComposer`);
    for (const key of ENABLED_KEYS) {
      assert.ok(section.fields.some((field) => field.key === key), `${name} ${typeId} should expose ${key}`);
    }

    const defaults = createDefaults(typeId);
    const payload = buildRunConfig({
      ...defaults,
      timestep_weighting_mode: 'high',
      noise_weighting_mode: 'low',
      sample_difficulty_weighting_mode: 'provided',
      [PROVIDED_METADATA_KEY]: PROVIDED_METADATA_PATH,
    }, typeId);
    for (const key of ENABLED_KEYS) {
      assert.equal(defaults[key], false, `${name} ${typeId} ${key} default must remain false`);
      assert.equal(payload[key], false, `${name} ${typeId} runConfigBuilder must not enable ${key}`);
    }
    for (const key of CONDITIONAL_KEYS) {
      assert.equal(payload[key], undefined, `${name} ${typeId} should omit disabled conditional field ${key}`);
    }

    const enabledPayload = buildRunConfig({
      ...defaults,
      ...Object.fromEntries(ENABLED_KEYS.map((key) => [key, true])),
      ...ENABLED_CONDITIONAL_VALUES,
    }, typeId);
    for (const key of ENABLED_KEYS) {
      assert.equal(enabledPayload[key], true, `${name} ${typeId} should serialize enabled ${key}`);
    }
    for (const [key, value] of Object.entries(ENABLED_CONDITIONAL_VALUES)) {
      assert.equal(enabledPayload[key], value, `${name} ${typeId} should serialize enabled conditional field ${key}`);
    }

    const nonProvidedPayload = buildRunConfig({
      ...defaults,
      sample_difficulty_weighting_enabled: true,
      sample_difficulty_weighting_mode: 'hard',
      [PROVIDED_METADATA_KEY]: PROVIDED_METADATA_PATH,
    }, typeId);
    assert.equal(nonProvidedPayload[PROVIDED_METADATA_KEY], undefined, `${name} ${typeId} should omit metadata path outside provided mode`);

    const autoProvidedPayload = buildRunConfig({
      ...defaults,
      sample_difficulty_weighting_enabled: true,
      sample_difficulty_weighting_mode: 'provided',
    }, typeId);
    assert.equal(defaults[PROVIDED_METADATA_KEY], '', `${name} ${typeId} metadata path should default to auto discovery`);
    assert.equal(autoProvidedPayload[PROVIDED_METADATA_KEY], undefined, `${name} ${typeId} should omit the empty auto-discovery path`);

    const explicitProvidedPayload = buildRunConfig({
      ...defaults,
      sample_difficulty_weighting_enabled: true,
      sample_difficulty_weighting_mode: 'provided',
      [PROVIDED_METADATA_KEY]: PROVIDED_METADATA_PATH,
    }, typeId);
    assert.equal(explicitProvidedPayload[PROVIDED_METADATA_KEY], PROVIDED_METADATA_PATH, `${name} ${typeId} should serialize an explicit provided metadata path`);
  }
}

validateComposerGroup('legacy UI', legacyComposerFields);
validateComposerGroup('React UI', reactComposerFields);
assert.deepEqual(
  legacyComposerFields.map((field) => field.key),
  reactComposerFields.map((field) => field.key),
  'both UIs should expose the same WeightComposer fields',
);
assert.deepEqual(
  legacyComposerFields.map(({ visibleWhen, ...field }) => field),
  reactComposerFields.map(({ visibleWhen, ...field }) => field),
  'both UIs should expose identical WeightComposer field definitions',
);
validateUi('legacy UI', {
  trainingTypes: legacyTrainingTypes,
  getSections: getLegacySections,
  createDefaults: createLegacyDefaults,
  buildRunConfig: buildLegacyRunConfig,
});
validateUi('React UI', {
  trainingTypes: reactTrainingTypes,
  getSections: getReactSections,
  createDefaults: createReactDefaults,
  buildRunConfig: buildReactRunConfig,
});

console.log('weightComposerSmoke: ok');
