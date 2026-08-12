import {
  createDefaultProgressivePhase,
  parseProgressivePhaseSchedule,
  progressivePhaseRows,
  serializeProgressivePhaseSchedule,
  updateProgressivePhaseSource,
} from '../features/progressivePhaseSchedule.js';

export function createProgressivePhaseEditorActions({
  state,
  showToast,
  syncConfigState,
  updateJSONPreview,
  renderView,
}) {
  const fieldKey = 'progressive_phase_schedule';
  const uiState = () => {
    state.progressivePhaseEditorUi ||= { error: '' };
    return state.progressivePhaseEditorUi;
  };

  function rememberPrevious(previous) {
    state.fieldUndo ||= {};
    if (!Object.hasOwn(state.fieldUndo, fieldKey)) state.fieldUndo[fieldKey] = previous;
  }

  function commit(document, phases, { render = true } = {}) {
    const previous = state.config[fieldKey];
    rememberPrevious(previous);
    state.config[fieldKey] = serializeProgressivePhaseSchedule(document, phases);
    uiState().error = '';
    syncConfigState();
    if (render) renderView('config');
    return true;
  }

  function editable() {
    const parsed = parseProgressivePhaseSchedule(state.config[fieldKey]);
    if (!parsed.valid) {
      uiState().error = parsed.error;
      showToast?.(parsed.error, 'error');
      renderView('config');
      return null;
    }
    return parsed;
  }

  function updateProgressivePhaseField(index, field, value) {
    const document = editable();
    const rowIndex = Number(index);
    if (!document || !Number.isInteger(rowIndex) || !document.phases[rowIndex]) return false;
    const phases = document.phases.slice();
    phases[rowIndex] = updateProgressivePhaseSource(phases[rowIndex], field, value);
    return commit(document, phases);
  }

  function addProgressivePhase(afterIndex = -1) {
    const document = editable();
    if (!document) return false;
    const phases = document.phases.slice();
    const rowIndex = Math.min(phases.length - 1, Math.max(0, Number(afterIndex)));
    const { rows } = progressivePhaseRows(serializeProgressivePhaseSchedule(document, phases));
    const row = rows[rowIndex];
    const midpoint = Number(((row.start + row.end) / 2).toFixed(4));
    phases[rowIndex] = updateProgressivePhaseSource(phases[rowIndex], 'end', midpoint);
    phases.splice(rowIndex + 1, 0, createDefaultProgressivePhase(phases.length, midpoint, row.end));
    return commit(document, phases);
  }

  function removeProgressivePhase(index) {
    const document = editable();
    const rowIndex = Number(index);
    if (!document || document.phases.length <= 1 || !Number.isInteger(rowIndex) || !document.phases[rowIndex]) return false;
    const phases = document.phases.slice();
    phases.splice(rowIndex, 1);
    return commit(document, phases);
  }

  function updateProgressivePhaseScheduleJson(raw) {
    const previous = state.config[fieldKey];
    rememberPrevious(previous);
    state.config[fieldKey] = String(raw ?? '');
    uiState().error = '';
    syncConfigState?.();
    if (!syncConfigState) updateJSONPreview?.();
    return true;
  }

  function applyProgressivePhaseScheduleJson() {
    const document = parseProgressivePhaseSchedule(state.config[fieldKey]);
    if (!document.valid) {
      uiState().error = document.error;
      showToast?.(document.error, 'error');
      renderView('config');
      return false;
    }
    return commit(document, document.phases);
  }

  function resetProgressivePhaseSchedule() {
    const document = { rootKind: 'object', root: {} };
    return commit(document, [createDefaultProgressivePhase()]);
  }

  return {
    addProgressivePhase,
    removeProgressivePhase,
    updateProgressivePhaseField,
    updateProgressivePhaseScheduleJson,
    applyProgressivePhaseScheduleJson,
    resetProgressivePhaseSchedule,
  };
}
