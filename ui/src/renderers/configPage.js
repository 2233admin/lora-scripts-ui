import { applyConditionalGroupTint } from './conditionalGroupTint.js';
import { buildWaterfallMiniNavHTML, clampFloatingPanelIntoViewport } from './waterfallMiniNav.js';

export function createConfigPageRenderer({
  state,
  TRAINING_TYPES,
  escapeHtml,
  renderPreflightOverviewPanel,
  renderPreflightReport,
  renderSlot,
  renderExperimentalTrainingPanel,
  renderConfigSections,
  getVisibleSections,
  renderFloatingTrainingAssistant,
  renderNavigator,
  syncTopbarState,
  syncFooterAction,
  updateJSONPreview,
  setupWaterfallScrollSpy,
  getFieldConditionalParents,
  getFieldDefinition,
}) {
  function renderConfig(container) {
    const trainingType = state.activeTrainingType;
    const typeLabel = TRAINING_TYPES.find((type) => type.id === trainingType)?.label || trainingType;
    const waterfall = !!state.configWaterfall;
    const waterfallTwoColumn = waterfall && !!state.configWaterfallTwoColumn;

    // 瀑布流模式：先取可见分段，供正文渲染与浮动迷你导航共用同一份数据
    const visibleSections = getVisibleSections ? getVisibleSections(trainingType, waterfall) : [];
    const sectionHtml = renderConfigSections(trainingType, waterfall);
    const waterfallMiniNav = waterfall ? buildWaterfallMiniNavHTML({ visibleSections, state, escapeHtml }) : '';

    container.innerHTML = `
      <div class="form-container${waterfall ? ' form-container-waterfall form-container-waterfall-content' : ''}${waterfallTwoColumn ? ' form-container-waterfall-two-column' : ''}">
        <header class="section-title">
          <h2>${escapeHtml(typeLabel)} LoRA 模式</h2>
          <p>${waterfall ? `<span style="color:var(--text-muted);font-size:0.82rem;">📜 瀑布流模式：所有参数在同一页展示，可通过顶部标签栏快速跳转。${waterfallTwoColumn ? ' 当前启用紧凑双排显示。' : ''}</span>` : ''}</p>
        </header>
        ${renderPreflightOverviewPanel()}
        ${renderPreflightReport()}
        ${renderSlot('training.preflight_panel')}
        ${renderSlot('config.after_status_deck')}
        ${renderExperimentalTrainingPanel()}
        ${waterfallMiniNav}
        ${waterfall ? `<div class="waterfall-content${waterfallTwoColumn ? ' waterfall-content-two-column' : ''}">${sectionHtml}</div>` : sectionHtml}
        ${renderFloatingTrainingAssistant()}
      </div>
    `;

    renderNavigator();
    syncTopbarState();
    syncFooterAction();
    updateJSONPreview();

    // 父子视觉分组：给"已启用的布尔父开关"展开出来的子项染上与父同档的轮转底色，
    // 相邻父组自动错开，便于分辨哪些子项属于同一个父（见 conditionalGroupTint.js）。
    applyConditionalGroupTint(container, {
      config: state.config || {},
      getFieldConditionalParents,
      getFieldDefinition,
    });

    // 浮动面板可能因折叠/展开或窗口尺寸变化而超出视口，渲染后立即收回可视范围。
    const clampPanels = () => {
      clampFloatingPanelIntoViewport('.floating-training-advisor', (pos) => {
        state.trainingAdvisorPosition = pos;
        localStorage.setItem('sd-rescripts:training-advisor-position', JSON.stringify(pos));
      });
      if (waterfall) {
        clampFloatingPanelIntoViewport('.waterfall-mini-nav', (pos) => {
          state.waterfallMiniNavPosition = pos;
          localStorage.setItem('sd-rescripts:waterfall-mini-nav-position', JSON.stringify(pos));
        });
      }
    };
    requestAnimationFrame(clampPanels);
    // 窗口 resize 时也重新 clamp，防止面板被挤出可视区域
    if (!state._floatingPanelResizeBound) {
      state._floatingPanelResizeBound = true;
      window.addEventListener('resize', () => requestAnimationFrame(clampPanels));
    }

    if (waterfall) {
      setupWaterfallScrollSpy?.(container);
    }
  }

  return {
    renderConfig,
  };
}
