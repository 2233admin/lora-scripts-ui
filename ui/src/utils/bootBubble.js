// Backend boot progress bubble for topbar.
// Shows "后端启动中…" with progress bar during backend startup/reload,
// then "已启动√" for 3s before fading out.
import { gsap } from './anim.js';
import { rawRequest } from '../apiTransport.js';

const POLL_INTERVAL_MS = 500;
const READY_DISMISS_DELAY_MS = 3000;
const HEALTH_TIMEOUT_MS = 2000;
const PROGRESS_CRAWL_DURATION_S = 20; // 0→90% over 20s, caps at 90% until health succeeds

export function createBootBubble() {
  let pollTimer = null;
  let progressTween = null;
  let dismissTimer = null;
  let state = 'idle'; // idle | booting | ready | dismissed

  function cleanup() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (progressTween) {
      progressTween.kill();
      progressTween = null;
    }
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  }

  function renderBubble(container, phase) {
    if (phase === 'booting') {
      container.innerHTML = `
        <div class="boot-bubble-content">
          <span class="boot-bubble-text">后端启动中…</span>
          <div class="boot-progress-track">
            <div class="boot-progress-bar" style="width: 0%;"></div>
          </div>
        </div>
      `;
      container.hidden = false;

      // Crawl progress 0→90% over PROGRESS_CRAWL_DURATION_S
      const bar = container.querySelector('.boot-progress-bar');
      if (bar) {
        progressTween = gsap.to(bar, {
          width: '90%',
          duration: PROGRESS_CRAWL_DURATION_S,
          ease: 'power1.out',
        });
      }
    } else if (phase === 'ready') {
      // Render ready state but immediately dismiss without showing
      container.innerHTML = `
        <div class="boot-bubble-content">
          <span class="boot-bubble-text">已启动 ✓</span>
          <div class="boot-progress-track">
            <div class="boot-progress-bar" style="width: 100%;"></div>
          </div>
        </div>
      `;
      container.hidden = false;
    }
  }

  async function probeHealth() {
    try {
      await rawRequest('/health', { timeoutMs: HEALTH_TIMEOUT_MS });
      return true;
    } catch (_err) {
      return false;
    }
  }

  function switchToReady(container) {
    if (state !== 'booting') return;
    state = 'dismissed';
    cleanup();

    // Immediately hide without showing ready state
    container.hidden = true;
    container.style.opacity = '';
    container.style.transform = '';
  }

  function startBootBubble() {
    const container = document.getElementById('topbar-boot-bubble');
    if (!container) {
      console.warn('[bootBubble] #topbar-boot-bubble not found, skipping.');
      return;
    }

    if (state !== 'idle') {
      return; // already running
    }

    state = 'booting';
    renderBubble(container, 'booting');

    // Poll /health every POLL_INTERVAL_MS
    pollTimer = setInterval(async () => {
      const ok = await probeHealth();
      if (ok) {
        switchToReady(container);
      }
    }, POLL_INTERVAL_MS);

    // Also probe immediately
    probeHealth().then((ok) => {
      if (ok) {
        switchToReady(container);
      }
    });
  }

  return { startBootBubble };
}
