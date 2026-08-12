import { reportWebuiError } from './utils/errorReporter.js';
import { globalConcurrencyLimit } from './utils/concurrencyLimit.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

export function formatApiMessage(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  if (Array.isArray(value)) {
    return value.map(formatApiMessage).filter(Boolean).join('; ');
  }

  for (const key of ['message', 'detail', 'error', 'reason']) {
    const text = formatApiMessage(value[key]);
    if (text) return text;
  }

  if (Array.isArray(value.errors) && value.errors.length) {
    const text = value.errors.map(formatApiMessage).filter(Boolean).join('; ');
    if (text) return text;
  }
  if (Array.isArray(value.issues) && value.issues.length) {
    const text = value.issues.map(formatApiMessage).filter(Boolean).join('; ');
    if (text) return text;
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

export async function request(path, options = {}) {
  // 应用并发控制,防止大量请求堵塞浏览器连接池
  // Chrome 对同一域名最多 6 个并发连接,我们限制为 4 个,留 2 个给关键请求
  return globalConcurrencyLimit.run(async () => {
    let response;
    try {
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const headers = isFormData
        ? { ...(options.headers || {}) }
        : options.body
          ? { ...JSON_HEADERS, ...(options.headers || {}) }
          : (options.headers || undefined);
      response = await fetch(path, {
        ...options,
        headers,
      });
    } catch (_networkError) {
      const error = new Error('无法连接到后端服务，请确认后端 (gui.py) 已启动。');
      reportWebuiError('api_network_error', error, { path, method: options.method || 'GET' });
      throw error;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      if (response.status === 502) {
        const error = new Error('后端服务未启动 (127.0.0.1:28000)，请先通过启动脚本或 gui.py 启动后端。');
        reportWebuiError('api_invalid_json', error, { path, status: response.status });
        throw error;
      }
      const error = new Error(`接口返回的 JSON 无效：${path}`);
      reportWebuiError('api_invalid_json', error, { path, status: response.status });
      throw error;
    }

    if (!response.ok) {
      const error = new Error(formatApiMessage(payload?.detail || payload?.message || payload) || `请求失败：${response.status}`);
      reportWebuiError('api_response_error', error, {
        path,
        status: response.status,
        payload,
      });
      throw error;
    }

    return payload;
  });
}

/**
 * 不经过 globalConcurrencyLimit 的原始请求，供长轮询使用（如文件选择器
 * /pick_file_result）。这类请求不能和页面健康检查/任务轮询抢同一批并发槽，
 * 否则冷启动或后端 --dev reload 期间会堵死浏览器连接池，连 /ui/ 静态资源都
 * Stalled 一两分钟。
 *
 * 与 request() 的区别：
 *   - 不排队（绕过 globalConcurrencyLimit）
 *   - 带 fetch 超时（AbortController），单个请求不会无限挂起占住连接槽
 */
export async function rawRequest(path, options = {}) {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(path, {
      headers: fetchOptions.body ? JSON_HEADERS : undefined,
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (err) {
    const error = err && err.name === 'AbortError'
      ? new Error(`请求超时 (${timeoutMs}ms)：${path}`)
      : new Error('无法连接到后端服务，请确认后端 (gui.py) 已启动。');
    reportWebuiError('api_network_error', error, { path, method: fetchOptions.method || 'GET' });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    if (response.status === 502) {
      const error = new Error('后端服务未启动 (127.0.0.1:28000)，请先通过启动脚本或 gui.py 启动后端。');
      reportWebuiError('api_invalid_json', error, { path, status: response.status });
      throw error;
    }
    const error = new Error(`接口返回的 JSON 无效：${path}`);
    reportWebuiError('api_invalid_json', error, { path, status: response.status });
    throw error;
  }

  if (!response.ok) {
    const error = new Error(formatApiMessage(payload?.detail || payload?.message || payload) || `请求失败：${response.status}`);
    reportWebuiError('api_response_error', error, {
      path,
      status: response.status,
      payload,
    });
    throw error;
  }

  return payload;
}

export function postJson(path, data) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function syncLocalTaskHistoryRemoval(taskId) {
  const normalizedId = String(taskId || '');
  if (!normalizedId) return;
  try {
    const history = await request('/api/local/task_history');
    const tasks = Array.isArray(history?.data?.tasks) ? history.data.tasks : [];
    const filtered = tasks.filter((task) => String(task?.id || task?.task_id || '') !== normalizedId);
    if (filtered.length !== tasks.length) {
      await postJson('/api/local/task_history', { tasks: filtered });
    }
  } catch (_e) {
    // Local cache sync failure should not affect the authoritative backend mutation.
  }
}

export async function clearLocalTaskHistoryFile() {
  try {
    await request('/api/local/task_history', { method: 'DELETE' });
  } catch (_e) {
    // Ignore local cache cleanup failures.
  }
}
