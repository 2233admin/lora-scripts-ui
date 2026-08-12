import { readUiPreferences, loadDeletedTaskIds } from './storage.js';
import { VISIBLE_TRAINING_TYPES } from '../trainingTypeRegistry.js';

const DEFAULT_TRAINING_TYPE = 'sdxl-lora';

function normalizeActiveTrainingType(typeId) {
  const candidate = String(typeId || '').trim();
  return VISIBLE_TRAINING_TYPES.some((type) => type.id === candidate && !type.disabled) ? candidate : DEFAULT_TRAINING_TYPE;
}

function loadPanelPosition(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch (_e) {
    return null;
  }
}

function loadTrainingAdvisorPosition() {
  return loadPanelPosition('sd-rescripts:training-advisor-position');
}

function loadWaterfallMiniNavPosition() {
  return loadPanelPosition('sd-rescripts:waterfall-mini-nav-position');
}

export function createInitialAppState({ createDefaultConfig }) {
  const uiPreferences = readUiPreferences();
  const activeTrainingType = normalizeActiveTrainingType(uiPreferences.activeTrainingType);
  return {
    compactLayout: false,
    importInputBound: false,
    pickerInputBound: false,
    navigatorWidth: uiPreferences.navigatorWidth,
    jsonPanelWidth: uiPreferences.jsonPanelWidth,
    fieldUndo: {},
    trainingIntentExplicitFields: {},
    activeFieldMenu: null,
    datasetSubTab: 'tagger',
    trainSubTab: 'monitor',
    bubbleClosedLoopHistoryFilter: 'all',
    selectedTool: '',
    builtinPicker: {
      open: false,
      fieldKey: '',
      pickerType: '',
      rootLabel: '',
      items: [],
    },
    layoutDefaults: {
      compactLayout: false,
      navigatorWidth: 240,
      jsonPanelWidth: 280,
    },
    jsonPanelCollapsed: uiPreferences.jsonPanelCollapsed,
    lang: 'zh',
    theme: uiPreferences.theme,
    roundedUI: uiPreferences.roundedUI,
    verticalTabs: uiPreferences.verticalTabs,
    configWaterfall: localStorage.getItem('sd-rescripts:config-waterfall') === 'true',
    configWaterfallTwoColumn: localStorage.getItem('sd-rescripts:config-waterfall-two-column') === 'true',
    // 方框点选式开关（同分段开关聚合为紧凑区块），默认开启；仅用户明确关闭时为 false
    compactCheckboxSwitches: localStorage.getItem('sd-rescripts:compact-checkbox-switches') !== 'false',
    trainingAdvisorCollapsed: localStorage.getItem('sd-rescripts:training-advisor-collapsed') === 'true',
    taskHistoryCollapsed: localStorage.getItem('sd-rescripts:task-history-collapsed') === 'true',
    trainingAdvisorPosition: loadTrainingAdvisorPosition(),
    waterfallMiniNavCollapsed: localStorage.getItem('sd-rescripts:waterfall-mini-nav-collapsed') === 'true',
    waterfallMiniNavPosition: loadWaterfallMiniNavPosition(),
    activeModule: 'config',
    activeTab: uiPreferences.activeTab,
    navigatorCollapsed: uiPreferences.navigatorCollapsed,
    sections: {
      'training-types': true,
      'preset-list': true,
    },
    accentColor: localStorage.getItem('accentColor') || null,
    activeTrainingType,
    config: createDefaultConfig(activeTrainingType),
    hasLocalDraft: false,
    presets: [],
    tasks: [],
    trainingFailed: false,
    taskSummaries: {},
    trainingSummary: null,
    trainingLogSnapshot: {
      taskId: '',
      html: '',
      updatedAt: 0,
    },
    activeTrainingTaskId: '',
    // When true, activeTrainingTaskId auto-follows newest running/queued task.
    trainingLogFollowLatest: true,
    trainingMetrics: {
      speeds: [],
      losses: [],
      epochs: [],
      startTime: null,
      lastStep: 0,
      totalSteps: 0,
    },
    interrogators: null,
    executionProfiles: [],
    runtime: null,
    preflight: null,
    pcieTransferBenchmark: null,
    datasetAnalysis: null,
    samplePrompt: null,
    runtimeError: '',
    pcieTransferBenchmarkError: '',
    lastMessage: '',
    backendOffline: false,
    sysMonitor: null,
    _taskHistoryDirty: false,
    _deletedTaskIds: loadDeletedTaskIds(),
    loading: {
      runtime: false,
      preflight: false,
      pcieTransferBenchmark: false,
      samplePrompt: false,
      run: false,
    },
  };
}
