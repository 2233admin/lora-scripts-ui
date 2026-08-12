// P9 SEG/SAM resource-center catalog normalization.
// Resource metadata is deliberately kept separate from training runtime code.

export const PROVIDER_ROLES = ['direct_semantic', 'mask_proposal', 'compound_grounded', 'unknown'];
export const ADAPTER_STATUSES = ['ready', 'manual-review', 'resource-only', 'gated'];

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function list(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => text(item)).filter(Boolean))];
  if (typeof value === 'string') return [...new Set(value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean))];
  return [];
}

function basename(path) {
  return text(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.toLowerCase() || '';
}

export function normalizeProviderRole(value) {
  const role = text(value).toLowerCase().replaceAll('-', '_');
  if (['direct_semantic', 'semantic', 'semantic_segmentation', 'parsing'].includes(role)) return 'direct_semantic';
  if (['mask_proposal', 'proposal', 'sam', 'sam_mask', 'instance_mask'].includes(role)) return 'mask_proposal';
  if (['compound_grounded', 'grounded', 'grounded_segmentation'].includes(role)) return 'compound_grounded';
  return 'unknown';
}

export function normalizeAdapterStatus(value, { installed = false, hasSource = false } = {}) {
  const status = text(value).toLowerCase().replaceAll('_', '-');
  if (['ready', 'installed', 'available'].includes(status)) return 'ready';
  if (['gated', 'auth-required', 'requires-auth', 'license-gated'].includes(status)) return 'gated';
  if (['manual-review', 'review', 'experimental', 'needs-adapter'].includes(status)) return 'manual-review';
  if (['resource-only', 'asset-only', 'unsupported'].includes(status)) return 'resource-only';
  if (installed) return 'manual-review';
  return hasSource ? 'manual-review' : 'resource-only';
}

export function formatResourceSize(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) return '未知';
  if (size < 1024 ** 2) return `${Math.max(1, Math.round(size / 1024))} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

export function normalizeCatalogItem(raw = {}) {
  const localPath = text(raw.local_path || raw.install_path || raw.path);
  const installed = Boolean(raw.installed || localPath);
  const role = normalizeProviderRole(raw.provider_role || raw.capability_class || raw.role || raw.provider_kind);
  const download = raw.download || {};
  const source = raw.source || {};
  const sourceLicense = source.license || {};
  const sourceLabel = text(source.repository || source.url || raw.source_url, '未声明');
  const hasSource = Boolean(raw.url || raw.repo_id || raw.file_path || download.url || download.repository || source.url);
  const installPolicy = text(raw.install_policy || download.execution_policy, 'resource_only').toLowerCase().replaceAll('_', '-');
  const rawStatus = raw.adapter_status || raw.availability_status || raw.status;
  const adapterStatus = normalizeAdapterStatus(rawStatus, { installed, hasSource });
  const providerId = text(raw.provider_id || raw.provider || raw.id, 'unknown-provider');
  const title = text(raw.title_zh || raw.display_name || raw.title || raw.name || raw.title_en, providerId);
  const key = text(raw.key || raw.catalog_key || providerId || localPath, `resource-${title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')}`);
  const runtimeProviderId = text(raw.runtime_provider_id || raw.runtime_provider);
  const downloadable = !installed && Boolean(providerId) && ['ready', 'manual-review', 'resource-only', 'gated'].includes(installPolicy) && Boolean(download.repository || download.url || raw.model_id);
  return {
    ...raw,
    key,
    provider_id: providerId,
    runtime_provider_id: runtimeProviderId,
    model_id: text(raw.model_id || download.repository),
    title,
    title_en: text(raw.title_en || raw.title || raw.name, title),
    category: text(raw.resource_category || raw.category || raw.task || raw.kind, 'models').toLowerCase(),
    size_bytes: Math.max(0, Number(raw.size_bytes ?? raw.size ?? download.size_bytes ?? 0) || 0),
    license: text(raw.license || raw.license_name || raw.license_id || sourceLicense.name || sourceLicense.spdx_id, '未声明'),
    source_label: sourceLabel,
    device_requirement: text(raw.device_requirement || raw.device || raw.accelerator || raw.framework, 'CPU / GPU 取决于模型'),
    supported_regions: list(raw.supported_regions || raw.support_regions || raw.regions),
    provider_role: role,
    adapter_status: adapterStatus,
    install_policy: installPolicy,
    requires_license_acceptance: Boolean(raw.requires_license_acceptance || download.requires_license_acceptance),
    requires_auth: Boolean(raw.requires_auth || download.requires_auth),
    local_path: localPath,
    installed,
    can_download: downloadable,
    can_select: adapterStatus === 'ready' && role === 'direct_semantic' && Boolean(localPath) && Boolean(runtimeProviderId),
  };
}

function localMatch(catalog, local) {
  const catalogKey = text(catalog.key).toLowerCase();
  const localKeys = [local.catalog_key, local.resource_key, local.provider_id, ...(Array.isArray(local.provider_ids) ? local.provider_ids : []), local.key]
    .map((value) => text(value).toLowerCase()).filter(Boolean);
  if (catalogKey && localKeys.includes(catalogKey)) return true;
  const targetNames = [catalog.filename, catalog.file_path, catalog.target_subdir, catalog.repo_id, catalog.model_id, catalog.provider_id].map(basename).filter(Boolean);
  const localNames = [local.path, local.relative_path, local.name].map(basename).filter(Boolean);
  return targetNames.some((name) => localNames.includes(name));
}

export function mergeCatalogWithLocalResources(catalogItems = [], localItems = []) {
  return catalogItems.map((entry) => {
    const base = normalizeCatalogItem(entry);
    const match = localItems.find((local) => localMatch(base, local));
    if (!match) return base;
    const localPath = text(match.path || match.local_path || match.root);
    return normalizeCatalogItem({ ...base, local_path: localPath, installed: true });
  });
}

export function buildSemanticProviderPatch(item) {
  const normalized = normalizeCatalogItem(item);
  if (!normalized.can_select) throw new Error('只有 ready / direct_semantic 且已安装的资源可以设为当前 provider');
  return { semantic_region_weighting_enabled: true, semantic_segmentation_provider: normalized.runtime_provider_id, semantic_segmentation_model_path: normalized.local_path };
}

export function buildCatalogDownloadPayload(item, options = {}) {
  const normalized = normalizeCatalogItem(item);
  if (!normalized.can_download) throw new Error(`资源状态 ${normalized.adapter_status} / 安装策略 ${normalized.install_policy} 不允许下载`);
  return {
    provider_id: normalized.provider_id,
    allow_network: true,
    accept_license: Boolean(options.acceptLicense),
    hf_token: options.hfToken || '',
  };
}

export function normalizeCatalogPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.providers) ? data.providers : Array.isArray(data) ? data : [];
  return items.map(normalizeCatalogItem);
}
