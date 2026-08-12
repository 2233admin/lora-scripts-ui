const DEFAULT_BACKEND_OFFLINE_MESSAGE = '未连接到后端,可能是因为VPN/防火墙或未启动后端';

export function createBackendHeartbeat({ state, renderTaskStatus, syncFooterAction, fetchImpl = fetch, interval = 3000 } = {}) {
  let backendOfflineDismissed = false;
  // 首次连通与「离线→恢复」切换时各通知一次父窗口，避免每次心跳都 postMessage。
  let backendConnectedNotified = false;

  function ensureBackendOfflineOverlay() {
    let overlay = document.getElementById('backend-offline-overlay');
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'backend-offline-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="backend-offline-panel" role="alert" aria-live="assertive">
        <button class="backend-offline-close" type="button" aria-label="关闭">×</button>
        <div class="backend-offline-title">${DEFAULT_BACKEND_OFFLINE_MESSAGE}</div>
      </div>
    `;
    overlay.querySelector('.backend-offline-close')?.addEventListener('click', () => {
      backendOfflineDismissed = true;
      overlay.classList.remove('visible');
      overlay.setAttribute('aria-hidden', 'true');
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function setBackendOffline(offline) {
    const nextOffline = Boolean(offline);
    const changed = state.backendOffline !== nextOffline;
    state.backendOffline = nextOffline;
    if (!nextOffline) {
      backendOfflineDismissed = false;
      // Notify parent launcher on first connect and on offline→online recovery only;
      // the heartbeat fires every few seconds and must not spam postMessage per probe.
      if (!backendConnectedNotified && window.parent !== window) {
        backendConnectedNotified = true;
        window.parent.postMessage({ type: 'WEBUI_BACKEND_CONNECTED' }, '*');
      }
    } else {
      backendConnectedNotified = false;
    }

    const overlay = ensureBackendOfflineOverlay();
    const visible = nextOffline && !backendOfflineDismissed;
    overlay.classList.toggle('visible', visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (changed) {
      renderTaskStatus();
      syncFooterAction();
    }
  }

  function startBackendHeartbeat() {
    let inFlight = false;

    async function probe() {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const response = await fetchImpl('/health', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`health check failed: ${response.status}`);
        }
        setBackendOffline(false);
      } catch (error) {
        if (!state.backendOffline) {
          console.warn('[BackendHeartbeat] 后端不可达。', error?.message || '');
        }
        setBackendOffline(true);
      } finally {
        inFlight = false;
      }
    }

    ensureBackendOfflineOverlay();
    probe();
    window.setInterval(probe, interval);
  }

  return {
    ensureBackendOfflineOverlay,
    setBackendOffline,
    startBackendHeartbeat,
  };
}
