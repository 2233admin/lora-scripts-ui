import {
  defaultSemanticRegionCurve,
  normalizeSemanticRegionCurve,
  refreshSemanticRegionCurveEditor,
} from '../renderers/semanticRegionCurveEditor.js';

export const SEMANTIC_REGION_KEYS = Object.freeze([
  'face', 'head', 'hair', 'upper_body', 'body', 'arm', 'hand',
  'leg', 'foot', 'clothing', 'subject', 'background', 'other',
]);

export const SEMANTIC_REGION_SCHEDULES = Object.freeze([
  'linear', 'ease_in', 'ease_out', 'smoothstep', 'hold_ramp_hold', 'custom',
]);

export function createDefaultSemanticRegionWeight(region = 'face') {
  return {
    region,
    start_weight: region === 'face' ? 0.3 : 1,
    schedule: 'linear',
    end_weight: 1,
    custom_curve: null,
  };
}

function parseRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

const finiteWeight = (value, fallback = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function normalizeSemanticRegionWeightRows(raw) {
  const used = new Set();
  const rows = [];
  for (const source of parseRows(raw)) {
    const requested = String(source?.region || '').trim();
    const region = SEMANTIC_REGION_KEYS.includes(requested) && !used.has(requested)
      ? requested
      : SEMANTIC_REGION_KEYS.find((candidate) => !used.has(candidate));
    if (!region) break;
    used.add(region);
    const defaults = createDefaultSemanticRegionWeight(region);
    const schedule = SEMANTIC_REGION_SCHEDULES.includes(source?.schedule) ? source.schedule : 'linear';
    rows.push({
      region,
      start_weight: finiteWeight(source?.start_weight, defaults.start_weight),
      schedule,
      end_weight: finiteWeight(source?.end_weight, defaults.end_weight),
      custom_curve: source?.custom_curve ? normalizeSemanticRegionCurve(source.custom_curve) : null,
    });
  }
  return rows.length ? rows : [createDefaultSemanticRegionWeight()];
}

function unwrapResponse(response) {
  if (response?.data && typeof response.data === 'object' && response.status === 'success') return response.data;
  return response || {};
}

function semanticStatusMessage(payload, fallback) {
  const reason = payload?.capabilities?.reason
    || payload?.provider?.reason
    || payload?.fallback?.reason
    || payload?.errors?.[0]
    || payload?.message;
  return reason ? `${fallback}：${reason}` : fallback;
}

function overlayUrlFrom(payload) {
  return payload?.overlay?.data_url
    || payload?.overlay?.media_url
    || payload?.overlay_data_url
    || payload?.overlay_media_url
    || payload?.data_url
    || payload?.media_url
    || '';
}

export function createSemanticRegionWeightsActions({
  state,
  api,
  showToast,
  syncConfigState,
  updateJSONPreview,
  renderView,
}) {
  const rowsForEdit = () => normalizeSemanticRegionWeightRows(state.config.semantic_region_weights);
  const uiState = () => {
    state.semanticSegmentationUi ||= {
      busyAction: '',
      status: '尚未检查分割模型。',
      error: '',
      overlayUrl: '',
      sourceName: '',
      coverage: {},
    };
    return state.semanticSegmentationUi;
  };

  function renderUi(patch = {}) {
    Object.assign(uiState(), patch);
    renderView('config');
  }

  function commitRows(rows, { render = false, sync = true, preview = true } = {}) {
    state.config.semantic_region_weights = normalizeSemanticRegionWeightRows(rows);
    if (sync) syncConfigState();
    else if (preview) updateJSONPreview();
    if (render) renderView('config');
  }

  function addSemanticRegionWeight(afterIndex = -1) {
    const rows = rowsForEdit();
    const used = new Set(rows.map((row) => row.region));
    const region = SEMANTIC_REGION_KEYS.find((candidate) => !used.has(candidate));
    if (!region) return false;
    const insertAt = Math.min(rows.length, Math.max(0, Number(afterIndex) + 1));
    rows.splice(insertAt, 0, createDefaultSemanticRegionWeight(region));
    commitRows(rows, { render: true });
    return true;
  }

  function removeSemanticRegionWeight(index) {
    const rows = rowsForEdit();
    if (rows.length <= 1) {
      rows[0] = createDefaultSemanticRegionWeight(rows[0]?.region || 'face');
    } else {
      rows.splice(Number(index), 1);
    }
    const activeIndex = Number(state.semanticRegionCurveActiveIndex);
    if (Number.isInteger(activeIndex)) {
      if (activeIndex === Number(index)) state.semanticRegionCurveActiveIndex = null;
      else if (activeIndex > Number(index)) state.semanticRegionCurveActiveIndex = activeIndex - 1;
    }
    commitRows(rows, { render: true });
  }

  function updateSemanticRegionWeight(index, key, value) {
    const rows = rowsForEdit();
    const rowIndex = Number(index);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return false;
    const row = { ...rows[rowIndex] };
    if (key === 'region') {
      const region = String(value || '').trim();
      if (!SEMANTIC_REGION_KEYS.includes(region)) return false;
      if (rows.some((candidate, candidateIndex) => candidateIndex !== rowIndex && candidate.region === region)) return false;
      row.region = region;
    } else if (key === 'start_weight' || key === 'end_weight') {
      row[key] = finiteWeight(value, row[key]);
    } else if (key === 'schedule') {
      if (!SEMANTIC_REGION_SCHEDULES.includes(value)) return false;
      row.schedule = value;
      if (value === 'custom') {
        row.custom_curve = normalizeSemanticRegionCurve(row.custom_curve || defaultSemanticRegionCurve());
        state.semanticRegionCurveActiveIndex = rowIndex;
      } else if (Number(state.semanticRegionCurveActiveIndex) === rowIndex) {
        state.semanticRegionCurveActiveIndex = null;
      }
    } else {
      return false;
    }
    rows[rowIndex] = row;
    commitRows(rows, { render: key === 'schedule' });
    if (key === 'start_weight' || key === 'end_weight') {
      const svg = globalThis.document?.querySelector?.(`[data-semantic-curve-svg="${rowIndex}"]`);
      if (svg) refreshSemanticRegionCurveEditor(svg, row.custom_curve, row.start_weight, row.end_weight);
    }
    return true;
  }

  function updateSemanticRegionCurvePoint(rowIndex, pointIndex, x, y, { sync = true } = {}) {
    const rows = rowsForEdit();
    const row = rows[Number(rowIndex)];
    const controlIndex = Number(pointIndex);
    if (!row || (controlIndex !== 1 && controlIndex !== 2)) return false;
    const points = normalizeSemanticRegionCurve(row.custom_curve || defaultSemanticRegionCurve());
    const previous = points[controlIndex - 1];
    const next = points[controlIndex + 1];
    points[controlIndex] = {
      x: Math.min(next.x - 0.02, Math.max(previous.x + 0.02, Number(x))),
      y: Math.min(next.y, Math.max(previous.y, Number(y))),
    };
    row.custom_curve = normalizeSemanticRegionCurve(points);
    row.schedule = 'custom';
    rows[Number(rowIndex)] = row;
    state.semanticRegionCurveActiveIndex = Number(rowIndex);
    commitRows(rows, { sync, preview: sync });
    return row.custom_curve;
  }

  function beginSemanticRegionCurveDrag(rowIndex, pointIndex, event) {
    const svg = event?.currentTarget?.closest?.('svg[data-semantic-curve-svg]');
    if (!svg || (Number(pointIndex) !== 1 && Number(pointIndex) !== 2)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.style.cursor = 'grabbing';
    const move = (pointerEvent) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (pointerEvent.clientX - rect.left) / rect.width;
      const y = 1 - (pointerEvent.clientY - rect.top) / rect.height;
      const points = updateSemanticRegionCurvePoint(rowIndex, pointIndex, x, y, { sync: false });
      if (!points) return;
      const row = rowsForEdit()[Number(rowIndex)];
      refreshSemanticRegionCurveEditor(svg, points, row.start_weight, row.end_weight);
    };
    const stop = () => {
      event.currentTarget.style.cursor = 'grab';
      event.currentTarget.removeEventListener('pointermove', move);
      event.currentTarget.removeEventListener('pointerup', stop);
      event.currentTarget.removeEventListener('pointercancel', stop);
      syncConfigState();
    };
    event.currentTarget.addEventListener('pointermove', move);
    event.currentTarget.addEventListener('pointerup', stop, { once: true });
    event.currentTarget.addEventListener('pointercancel', stop, { once: true });
  }

  function segmentationRequest(action) {
    return {
      schema_id: 'preprocess.semantic-segmentation',
      action,
      dataset_path: String(state.config.train_data_dir || state.config.dataset_path || '').trim(),
      provider: String(state.config.semantic_segmentation_provider || 'auto').trim(),
      model_path: String(state.config.semantic_segmentation_model_path || '').trim(),
      cache_id: String(state.config.semantic_segmentation_cache_id || '').trim(),
      recursive: true,
    };
  }

  async function runSemanticAction(action, request, { requireDataset = false } = {}) {
    if (uiState().busyAction) return null;
    const params = segmentationRequest(action);
    if (params.provider === 'disabled') {
      const message = '分割模型提供者已禁用。';
      renderUi({ status: message, error: message });
      showToast?.(message);
      return null;
    }
    if (!params.model_path) {
      const message = '请先填写本地分割模型路径。';
      renderUi({ status: message, error: message });
      showToast?.(message);
      return null;
    }
    if (requireDataset && !params.dataset_path) {
      const message = '请先填写训练数据集路径。';
      renderUi({ status: message, error: message });
      showToast?.(message);
      return null;
    }
    renderUi({ busyAction: action, status: action === 'probe' ? '正在检查分割模型…' : action === 'preview' ? '正在生成随机预览…' : '正在构建语义分割缓存…', error: '' });
    try {
      return unwrapResponse(await request(params));
    } catch (error) {
      const message = error?.message || '语义分割请求失败。';
      renderUi({ busyAction: '', status: message, error: message });
      showToast?.(message);
      return null;
    }
  }

  async function probeSemanticSegmentation() {
    const payload = await runSemanticAction('probe', (params) => api.probeSemanticSegmentation(params));
    if (!payload) return false;
    const available = payload.status === 'available' || payload.capabilities?.available === true;
    const status = semanticStatusMessage(payload, available ? '分割模型可用' : '分割模型不可用');
    renderUi({ busyAction: '', status, error: available ? '' : status });
    showToast?.(status);
    return available;
  }

  async function previewSemanticSegmentation() {
    const payload = await runSemanticAction('preview', (params) => api.previewSemanticSegmentation(params), { requireDataset: true });
    if (!payload) return false;
    const overlayUrl = overlayUrlFrom(payload);
    const ready = Boolean(overlayUrl) && ['ready', 'cached', 'success'].includes(String(payload.status || '').toLowerCase());
    const status = semanticStatusMessage(payload, ready ? '随机分割预览已生成' : '随机分割预览不可用');
    if (payload.cache_id) state.config.semantic_segmentation_cache_id = String(payload.cache_id);
    if (payload.cache_id) syncConfigState();
    renderUi({
      busyAction: '',
      status,
      error: ready ? '' : status,
      overlayUrl,
      sourceName: payload.image?.relative_path || payload.image?.name || payload.sample_path || '',
      coverage: payload.coverage && typeof payload.coverage === 'object' ? payload.coverage : {},
    });
    showToast?.(status);
    return ready;
  }

  async function buildSemanticSegmentationCache() {
    const payload = await runSemanticAction('build-cache', (params) => api.buildSemanticSegmentationCache(params), { requireDataset: true });
    if (!payload) return false;
    const ready = ['ready', 'success', 'completed'].includes(String(payload.status || '').toLowerCase());
    const cacheId = payload.cache_id || payload.semantic_segmentation_cache_id || '';
    if (cacheId) {
      state.config.semantic_segmentation_cache_id = String(cacheId);
      syncConfigState();
    }
    const count = Number(payload.written);
    const status = semanticStatusMessage(payload, ready
      ? `语义分割缓存已构建${Number.isFinite(count) ? `（${count} 张）` : ''}`
      : '语义分割缓存构建未完成');
    renderUi({ busyAction: '', status, error: ready ? '' : status });
    showToast?.(status);
    return ready;
  }

  return {
    addSemanticRegionWeight,
    removeSemanticRegionWeight,
    updateSemanticRegionWeight,
    updateSemanticRegionCurvePoint,
    beginSemanticRegionCurveDrag,
    probeSemanticSegmentation,
    previewSemanticSegmentation,
    buildSemanticSegmentationCache,
  };
}