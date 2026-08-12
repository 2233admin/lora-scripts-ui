import {
  buildCatalogDownloadPayload,
  buildSemanticProviderPatch,
  formatResourceSize,
  mergeCatalogWithLocalResources,
  normalizeCatalogPayload,
} from '../resourceCenterCatalog.js';
import { _ico } from '../utils/dom.js';

const roleLabel = {
  direct_semantic: '直接语义区域',
  mask_proposal: 'Mask Proposal（仅候选掩码）',
  compound_grounded: '组合式 Grounded',
  unknown: '未知角色',
};
const statusLabel = {
  ready: '适配就绪',
  'manual-review': '需审核',
  'resource-only': '仅资源',
  gated: '需授权',
};
const policyLabel = { ready: '可安装', 'manual-review': '确认条款', 'resource-only': '仅资源', gated: '授权访问' };

export function createResourceCenterRenderer({ api, showToast, renderView }) {
  let items = [];
  let loading = false;
  let error = '';
  let selectedRoot = '';
  const filters = { query: '', category: '', role: '', status: '' };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function filtered() {
    const q = filters.query.toLowerCase();
    return items.filter((item) => (!q || `${item.title} ${item.title_en} ${item.key} ${item.model_id}`.toLowerCase().includes(q))
      && (!filters.category || item.category === filters.category)
      && (!filters.role || item.provider_role === filters.role)
      && (!filters.status || item.adapter_status === filters.status));
  }
  function options(field, label) {
    const values = [...new Set(items.map((i) => i[field]).filter(Boolean))];
    return `<option value="">${label}</option>${values.map((v) => `<option value="${esc(v)}" ${filters[field] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
  }
  function _statusIcon(status) {
    const map = { ready: 'check-circle', 'manual-review': 'alert-tri', 'resource-only': 'package', gated: 'shield' };
    return map[status] || 'package';
  }
  function _roleIcon(role) {
    const map = { direct_semantic: 'zap', mask_proposal: 'eye', compound_grounded: 'layers', unknown: 'help-circle' };
    return map[role] || 'package';
  }
  function card(item) {
    const warning = item.provider_role === 'mask_proposal'
      ? '<div class="resource-card-warning">此模型只能提出 mask 候选，不能直接输出面部/身体等语义区域。</div>'
      : item.provider_role === 'compound_grounded'
        ? '<div class="resource-card-warning">这是组合式模型，概念到语义区域仍需显式映射，不能自动猜测。</div>' : '';
    let action = '<button class="resource-action" disabled>不可用</button>';
    if (item.can_select) action = `<button class="resource-action primary" data-resource-action="select" data-resource-key="${esc(item.key)}">设为当前 provider</button>`;
    else if (item.can_download) action = `<button class="resource-action" data-resource-action="download" data-resource-key="${esc(item.key)}">${item.install_policy === 'gated' ? '授权并下载' : '下载资源'}</button>`;
    else if (item.installed) action = '<button class="resource-action" disabled>已安装，待适配</button>';
    return `<article class="resource-card"><div class="resource-card-head"><div class="resource-card-title-wrap"><span class="resource-card-icon">${_ico(_roleIcon(item.provider_role), 22)}</span><div><h3>${esc(item.title)}</h3><code>${esc(item.provider_id)}</code></div></div><div class="resource-card-badges"><b class="resource-role role-${esc(item.provider_role)}">${_ico(_roleIcon(item.provider_role), 12)} ${esc(roleLabel[item.provider_role])}</b><b class="resource-status status-${esc(item.adapter_status)}">${_ico(_statusIcon(item.adapter_status), 12)} ${esc(statusLabel[item.adapter_status])}</b></div></div>${warning}<dl class="resource-meta"><div><dt>分类</dt><dd>${esc(item.category)}</dd></div><div><dt>模型</dt><dd>${esc(item.model_id)}</dd></div><div><dt>大小</dt><dd>${formatResourceSize(item.size_bytes)}</dd></div><div><dt>来源</dt><dd>${esc(item.source_label)}</dd></div><div><dt>许可证</dt><dd>${esc(item.license)}</dd></div><div><dt>设备</dt><dd>${esc(item.device_requirement)}</dd></div><div><dt>支持区域</dt><dd>${esc(item.supported_regions.join('、') || '未声明')}</dd></div><div><dt>安装策略</dt><dd>${esc(policyLabel[item.install_policy] || item.install_policy)}</dd></div><div><dt>安装状态</dt><dd>${item.installed ? esc(item.local_path || '已安装') : '未安装'}</dd></div></dl><div class="resource-card-foot">${action}</div></article>`;
  }
  function render(container) {
    const visible = filtered();
    container.innerHTML = `<section class="resource-center"><header class="section-title"><h2>RESOURCE_CENTER</h2><p>SEG / SAM 语义区域资源。只有 ready + direct_semantic 且已安装，才能设为当前 provider。</p></header><div class="resource-toolbar"><input id="resource-search" placeholder="搜索模型 / provider" value="${esc(filters.query)}"><select id="resource-category">${options('category', '全部分类')}</select><select id="resource-role"><option value="">全部角色</option>${Object.entries(roleLabel).map(([v, l]) => `<option value="${v}" ${filters.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select><select id="resource-status">${options('adapter_status', '全部适配状态')}</select><button class="resource-action" data-resource-action="refresh">刷新</button><button class="resource-action" data-resource-action="local">选择本地模型</button></div><div class="resource-legend"><span>ready：可直接适配</span><span>mask_proposal：只提供候选 mask</span><span>组合式 / 仅资源：不能直接设为语义 provider</span></div>${loading ? '<div class="empty-state">正在加载资源目录…</div>' : error ? `<div class="empty-state"><strong>资源目录不可用</strong><span>${esc(error)}</span></div>` : visible.length ? `<div class="resource-grid">${visible.map(card).join('')}</div>` : '<div class="empty-state"><strong>没有匹配资源</strong><span>目录为空或当前筛选没有结果。</span></div>'}</section>`;
    bind(container);
  }
  function bind(container) {
    container.querySelector('#resource-search')?.addEventListener('input', (event) => { filters.query = event.target.value; render(container); });
    for (const [id, key] of [['resource-category', 'category'], ['resource-role', 'role'], ['resource-status', 'status']]) container.querySelector(`#${id}`)?.addEventListener('change', (event) => { filters[key] = event.target.value; render(container); });
    container.querySelectorAll('[data-resource-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.resourceAction;
      if (action === 'refresh') return load(container, true);
      if (action === 'local') return pickLocal(container);
      const item = items.find((entry) => entry.key === button.dataset.resourceKey);
      if (!item) return;
      try {
        if (action === 'download') {
          const accept = item.requires_license_acceptance || item.install_policy === 'manual-review' || item.install_policy === 'gated';
          if (accept && !window.confirm(`请确认已阅读并接受「${item.license}」的使用条款，然后继续下载。`)) return;
          let hfToken = '';
          if (item.requires_auth) hfToken = window.prompt('该资源需要 Hugging Face token；token 仅用于本次请求，不会保存。') || '';
          await api.downloadResourceFromCatalog(buildCatalogDownloadPayload(item, { acceptLicense: accept, hfToken }));
          showToast('资源下载完成，正在刷新本地资源');
          return load(container, true);
        }
        if (action === 'select') { const patch = buildSemanticProviderPatch(item); Object.entries(patch).forEach(([key, value]) => window.updateConfigValue?.(key, value)); showToast('已设置当前语义 provider'); renderView('config'); }
      } catch (err) { showToast(err?.message || '资源操作失败'); }
    }));
  }
  async function pickLocal(container) {
    try {
      const result = await api.pickFile('folder', 'semantic_segmentation_model_path');
      selectedRoot = result?.data?.path || result?.path || '';
      if (!selectedRoot) return;
      showToast('正在扫描本地 SEG/SAM 资源');
      await load(container, true);
    } catch (err) { showToast(err?.message || '选择本地模型失败'); }
  }
  async function load(container, refresh = false) {
    loading = true; error = ''; render(container);
    try {
      const [catalog, local] = await Promise.all([api.listResourceCatalog(), api.listLocalResources({ refresh, limit: 1000, roots: selectedRoot ? [selectedRoot] : [] })]);
      const localData = local?.data || local || {};
      items = mergeCatalogWithLocalResources(normalizeCatalogPayload(catalog), localData.resources || localData.items || []);
    } catch (err) { error = err?.message || '无法连接资源目录'; items = []; }
    finally { loading = false; render(container); }
  }
  return { renderResourceCenter: (container) => { render(container); void load(container); } };
}
