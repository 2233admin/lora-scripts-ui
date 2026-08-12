import assert from 'node:assert/strict';
import {
  createDefaultProgressivePhase,
  parseProgressivePhaseSchedule,
  progressivePhaseRows,
  serializeProgressivePhaseSchedule,
  updateProgressivePhaseSource,
} from '../src/features/progressivePhaseSchedule.js';
import { renderProgressivePhaseEditorField } from '../src/renderers/progressivePhaseEditor.js';
import { createProgressivePhaseEditorActions } from '../src/actions/progressivePhaseEditorActions.js';

const defaultPhase = createDefaultProgressivePhase();
assert.equal(defaultPhase.start, 0);
assert.equal(defaultPhase.end, 1);
assert.equal(parseProgressivePhaseSchedule('').phases.length, 1, 'blank schedule should render one default phase');

const raw = JSON.stringify({
  metadata: { owner: 'smoke', keep: true },
  phases: [{
    id: 'face', start: 0, end: 1, lr_scale: 0.3,
    module_policy: { train: ['attention'] },
    difficulty_policy: { mode: 'hard' },
    timestep_policy: { mode: 'middle' },
    resolution_hint: 512, rank_hint: { max: 4 },
    future_policy: { keep: 'me' },
  }],
});
const parsed = parseProgressivePhaseSchedule(raw);
assert.equal(parsed.valid, true);
const rows = progressivePhaseRows(raw).rows;
assert.deepEqual(rows[0], {
  source: parsed.phases[0],
  id: 'face',
  start: 0,
  end: 1,
  lrScale: 0.3,
  modulePolicy: 'attention',
  difficultyPolicy: 'hard',
  timestepPolicy: 'middle',
  resolution: 512,
  rank: 4,
});

const changed = updateProgressivePhaseSource(parsed.phases[0], 'lr_scale', '0.8');
assert.equal(changed.lr_scale, 0.8);
assert.deepEqual(changed.future_policy, { keep: 'me' }, 'unknown phase fields must survive structured edits');
const serialized = serializeProgressivePhaseSchedule(parsed, [changed]);
const serializedObject = JSON.parse(serialized);
assert.deepEqual(serializedObject.metadata, { owner: 'smoke', keep: true }, 'unknown top-level fields must survive');
assert.equal(serializedObject.phases[0].future_policy.keep, 'me');

const html = renderProgressivePhaseEditorField({
  field: { key: 'progressive_phase_schedule', label: 'Phase Editor', desc: 'test' },
  value: raw,
  renderHeader: () => '<header>Phase Editor</header>',
  renderFieldDescription: () => '',
  renderConflictHint: () => '',
});
assert.match(html, /data-progressive-phase-row="0"/);
for (const label of ['Phase ID', 'Start', 'End', 'LR Scale', 'Module Policy', 'Difficulty', 'Timestep', 'Resolution', 'Rank']) {
  assert.match(html, new RegExp(label), `missing ${label} column`);
}
assert.match(html, /onclick="addProgressivePhase\(0\)"/);
assert.match(html, /onclick="removeProgressivePhase\(0\)"/);
assert.match(html, /高级 JSON 导入 \/ 导出/);
assert.match(html, /progressive_phase_schedule/);

const state = { config: { progressive_phase_schedule: '' }, fieldUndo: {} };
let syncCount = 0;
let renderCount = 0;
const actions = createProgressivePhaseEditorActions({
  state,
  showToast() {},
  syncConfigState() { syncCount += 1; },
  updateJSONPreview() {},
  renderView() { renderCount += 1; },
});
assert.equal(actions.updateProgressivePhaseField(0, 'id', 'structure'), true);
let current = JSON.parse(state.config.progressive_phase_schedule);
assert.equal(current.phases[0].id, 'structure');
assert.equal(actions.addProgressivePhase(0), true);
current = JSON.parse(state.config.progressive_phase_schedule);
assert.equal(current.phases.length, 2);
assert.equal(current.phases[0].end, current.phases[1].start);
assert.equal(actions.updateProgressivePhaseField(1, 'resolution_hint', '768'), true);
assert.equal(JSON.parse(state.config.progressive_phase_schedule).phases[1].resolution_hint, 768);
assert.equal(actions.removeProgressivePhase(0), true);
assert.equal(JSON.parse(state.config.progressive_phase_schedule).phases.length, 1);
assert.ok(syncCount >= 4);
assert.ok(renderCount >= 4);

const arrayDocument = parseProgressivePhaseSchedule('[{"id":"a","start":0,"end":1,"x":1}]');
const arrayOutput = JSON.parse(serializeProgressivePhaseSchedule(arrayDocument, [
  updateProgressivePhaseSource(arrayDocument.phases[0], 'end', 0.5),
]));
assert.ok(Array.isArray(arrayOutput), 'array schedule shape should remain an array');
assert.equal(arrayOutput[0].x, 1);

actions.updateProgressivePhaseScheduleJson('{bad');
assert.equal(actions.applyProgressivePhaseScheduleJson(), false, 'invalid JSON should stay in fallback and not be applied');
actions.updateProgressivePhaseScheduleJson('{"phases":[{"id":"ok","start":0,"end":1}]}');
assert.equal(actions.applyProgressivePhaseScheduleJson(), true);
assert.equal(JSON.parse(state.config.progressive_phase_schedule).phases[0].id, 'ok');

console.log('progressivePhaseEditorSmoke: ok');
