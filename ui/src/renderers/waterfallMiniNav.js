// renderers/waterfallMiniNav.js — 瀑布流模式的浮动迷你参数导航。
// 从旧 main.js 移植：可折叠、可拖拽（手柄在头部）、位置/折叠状态持久化到 localStorage。
// 拖拽与折叠的 window 事件在 actions/trainingChrome.js 中注册。
import { _ico } from '../utils/dom.js';

export function buildWaterfallMiniNavHTML({ visibleSections, state, escapeHtml }) {
  if (!visibleSections || visibleSections.length === 0) return '';

  const groups = [];
  const groupMap = new Map();
  for (const section of visibleSections) {
    const key = section._tabKey || state.activeTab || 'config';
    if (!groupMap.has(key)) {
      const group = { key, label: section._tabLabel || key, sections: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
    groupMap.get(key).sections.push(section);
  }
  const collapsed = !!state.waterfallMiniNavCollapsed;
  const pos = state.waterfallMiniNavPosition;
  const positionStyle = pos
    ? ` style="left:${Math.max(0, Number(pos.x) || 0)}px;top:${Math.max(0, Number(pos.y) || 0)}px;right:auto;bottom:auto;"`
    : '';
  return `
    <aside class="waterfall-mini-nav ${collapsed ? 'is-collapsed' : ''}" aria-label="配置瀑布流导航"${positionStyle}>
      <div class="waterfall-mini-nav-head" onpointerdown="startWaterfallMiniNavDrag(event)">
        <div>
          <strong>${_ico('book-open', 14)} 参数导航</strong>
          <span>${groups.length} 类 · ${visibleSections.length} 段</span>
        </div>
        <button class="waterfall-mini-nav-toggle" type="button" onclick="toggleWaterfallMiniNav()" title="${collapsed ? '展开参数导航' : '收起参数导航'}" aria-label="${collapsed ? '展开参数导航' : '收起参数导航'}">${_ico('chevron-down', 14)}</button>
      </div>
      <button class="waterfall-mini-nav-mini" type="button" onclick="toggleWaterfallMiniNav()" onpointerdown="startWaterfallMiniNavDrag(event)" title="${groups.length} 类 · ${visibleSections.length} 段 · 点击展开参数导航" aria-label="${collapsed ? '展开参数导航' : '收起参数导航'}">
        ${_ico('book-open', 16)}
      </button>
      <div class="waterfall-mini-nav-collapsed-row">
        <span>${visibleSections.length} 个分段</span>
      </div>
      <div class="waterfall-mini-nav-body">
        <div class="waterfall-mini-nav-tree">
          ${groups.map((group) => `
            <div class="waterfall-mini-nav-group">
              <button class="waterfall-mini-nav-parent" type="button" onclick="document.getElementById('waterfall-tab-${escapeHtml(group.key)}')?.scrollIntoView({ behavior: 'smooth', block: 'start' })">${escapeHtml(group.label)}</button>
              <div class="waterfall-mini-nav-children">
                ${group.sections.map((section) => `
                  <button class="waterfall-mini-nav-child" type="button" onclick="document.getElementById('${escapeHtml(section.id)}')?.scrollIntoView({ behavior: 'smooth', block: 'start' })">${escapeHtml(section.title)}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </aside>
  `;
}

/**
 * 浮动面板可能因折叠/展开或窗口尺寸变化而超出视口，渲染后立即收回可视范围。
 * @param {string} selector 面板选择器
 * @param {(pos: {x:number,y:number}) => void} onClamp 收拢后的位置回调（负责持久化）
 */
export function clampFloatingPanelIntoViewport(selector, onClamp) {
  const panel = document.querySelector(selector);
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
  const x = Math.min(Math.max(margin, rect.left), maxX);
  const y = Math.min(Math.max(margin, rect.top), maxY);
  if (Math.abs(x - rect.left) < 1 && Math.abs(y - rect.top) < 1) return;
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  onClamp?.({ x, y });
}
