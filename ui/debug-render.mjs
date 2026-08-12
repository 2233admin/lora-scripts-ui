// 渲染冒烟：逐个模块调用 renderer，捕获合并后的运行时错误
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = {
  dispatchEvent: () => {}, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, setAttribute() {}, appendChild() {}, querySelector: () => null }),
  body: { appendChild() {} },
};
globalThis.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
globalThis.matchMedia = () => ({ matches: true });
window.matchMedia = globalThis.matchMedia;

const { createInitialAppState } = await import('./src/utils/appState.js');
const { createDefaultConfig } = await import('./src/schemaIndex.js');
const state = createInitialAppState({ createDefaultConfig });
state.tasks = [];
state.taskSummaries = {};

const container = { innerHTML: '', classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [], querySelector: () => null };
const noop = () => {};
const escapeHtml = (v) => String(v ?? '');
const t = (k) => k;

let failed = 0;

// settings
try {
  const { createSettingsRenderer } = await import('./src/renderers/settings.js');
  const renderSettings = createSettingsRenderer({ state, t, renderSlot: () => '', applyAndPersistLayout: noop, renderView: noop, applyTheme: noop, showToast: noop });
  renderSettings(container);
  console.log('settings OK, html len', container.innerHTML.length);
} catch (e) { failed++; console.error('settings FAIL:', e.message); }

// training
try {
  const { createTrainingRenderer } = await import('./src/renderers/training.js');
  const renderTraining = createTrainingRenderer({
    state, renderSlot: () => '',
    deps: { renderPreflightPanel: () => '', renderSamplesPanel: () => '', _buildSysMonitorHTML: () => '', syncFooterAction: noop, startTrainingLogPolling: noop, startSysMonitorPolling: noop, _pollSystemMonitor: noop },
  });
  renderTraining.renderTraining(container);
  console.log('training OK, html len', container.innerHTML.length);
} catch (e) { failed++; console.error('training FAIL:', e.message); }

// config
try {
  const { createConfigShellRenderer } = await import('./src/renderers/configShell.js');
  const { createConfigPageRenderer } = await import('./src/renderers/configPage.js');
  const schema = await import('./src/schemaIndex.js');
  const shell = createConfigShellRenderer({ state, UI_TABS: schema.UI_TABS, getAvailableTabs: schema.getAvailableTabs, getSectionsForTab: schema.getSectionsForTab, isFieldVisible: schema.isFieldVisible, renderSection: () => '<div></div>', escapeHtml });
  const renderConfig = createConfigPageRenderer({
    state, TRAINING_TYPES: schema.TRAINING_TYPES, escapeHtml,
    renderPreflightOverviewPanel: () => '', renderPreflightReport: () => '', renderSlot: () => '',
    renderExperimentalTrainingPanel: () => '', renderConfigSections: shell.renderSections,
    getVisibleSections: shell.getVisibleSections, renderFloatingTrainingAssistant: () => '',
    renderNavigator: noop, syncTopbarState: noop, syncFooterAction: noop, updateJSONPreview: noop,
    setupWaterfallScrollSpy: noop, getFieldConditionalParents: () => [], getFieldDefinition: schema.getFieldDefinition,
  }).renderConfig;
  renderConfig(container);
  console.log('config OK, html len', container.innerHTML.length);
} catch (e) { failed++; console.error('config FAIL:', e.message); }

process.exit(failed ? 1 : 0);
