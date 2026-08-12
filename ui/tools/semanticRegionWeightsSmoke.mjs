import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  SEMANTIC_REGION_KEYS,
  createSemanticRegionWeightsActions,
  normalizeSemanticRegionWeightRows,
} from '../src/actions/semanticRegionWeightsActions.js';
import {
  buildSemanticRegionCurvePath,
  normalizeSemanticRegionCurve,
} from '../src/renderers/semanticRegionCurveEditor.js';
import { renderSemanticRegionWeightsField } from '../src/renderers/configFormTemplates.js';

assert.deepEqual(normalizeSemanticRegionWeightRows([]), [{
  region: 'face',
  start_weight: 0.3,
  schedule: 'linear',
  end_weight: 1,
  custom_curve: null,
}]);
for (const canonical of ['arm', 'hand', 'leg', 'foot']) assert.ok(SEMANTIC_REGION_KEYS.includes(canonical));

const normalizedCurve = normalizeSemanticRegionCurve([
  { x: 0.4, y: 0.5 },
  { x: 0.7, y: 0.8 },
  { x: 0.3, y: 0.2 },
  { x: 0.6, y: 0.4 },
]);
assert.equal(normalizedCurve.length, 4);
assert.deepEqual(normalizedCurve[0], { x: 0, y: 0 });
assert.deepEqual(normalizedCurve[3], { x: 1, y: 1 });
for (let index = 1; index < normalizedCurve.length; index += 1) {
  assert.ok(normalizedCurve[index].x > normalizedCurve[index - 1].x);
  assert.ok(normalizedCurve[index].y >= normalizedCurve[index - 1].y);
}
const smoothPath = buildSemanticRegionCurvePath(normalizedCurve);
assert.match(smoothPath, /\bC\b/, 'semantic curve should use cubic Bezier segments');
assert.doesNotMatch(smoothPath, /\bL\b/, 'semantic curve must not use line segments');

const state = {
  config: {
    train_data_dir: 'H:/datasets/semantic',
    semantic_region_weights: undefined,
    semantic_segmentation_provider: 'transformers',
    semantic_segmentation_model_path: 'H:/models/semantic',
    semantic_segmentation_cache_id: '',
  },
};
let syncCount = 0;
let previewRequest = null;
let cacheRequest = null;
const actions = createSemanticRegionWeightsActions({
  state,
  api: {
    async probeSemanticSegmentation(params) {
      return { status: 'available', capabilities: { available: true, provider: params.provider } };
    },
    async previewSemanticSegmentation(params) {
      previewRequest = params;
      return {
        status: 'ready',
        cache_id: 'preview-cache',
        image: { relative_path: 'person.png' },
        overlay: { data_url: 'data:image/png;base64,AAAA' },
        coverage: { face: 0.25, background: 0.75 },
      };
    },
    async buildSemanticSegmentationCache(params) {
      cacheRequest = params;
      return { status: 'ready', cache_id: 'built-cache', written: 8 };
    },
  },
  showToast() {},
  syncConfigState() { syncCount += 1; },
  updateJSONPreview() {},
  renderView() {},
});

assert.equal(actions.addSemanticRegionWeight(0), true);
assert.deepEqual(state.config.semantic_region_weights.map((row) => row.region), ['face', 'head']);
actions.removeSemanticRegionWeight(1);
assert.equal(state.config.semantic_region_weights.length, 1, 'at least one semantic row should remain');
assert.equal(actions.updateSemanticRegionWeight(0, 'region', 'arm_group'), false, 'non-canonical region keys should be rejected');
assert.equal(actions.updateSemanticRegionWeight(0, 'schedule', 'custom'), true);
assert.equal(state.config.semantic_region_weights[0].custom_curve.length, 4);

assert.equal(await actions.probeSemanticSegmentation(), true);
assert.equal(await actions.previewSemanticSegmentation(), true);
assert.equal(previewRequest.dataset_path, 'H:/datasets/semantic');
assert.equal(previewRequest.provider, 'transformers');
assert.equal(previewRequest.model_path, 'H:/models/semantic');
assert.equal(state.semanticSegmentationUi.overlayUrl, 'data:image/png;base64,AAAA');
assert.equal(state.config.semantic_segmentation_cache_id, 'preview-cache');
assert.equal(await actions.buildSemanticSegmentationCache(), true);
assert.equal(cacheRequest.action, 'build-cache');
assert.equal(state.config.semantic_segmentation_cache_id, 'built-cache');
assert.ok(syncCount > 0);

const html = renderSemanticRegionWeightsField({
  field: { key: 'semantic_region_weights', label: '语义区域训练权重', desc: 'test' },
  value: [
    { region: 'face', start_weight: 0.3, schedule: 'custom', end_weight: 1, custom_curve: normalizedCurve },
    { region: 'arm', start_weight: 0.5, schedule: 'custom', end_weight: 1.2, custom_curve: normalizedCurve },
  ],
  config: state.config,
  segmentationUi: state.semanticSegmentationUi,
  renderHeader: () => '<header>语义区域训练权重</header>',
  renderFieldDescription: () => '',
  renderConflictHint: () => '',
});
assert.equal((html.match(/type="range"/g) || []).length, 4, 'each row should render start/end range sliders');
assert.match(html, /semantic-start-value-0">0\.30</);
assert.match(html, /检查分割模型/);
assert.match(html, /随机预览/);
assert.match(html, /构建缓存/);
assert.match(html, /data-semantic-segmentation-status/);
assert.match(html, /data:image\/png;base64,AAAA/);
assert.equal((html.match(/data-semantic-curve-editor=/g) || []).length, 2, 'each custom row should own its curve editor');
const firstRow = html.indexOf('data-semantic-region-row-block="0"');
const firstControls = html.indexOf('data-semantic-region-row="0"', firstRow);
const firstCurve = html.indexOf('data-semantic-curve-editor="0"', firstControls);
const secondRow = html.indexOf('data-semantic-region-row-block="1"');
assert.ok(firstRow >= 0 && firstControls > firstRow && firstCurve > firstControls && secondRow > firstCurve, 'row 0 curve should be the next full row inside its own block');

const apiSourcePath = fileURLToPath(new URL('../src/api.js', import.meta.url));
const apiSource = await readFile(apiSourcePath, 'utf8');
for (const endpoint of [
  '/api/dataset/semantic-segmentation/probe',
  '/api/dataset/semantic-segmentation/preview',
  '/api/dataset/semantic-segmentation/build-cache',
]) assert.ok(apiSource.includes(endpoint), `api.js should call ${endpoint}`);

console.log('semanticRegionWeightsSmoke: ok');