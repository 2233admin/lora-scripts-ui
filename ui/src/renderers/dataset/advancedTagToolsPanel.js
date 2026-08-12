// renderers/dataset/advancedTagToolsPanel.js — 高级标签工具（P1/P2/P3 统一单 Tab）
//
// 内部二级分段：集成打标 / 结构化 / 近重复 / 频率批量 / 审查队列 / 版本历史 /
//               策略包 / 重标队列 / 一键管线 / 跨数据集情报
// 所有写操作均遵循 preview→apply 两段式，后端按 advanced_enabled 门控。
//
// 依赖（工厂注入）：api、$、escapeHtml、showToast

const SEGMENTS = [
  { id: 'pipeline', label: '一键管线' },
  { id: 'ensemble', label: '集成打标' },
  { id: 'structure', label: '结构化' },
  { id: 'dedupe', label: '近重复' },
  { id: 'contentscan', label: '内容扫描' },
  { id: 'cachehealth', label: '缓存健康' },
  { id: 'frequency', label: '频率批量' },
  { id: 'review', label: '审查队列' },
  { id: 'policy', label: '策略包' },
  { id: 'retag', label: '重标队列' },
  { id: 'version', label: '版本历史' },
  { id: 'cross', label: '跨数据集情报' },
];

export function createAdvancedTagToolsPanel({ api, $, escapeHtml, showToast }) {
  let activeSegment = 'pipeline';
  let advancedEnabled = null;

  const esc = (value) => escapeHtml(String(value ?? ''));

  function pathPicker(id, placeholder = './train/your_dataset') {
    return `
      <div class="config-group" style="grid-column:1/-1;">
        <label>数据集路径</label>
        <div class="input-picker">
          <button class="picker-icon" type="button" onclick="pickPathForInput('${id}', 'folder')">
            <svg class="icon"><use href="#icon-folder"></use></svg>
          </button>
          <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('${id}', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
          <input class="text-input" type="text" id="${id}" placeholder="${placeholder}">
        </div>
      </div>`;
  }

  function boolCard(id, label, checked = true) {
    return `
      <div class="config-group row boolean-card">
        <div class="label-col"><label>${label}</label></div>
        <label class="switch switch-compact"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="slider round"></span></label>
      </div>`;
  }

  function setResult(id, html) {
    const el = $('#' + id);
    if (el) el.innerHTML = html;
  }

  function busy(id, text = '处理中...') {
    setResult(id, `<div class="builtin-picker-empty"><span>${esc(text)}</span></div>`);
  }

  function errorBox(id, error) {
    setResult(id, `<div class="builtin-picker-empty"><span>${esc(error?.message || '操作失败')}</span></div>`);
  }

  function unwrap(response) {
    const data = response?.data;
    if (data && data.status === 'error') throw new Error(data.message || '后端返回错误');
    return data || {};
  }

  function samplesList(samples) {
    const rows = Array.isArray(samples) ? samples : [];
    if (!rows.length) return '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>没有需要改写的文件</strong></div></div>';
    return rows.map((s) => `
      <div class="module-list-item module-list-item-static">
        <div class="module-list-main">
          <strong>${esc(s.image_path || s.file || '-')}</strong>
          <span class="module-list-meta">前: ${esc(s.before || '')}</span>
          <span class="module-list-meta" style="color:var(--accent);">后: ${esc(s.after || '')}</span>
        </div>
      </div>`).join('');
  }

  // ---------------------------------------------------------------- shell

  async function renderAdvancedTagTools() {
    const content = $('#dataset-content');
    if (!content) return;
    if (advancedEnabled === null) {
      try {
        const status = await api.getTagEditorStatus();
        advancedEnabled = Boolean(status?.data?.advanced_enabled ?? status?.advanced_enabled);
      } catch (_e) {
        advancedEnabled = false;
      }
    }
    const nav = SEGMENTS.map((s) => (
      `<button class="dataset-tab ${activeSegment === s.id ? 'active' : ''}" type="button" onclick="switchAdvancedTagSegment('${s.id}')">${s.label}</button>`
    )).join('');
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>高级标签工具</h3></header>
        <div class="section-summary">集成打标、结构化、近重复、频率批量、审查/重标队列、版本历史、策略包、闭环管线与跨数据集情报。写操作均为预览→应用两段式。</div>
        ${advancedEnabled ? '' : '<div class="builtin-picker-empty" style="margin:8px 0;"><span>高级标签功能未启用：请在 tag_editor_config 中开启 advanced 能力后再使用。</span></div>'}
        <nav class="dataset-tabs" aria-label="高级标签工具分段" style="margin-bottom:12px;">${nav}</nav>
        <div id="adv-segment-body"></div>
      </section>`;
    renderSegment();
  }

  function switchAdvancedTagSegment(segment) {
    activeSegment = segment;
    renderSegment();
  }

  function renderSegment() {
    const body = $('#adv-segment-body');
    if (!body) return;
    const map = {
      pipeline: segPipeline,
      ensemble: segEnsemble,
      structure: segStructure,
      dedupe: segDedupe,
      contentscan: segContentScan,
      cachehealth: segCacheHealth,
      frequency: segFrequency,
      review: segReview,
      policy: segPolicy,
      retag: segRetag,
      version: segVersion,
      cross: segCross,
    };
    body.innerHTML = (map[activeSegment] || segPipeline)();
    if (activeSegment === 'policy') refreshPolicyPacks();
  }

  // ---------------------------------------------------------------- P3.3 pipeline

  function segPipeline() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-pipe-path')}
        <div class="config-group"><label>策略包 ID</label><input class="text-input" type="text" id="adv-pipe-pack" placeholder="sdxl_general_lora"></div>
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-pipe-route" placeholder="sdxl / anima / newbie"></div>
        <div class="config-group"><label>批量大小</label><input class="text-input" type="number" id="adv-pipe-batch" value="10" min="1"></div>
        ${boolCard('adv-pipe-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvPipelinePlan()">计划（只读）</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvPipelineRun()">运行闭环（写）</button>
      </div>
      <div id="adv-pipe-result" style="margin-top:16px;"></div>`;
  }

  function pipelineParams() {
    return {
      path: $('#adv-pipe-path')?.value?.trim() || '',
      policy_pack: $('#adv-pipe-pack')?.value?.trim() || '',
      route_family: $('#adv-pipe-route')?.value?.trim() || '',
      batch_size: Number($('#adv-pipe-batch')?.value || 10) || 10,
      create_backup: $('#adv-pipe-backup')?.checked ?? true,
    };
  }

  async function runAdvPipelinePlan() {
    const params = pipelineParams();
    if (!params.path || !params.policy_pack) { showToast('请填写数据集路径与策略包 ID。'); return; }
    busy('adv-pipe-result', '生成计划中...');
    try {
      const data = unwrap(await api.pipelinePlan(params));
      const q = data.queue_summary || {};
      const p = data.policy_summary || {};
      setResult('adv-pipe-result', `
        <div class="module-list">
          <div class="module-list-item module-list-item-static"><div class="module-list-main">
            <strong>计划（不写盘）</strong>
            <span class="module-list-meta">队列标记: ${q.flagged_count ?? '-'} / ${q.image_count ?? '-'} 图</span>
            <span class="module-list-meta">策略包将改: ${p.changed_count ?? '-'} / 扫描 ${p.scanned_caption_count ?? '-'}</span>
            <span class="module-list-meta">本批待处理: ${data.batch_size ?? 0}</span>
          </div></div>
          ${samplesList(data.policy_samples)}
        </div>`);
    } catch (error) { errorBox('adv-pipe-result', error); }
  }

  async function runAdvPipelineRun() {
    const params = pipelineParams();
    if (!params.path || !params.policy_pack) { showToast('请填写数据集路径与策略包 ID。'); return; }
    busy('adv-pipe-result', '运行闭环中...');
    try {
      const data = unwrap(await api.pipelineRun(params));
      const r = data.recheck || {};
      setResult('adv-pipe-result', `
        <div class="module-list">
          <div class="module-list-item module-list-item-static"><div class="module-list-main">
            <strong>闭环完成</strong>
            <span class="module-list-meta">改写文件: ${data.modified_count ?? 0} | 标记完成: ${data.marked_done_count ?? 0}</span>
            <span class="module-list-meta">备份: ${esc(data.backup_name || '（无）')}</span>
            <span class="module-list-meta" style="color:var(--accent);">问题数 ${r.findings_before ?? '-'} → ${r.findings_after ?? '-'}（解决 ${r.findings_resolved ?? 0}）</span>
          </div></div>
        </div>`);
      showToast('闭环清洗完成。');
    } catch (error) { errorBox('adv-pipe-result', error); }
  }

  // ---------------------------------------------------------------- P1.1 ensemble

  function segEnsemble() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-ens-path')}
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-ens-route" placeholder="sdxl / anima / newbie"></div>
        ${boolCard('adv-ens-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvEnsemblePreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvEnsembleApply()">应用（写）</button>
      </div>
      <div id="adv-ens-result" style="margin-top:16px;"></div>`;
  }

  function ensembleParams() {
    return {
      dir: $('#adv-ens-path')?.value?.trim() || '',
      route_family: $('#adv-ens-route')?.value?.trim() || '',
      create_backup: $('#adv-ens-backup')?.checked ?? true,
    };
  }

  async function runAdvEnsemblePreview() {
    const params = ensembleParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-ens-result', '预览中...');
    try {
      const data = unwrap(await api.ensembleTagPreview(params));
      const s = data.summary || {};
      setResult('adv-ens-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>集成打标预览</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-ens-result', error); }
  }

  async function runAdvEnsembleApply() {
    const params = ensembleParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-ens-result', '应用中...');
    try {
      const data = unwrap(await api.ensembleTagApply(params));
      setResult('adv-ens-result', `<div class="builtin-picker-empty"><span>集成打标已应用，改写 ${data.modified_count ?? 0} 个文件。</span></div>`);
      showToast('集成打标已应用。');
    } catch (error) { errorBox('adv-ens-result', error); }
  }

  // ---------------------------------------------------------------- P1.2 structure

  function segStructure() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-str-path')}
        <div class="config-group"><label>操作</label><input class="text-input" type="text" id="adv-str-op" placeholder="flat_to_structured"></div>
        ${boolCard('adv-str-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvStructurePreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvStructureApply()">应用（写）</button>
      </div>
      <div id="adv-str-result" style="margin-top:16px;"></div>`;
  }

  function structureParams() {
    return {
      dir: $('#adv-str-path')?.value?.trim() || '',
      operation: $('#adv-str-op')?.value?.trim() || 'flat_to_structured',
      create_backup: $('#adv-str-backup')?.checked ?? true,
    };
  }

  async function runAdvStructurePreview() {
    const params = structureParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-str-result', '预览中...');
    try {
      const data = unwrap(await api.structurePreview(params));
      const s = data.summary || {};
      setResult('adv-str-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>结构化预览</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-str-result', error); }
  }

  async function runAdvStructureApply() {
    const params = structureParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-str-result', '应用中...');
    try {
      const data = unwrap(await api.structureApply(params));
      setResult('adv-str-result', `<div class="builtin-picker-empty"><span>结构化已应用，改写 ${data.modified_count ?? 0} 个文件。</span></div>`);
      showToast('结构化已应用。');
    } catch (error) { errorBox('adv-str-result', error); }
  }

  // ---------------------------------------------------------------- P1.3 / P5 dedupe + cull

  function segDedupe() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-dup-path')}
        <div class="config-group"><label>宽高比容差</label><input class="text-input" type="number" id="adv-dup-aspect" value="0.02" min="0" max="1" step="0.01"></div>
        <div class="config-group"><label>最小簇大小</label><input class="text-input" type="number" id="adv-dup-minsize" value="2" min="2" step="1"></div>
        <div class="config-group"><label>保留策略</label>
          <select class="text-input" id="adv-dup-strategy">
            <option value="keep_first" selected>保留首张 (keep_first)</option>
            <option value="keep_best_caption">保留 caption 最长</option>
          </select>
        </div>
        ${boolCard('adv-dup-embed', '可选：CLIP 语义簇（更慢，大库慎用）', false)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvDedupe()">扫描近重复</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvDedupePlan()">预览隔离计划</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvDedupeQuarantine()">隔离多余</button>
      </div>
      <div class="module-list-item module-list-item-static" style="margin-top:8px;"><div class="module-list-main">
        <span class="module-list-meta">默认隔离到 output/.quarantine/near_dup/，不直接删除；可手动挪回。</span>
      </div></div>
      <div id="adv-dup-result" style="margin-top:16px;"></div>`;
  }

  function dedupeParams(extra = {}) {
    return {
      dir: $('#adv-dup-path')?.value?.trim() || '',
      aspect_tolerance: Number($('#adv-dup-aspect')?.value || 0.02) || 0.02,
      min_cluster_size: Number($('#adv-dup-minsize')?.value || 2) || 2,
      strategy: $('#adv-dup-strategy')?.value || 'keep_first',
      use_embedding_clusters: $('#adv-dup-embed')?.checked ?? false,
      ...extra,
    };
  }

  function flattenClusters(clusters) {
    if (Array.isArray(clusters)) return clusters;
    if (!clusters || typeof clusters !== 'object') return [];
    const out = [];
    for (const key of ['by_filename', 'by_dimension', 'by_hash', 'by_embedding', 'all']) {
      if (Array.isArray(clusters[key])) out.push(...clusters[key]);
    }
    if (!out.length) {
      for (const value of Object.values(clusters)) {
        if (Array.isArray(value)) out.push(...value);
      }
    }
    return out;
  }

  async function runAdvDedupe() {
    const params = dedupeParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-dup-result', '扫描中...');
    try {
      const data = unwrap(await api.nearDuplicatesReview(params));
      const clusters = flattenClusters(data.clusters);
      const flagged = data.summary?.flagged_image_count ?? '-';
      setResult('adv-dup-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>近重复簇: ${clusters.length}</strong>
        <span class="module-list-meta">涉及图片: ${esc(flagged)}</span></div></div>
        ${clusters.slice(0, 30).map((c) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>${esc(c.kind || 'cluster')}:${esc(c.key ?? c.cluster_id ?? '-')}（${(c.members || []).length} 张）</strong>
          <span class="module-list-meta">caption 一致: ${esc(c.caption_consistent ?? c.caption_consistency ?? '-')}</span></div></div>`).join('')}</div>`);
    } catch (error) { errorBox('adv-dup-result', error); }
  }

  async function runAdvDedupePlan() {
    const params = dedupeParams({ action: 'plan' });
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-dup-result', '生成隔离计划...');
    try {
      const data = unwrap(await api.nearDuplicatesCull(params));
      setResult('adv-dup-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>计划：保留 ${data.kept_count ?? 0} / 将隔离 ${data.culled_count ?? 0}</strong>
          <span class="module-list-meta">簇数 ${esc(data.plan?.cluster_count ?? data.review_summary?.filename_cluster_count ?? '-')}</span>
        </div></div>
        ${(data.culled || []).slice(0, 40).map((c) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>${esc(c.image_path)}</strong>
          <span class="module-list-meta">${esc(c.cluster_kind)} / ${esc(c.reason)}</span>
        </div></div>`).join('')}</div>`);
    } catch (error) { errorBox('adv-dup-result', error); }
  }

  async function runAdvDedupeQuarantine() {
    const params = dedupeParams({ action: 'quarantine' });
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    if (!window.confirm('将按「每簇保留一张」把多余图片隔离到 quarantine，是否继续？')) return;
    busy('adv-dup-result', '隔离中...');
    try {
      const data = unwrap(await api.nearDuplicatesCull(params));
      setResult('adv-dup-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>隔离完成：moved ${data.moved ?? 0}，跳过 ${data.skipped ?? 0}，失败 ${(data.failed || []).length}</strong>
          <span class="module-list-meta">目录: ${esc(data.quarantine_root || '-')}</span>
        </div></div></div>`);
      showToast(`已隔离 ${data.moved ?? 0} 张近重复。`);
    } catch (error) { errorBox('adv-dup-result', error); }
  }

  // ---------------------------------------------------------------- P5 content scan

  function segContentScan() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-cs-path')}
        <div class="config-group" style="grid-column:1/-1;">
          <label>分类器模型（本地 HF，可 CSV model:threshold=0.5）</label>
          <input class="text-input" type="text" id="adv-cs-models" value="Falconsai/nsfw_image_detection:threshold=0.5">
        </div>
        <div class="config-group"><label>最少票数</label><input class="text-input" type="number" id="adv-cs-votes" value="1" min="1" step="1"></div>
        <div class="config-group"><label>设备</label>
          <select class="text-input" id="adv-cs-device">
            <option value="cpu" selected>cpu</option>
            <option value="cuda">cuda</option>
          </select>
        </div>
      </div>
      <div class="module-list-item module-list-item-static"><div class="module-list-main">
        <span class="module-list-meta">本地过滤工具，非法律/合规结论；样本不上传，仅可能首次下载权重。默认只出报告。</span>
      </div></div>
      <div class="tool-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvContentScan()">扫描报告</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvContentQuarantine()">隔离 flagged</button>
      </div>
      <div id="adv-cs-result" style="margin-top:16px;"></div>`;
  }

  function contentScanParams(extra = {}) {
    return {
      directory: $('#adv-cs-path')?.value?.trim() || '',
      recursive: true,
      models: $('#adv-cs-models')?.value?.trim() || 'Falconsai/nsfw_image_detection:threshold=0.5',
      min_votes: Number($('#adv-cs-votes')?.value || 1) || 1,
      device: $('#adv-cs-device')?.value || 'cpu',
      ...extra,
    };
  }

  async function runAdvContentScan() {
    const params = contentScanParams({ action: 'report' });
    if (!params.directory) { showToast('请先填写数据集路径。'); return; }
    busy('adv-cs-result', '本地扫描中（首次可能下载模型）...');
    try {
      const data = await api.contentScan(params);
      const scan = data?.scan || data?.data?.scan || data || {};
      setResult('adv-cs-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>扫描 ${esc(scan.scanned_count ?? 0)} / flagged ${esc(scan.flagged_count ?? 0)}</strong>
          <span class="module-list-meta">报告: ${esc(scan.report_path || '-')}</span>
        </div></div>
        <div class="module-list-item module-list-item-static"><div class="module-list-main">
          <span class="module-list-meta">${esc(scan.disclaimer || '')}</span>
        </div></div>
        ${(scan.flagged_paths || []).slice(0, 40).map((p) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>${esc(p)}</strong>
        </div></div>`).join('')}</div>`);
    } catch (error) { errorBox('adv-cs-result', error); }
  }

  async function runAdvContentQuarantine() {
    const params = contentScanParams({ action: 'quarantine' });
    if (!params.directory) { showToast('请先填写数据集路径。'); return; }
    if (!window.confirm('将隔离扫描 flagged 的图片到 quarantine，是否继续？')) return;
    busy('adv-cs-result', '扫描并隔离中...');
    try {
      const data = await api.contentScan(params);
      const scan = data?.scan || data?.data?.scan || {};
      const apply = data?.apply || data?.data?.apply || {};
      setResult('adv-cs-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>flagged ${esc(scan.flagged_count ?? 0)} / moved ${esc(apply.moved ?? 0)}</strong>
          <span class="module-list-meta">${esc(apply.quarantine_root || scan.report_path || '-')}</span>
        </div></div></div>`);
      showToast(`内容扫描隔离 ${apply.moved ?? 0} 张。`);
    } catch (error) { errorBox('adv-cs-result', error); }
  }

  // ---------------------------------------------------------------- cache health (manifest)

  function segCacheHealth() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-ch-root', '缓存根目录（含 lulynx_cache_manifest_*.json）')}
        <div class="config-group"><label>族 family</label>
          <select class="text-input" id="adv-ch-family">
            <option value="anima" selected>anima</option>
            <option value="newbie">newbie</option>
            <option value="zimage">zimage</option>
          </select>
        </div>
        <div class="config-group"><label>校验模式</label>
          <select class="text-input" id="adv-ch-trust">
            <option value="strict" selected>strict（含 sha256）</option>
            <option value="trusted">trusted（跳过 hash，本地快迭代）</option>
          </select>
        </div>
      </div>
      <div class="module-list-item module-list-item-static"><div class="module-list-main">
        <span class="module-list-meta">只检查/隔离坏 cache 产物，不动源图。完整重建请用训练 native_cache_mode=rebuild_cache；本工具不做按 stem 半套 rebuild。</span>
      </div></div>
      <div class="tool-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvCacheHealthReport()">扫描报告</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvCacheHealthPlan()">预览修复计划</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvCacheHealthQuarantine()">隔离坏缓存</button>
      </div>
      <div id="adv-ch-result" style="margin-top:16px;"></div>`;
  }

  function cacheHealthParams(extra = {}) {
    return {
      root: $('#adv-ch-root')?.value?.trim() || '',
      family: $('#adv-ch-family')?.value || 'anima',
      trust_mode: $('#adv-ch-trust')?.value || 'strict',
      ...extra,
    };
  }

  function renderCacheHealthResult(data) {
    const q = data?.quarantine || {};
    const plan = data?.repair_plan || {};
    const stems = (data?.bad_stems || plan?.stems || []).slice(0, 40);
    const files = (data?.changed_files || data?.missing_files || plan?.files || []).slice(0, 40);
    return `<div class="module-list">
      <div class="module-list-item module-list-item-static"><div class="module-list-main">
        <strong>ok=${esc(String(data?.ok))} / bad_files=${esc(data?.bad_file_count ?? 0)} / action=${esc(data?.action || '-')}</strong>
        <span class="module-list-meta">manifest: ${esc(data?.manifest_path || '-')}</span>
      </div></div>
      <div class="module-list-item module-list-item-static"><div class="module-list-main">
        <span class="module-list-meta">missing ${esc((data?.missing_files || []).length)} · changed ${esc((data?.changed_files || []).length)} · stems ${esc((data?.bad_stems || []).length)}</span>
      </div></div>
      ${q.root ? `<div class="module-list-item module-list-item-static"><div class="module-list-main">
        <strong>quarantine moved ${esc(q.moved_count ?? 0)}</strong>
        <span class="module-list-meta">${esc(q.root)}</span>
      </div></div>` : ''}
      ${stems.length ? `<div class="module-list-item module-list-item-static"><div class="module-list-main">
        <span class="module-list-meta">bad stems: ${esc(stems.join(', '))}</span>
      </div></div>` : ''}
      ${files.slice(0, 20).map((p) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
        <strong>${esc(p)}</strong>
      </div></div>`).join('')}
      <div class="module-list-item module-list-item-static"><div class="module-list-main">
        <span class="module-list-meta">${esc(data?.rebuild_hint || data?.partial_rebuild_note || '')}</span>
      </div></div>
    </div>`;
  }

  async function runAdvCacheHealthReport() {
    const params = cacheHealthParams({ action: 'report' });
    if (!params.root) { showToast('请先填写缓存根目录。'); return; }
    busy('adv-ch-result', '校验 cache manifest...');
    try {
      const data = await api.cacheHealth(params);
      setResult('adv-ch-result', renderCacheHealthResult(data?.data || data));
    } catch (error) { errorBox('adv-ch-result', error); }
  }

  async function runAdvCacheHealthPlan() {
    const params = cacheHealthParams({ action: 'repair_plan' });
    if (!params.root) { showToast('请先填写缓存根目录。'); return; }
    busy('adv-ch-result', '生成修复计划（不改盘）...');
    try {
      const data = await api.cacheHealth(params);
      setResult('adv-ch-result', renderCacheHealthResult(data?.data || data));
    } catch (error) { errorBox('adv-ch-result', error); }
  }

  async function runAdvCacheHealthQuarantine() {
    const params = cacheHealthParams({ action: 'quarantine_bad' });
    if (!params.root) { showToast('请先填写缓存根目录。'); return; }
    if (!window.confirm('将隔离校验失败的 cache 文件到 quarantine（源图不动）。是否继续？')) return;
    busy('adv-ch-result', '隔离坏 cache...');
    try {
      const data = await api.cacheHealth(params);
      const body = data?.data || data;
      setResult('adv-ch-result', renderCacheHealthResult(body));
      showToast(`坏缓存隔离 ${body?.quarantine?.moved_count ?? body?.moved?.length ?? 0} 个文件。`);
    } catch (error) { errorBox('adv-ch-result', error); }
  }

  // ---------------------------------------------------------------- P1.4 frequency

  function segFrequency() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-freq-path')}
        <div class="config-group"><label>操作</label><input class="text-input" type="text" id="adv-freq-op" placeholder="prune_rare / promote_frequent"></div>
        <div class="config-group"><label>阈值</label><input class="text-input" type="number" id="adv-freq-threshold" value="3" min="0"></div>
        ${boolCard('adv-freq-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvFrequencyPreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvFrequencyApply()">应用（写）</button>
      </div>
      <div id="adv-freq-result" style="margin-top:16px;"></div>`;
  }

  function frequencyParams() {
    return {
      dir: $('#adv-freq-path')?.value?.trim() || '',
      operation: $('#adv-freq-op')?.value?.trim() || '',
      threshold: Number($('#adv-freq-threshold')?.value || 3) || 3,
      create_backup: $('#adv-freq-backup')?.checked ?? true,
    };
  }

  async function runAdvFrequencyPreview() {
    const params = frequencyParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-freq-result', '预览中...');
    try {
      const data = unwrap(await api.frequencyBatchPreview(params));
      const s = data.summary || {};
      setResult('adv-freq-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>频率批量预览</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-freq-result', error); }
  }

  async function runAdvFrequencyApply() {
    const params = frequencyParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-freq-result', '应用中...');
    try {
      const data = unwrap(await api.frequencyBatchApply(params));
      setResult('adv-freq-result', `<div class="builtin-picker-empty"><span>频率批量已应用，改写 ${data.modified_count ?? 0} 个文件。</span></div>`);
      showToast('频率批量已应用。');
    } catch (error) { errorBox('adv-freq-result', error); }
  }

  // ---------------------------------------------------------------- P1.5 review

  function segReview() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-rev-path')}
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-rev-route" placeholder="sdxl / anima / newbie"></div>
      </div>
      <div class="tool-actions"><button class="btn btn-outline btn-sm" type="button" onclick="runAdvReviewQueue()">构建审查队列</button></div>
      <div id="adv-rev-result" style="margin-top:16px;"></div>`;
  }

  async function runAdvReviewQueue() {
    const params = {
      dir: $('#adv-rev-path')?.value?.trim() || '',
      route_family: $('#adv-rev-route')?.value?.trim() || '',
    };
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-rev-result', '构建中...');
    try {
      const data = unwrap(await api.reviewQueue(params));
      const queues = data.queues || {};
      const keys = Object.keys(queues);
      setResult('adv-rev-result', `<div class="module-list">
        ${keys.length ? keys.map((k) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>${esc(k)}</strong><span class="module-list-meta">${(queues[k] || []).length} 项</span></div></div>`).join('')
          : '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>队列为空</strong></div></div>'}</div>`);
    } catch (error) { errorBox('adv-rev-result', error); }
  }

  // ---------------------------------------------------------------- P2.2 policy

  function segPolicy() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-pol-path')}
        <div class="config-group"><label>策略包</label><select id="adv-pol-pack" class="text-input"><option value="">加载中...</option></select></div>
        ${boolCard('adv-pol-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="refreshAdvPolicyPacks()">刷新策略包</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvPolicyPreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvPolicyApply()">应用（写）</button>
      </div>
      <div id="adv-pol-result" style="margin-top:16px;"></div>`;
  }

  async function refreshPolicyPacks() {
    const select = $('#adv-pol-pack');
    if (!select) return;
    try {
      const data = unwrap(await api.policyPackList({}));
      const packs = data.packs || [];
      select.innerHTML = packs.length
        ? packs.map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)}${p.builtin ? '（内置）' : ''}</option>`).join('')
        : '<option value="">（无策略包）</option>';
    } catch (_e) {
      select.innerHTML = '<option value="">加载失败</option>';
    }
  }

  function policyParams() {
    return {
      dir: $('#adv-pol-path')?.value?.trim() || '',
      pack_id: $('#adv-pol-pack')?.value || '',
      create_backup: $('#adv-pol-backup')?.checked ?? true,
    };
  }

  async function runAdvPolicyPreview() {
    const params = policyParams();
    if (!params.dir || !params.pack_id) { showToast('请填写路径并选择策略包。'); return; }
    busy('adv-pol-result', '预览中...');
    try {
      const data = unwrap(await api.policyPackPreview(params));
      const s = data.summary || {};
      setResult('adv-pol-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>策略包预览: ${esc(data.pack_id)}</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-pol-result', error); }
  }

  async function runAdvPolicyApply() {
    const params = policyParams();
    if (!params.dir || !params.pack_id) { showToast('请填写路径并选择策略包。'); return; }
    busy('adv-pol-result', '应用中...');
    try {
      const data = unwrap(await api.policyPackApply(params));
      setResult('adv-pol-result', `<div class="builtin-picker-empty"><span>策略包已应用，改写 ${data.modified_count ?? 0} 个文件。备份: ${esc(data.backup_name || '（无）')}</span></div>`);
      showToast('策略包已应用。');
    } catch (error) { errorBox('adv-pol-result', error); }
  }

  // ---------------------------------------------------------------- P2.3 retag

  function segRetag() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-retag-path')}
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-retag-route" placeholder="sdxl / anima / newbie"></div>
        <div class="config-group"><label>批量大小</label><input class="text-input" type="number" id="adv-retag-batch" value="10" min="1"></div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvRetagBuild()">构建队列</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvRetagNext()">下一批</button>
      </div>
      <div id="adv-retag-result" style="margin-top:16px;"></div>`;
  }

  function retagPath() { return $('#adv-retag-path')?.value?.trim() || ''; }

  async function runAdvRetagBuild() {
    const dir = retagPath();
    if (!dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-retag-result', '构建中...');
    try {
      const data = unwrap(await api.retagQueueBuild({ dir, route_family: $('#adv-retag-route')?.value?.trim() || '' }));
      renderRetagPriority(data);
    } catch (error) { errorBox('adv-retag-result', error); }
  }

  async function runAdvRetagNext() {
    const dir = retagPath();
    if (!dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-retag-result', '读取中...');
    try {
      const data = unwrap(await api.retagQueueNext({ dir, batch_size: Number($('#adv-retag-batch')?.value || 10) || 10 }));
      const batch = data.batch || [];
      setResult('adv-retag-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>本批 ${batch.length} 项 | 剩余待处理 ${data.remaining_pending ?? 0}</strong></div></div>
        ${batch.map((e) => retagRow(dir, e)).join('')}</div>`);
    } catch (error) { errorBox('adv-retag-result', error); }
  }

  function renderRetagPriority(data) {
    const dir = retagPath();
    const priority = (data.priority || []).slice(0, 50);
    const sum = data.summary || {};
    setResult('adv-retag-result', `<div class="module-list">
      <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>队列已构建</strong>
      <span class="module-list-meta">标记: ${sum.flagged_count ?? 0} / ${sum.image_count ?? 0} 图</span></div></div>
      ${priority.map((e) => retagRow(dir, e)).join('')}</div>`);
  }

  function retagRow(dir, entry) {
    const path = entry.image_path || '';
    const enc = encodeURIComponent(path);
    return `<div class="module-list-item module-list-item-static"><div class="module-list-main">
      <strong>${esc(path)}</strong>
      <span class="module-list-meta">分数 ${entry.score ?? '-'} | 状态 ${esc(entry.status || 'pending')}</span>
      <span style="display:flex;gap:6px;margin-top:4px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="markAdvRetag('${esc(dir)}','${enc}','done')">完成</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="markAdvRetag('${esc(dir)}','${enc}','skipped')">跳过</button>
      </span></div></div>`;
  }

  async function markAdvRetag(dir, encodedPath, status) {
    try {
      await api.retagQueueMark({ dir, image_path: decodeURIComponent(encodedPath), status });
      showToast(`已标记为 ${status}。`);
    } catch (error) { showToast(error.message || '标记失败。'); }
  }

  // ---------------------------------------------------------------- P2.1 version

  function segVersion() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-ver-path')}
        <div class="config-group"><label>图片相对/绝对路径</label><input class="text-input" type="text" id="adv-ver-image" placeholder="a.png"></div>
        <div class="config-group"><label>回退到版本号</label><input class="text-input" type="number" id="adv-ver-target" value="1" min="0"></div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvVersionHistory()">历史</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvVersionRevert()">回退（写）</button>
      </div>
      <div id="adv-ver-result" style="margin-top:16px;"></div>`;
  }

  function versionParams() {
    return {
      dir: $('#adv-ver-path')?.value?.trim() || '',
      image_path: $('#adv-ver-image')?.value?.trim() || '',
    };
  }

  async function runAdvVersionHistory() {
    const params = versionParams();
    if (!params.dir || !params.image_path) { showToast('请填写数据集路径与图片路径。'); return; }
    busy('adv-ver-result', '读取中...');
    try {
      const data = unwrap(await api.versionHistory(params));
      const versions = data.versions || [];
      setResult('adv-ver-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>版本数: ${data.version_count ?? versions.length}</strong></div></div>
        ${versions.map((v) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>v${esc(v.v)} · ${esc(v.operation || '')}</strong>
          <span class="module-list-meta">${esc(v.timestamp || '')}</span>
          <span class="module-list-meta" style="color:var(--accent);">${esc((v.new || '').slice(0, 160))}</span></div></div>`).join('')}</div>`);
    } catch (error) { errorBox('adv-ver-result', error); }
  }

  async function runAdvVersionRevert() {
    const params = { ...versionParams(), to_version: Number($('#adv-ver-target')?.value || 1) || 1 };
    if (!params.dir || !params.image_path) { showToast('请填写数据集路径与图片路径。'); return; }
    busy('adv-ver-result', '回退中...');
    try {
      const data = unwrap(await api.versionRevert(params));
      setResult('adv-ver-result', `<div class="builtin-picker-empty"><span>已回退到 v${esc(params.to_version)}：${esc((data.caption || '').slice(0, 200))}</span></div>`);
      showToast('已回退。');
    } catch (error) { errorBox('adv-ver-result', error); }
  }

  // ---------------------------------------------------------------- P3.2 cross

  function segCross() {
    return `
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>多数据集路径（一行一个，或逗号分隔）</label>
          <textarea class="text-input" id="adv-cross-paths" style="min-height:120px;width:100%;" placeholder="./train/ds_a&#10;./train/ds_b"></textarea>
        </div>
        <div class="config-group"><label>稀有 DF 阈值</label><input class="text-input" type="number" id="adv-cross-rare" value="1" min="1"></div>
        <div class="config-group"><label>别名相似度</label><input class="text-input" type="number" id="adv-cross-alias" value="0.82" min="0" max="1" step="0.01"></div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvCrossAggregate()">聚合分析</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvCrossResult()">读取缓存</button>
      </div>
      <div id="adv-cross-result" style="margin-top:16px;"></div>`;
  }

  function crossPaths() {
    return ($('#adv-cross-paths')?.value || '')
      .replace(/\r/g, '\n').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }

  function renderCross(data) {
    const freq = (data.global_tag_frequency || []).slice(0, 20);
    const rare = (data.rare_tag_library || []).slice(0, 20);
    const alias = (data.alias_evolution || []).slice(0, 20);
    const pairs = (data.style_similarity?.pairs || []).slice(0, 20);
    setResult('adv-cross-result', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>全局高频（${data.dataset_count ?? '-'} 集 / 唯一 ${data.global_unique_tags ?? '-'}）</strong>
          ${freq.map((e) => `<span class="module-list-meta">${esc(e.tag)} x ${e.count}</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>稀有标签库</strong>
          ${rare.map((e) => `<span class="module-list-meta">${esc(e.tag)} · DF ${e.dataset_frequency} · ${e.global_count}</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>别名演化建议</strong>
          ${alias.map((e) => `<span class="module-list-meta">${esc(e.variant)} → ${esc(e.canonical)}（${esc(e.reason)} ${e.confidence}）</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>风格指纹相似度</strong>
          ${pairs.map((p) => `<span class="module-list-meta">${esc(p.a.slice(0, 8))}↔${esc(p.b.slice(0, 8))}: ${p.cosine}</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
      </div>`);
  }

  async function runAdvCrossAggregate() {
    const paths = crossPaths();
    if (paths.length < 1) { showToast('请至少填写一个数据集路径。'); return; }
    busy('adv-cross-result', '聚合分析中...');
    try {
      const data = unwrap(await api.crossDatasetAggregate({
        dataset_paths: paths,
        rare_df_threshold: Number($('#adv-cross-rare')?.value || 1) || 1,
        alias_min_similarity: Number($('#adv-cross-alias')?.value || 0.82) || 0.82,
      }));
      renderCross(data);
      showToast('跨数据集聚合完成。');
    } catch (error) { errorBox('adv-cross-result', error); }
  }

  async function runAdvCrossResult() {
    const paths = crossPaths();
    if (paths.length < 1) { showToast('请至少填写一个数据集路径。'); return; }
    busy('adv-cross-result', '读取缓存中...');
    try {
      const data = unwrap(await api.crossDatasetResult({ dataset_paths: paths }));
      if (data.status === 'missing') { setResult('adv-cross-result', '<div class="builtin-picker-empty"><span>无缓存，请先聚合分析。</span></div>'); return; }
      renderCross(data);
    } catch (error) { errorBox('adv-cross-result', error); }
  }

  return {
    renderAdvancedTagTools,
    // window actions
    switchAdvancedTagSegment,
    runAdvPipelinePlan,
    runAdvPipelineRun,
    runAdvEnsemblePreview,
    runAdvEnsembleApply,
    runAdvStructurePreview,
    runAdvStructureApply,
    runAdvDedupe,
    runAdvDedupePlan,
    runAdvDedupeQuarantine,
    runAdvContentScan,
    runAdvContentQuarantine,
    runAdvCacheHealthReport,
    runAdvCacheHealthPlan,
    runAdvCacheHealthQuarantine,
    runAdvFrequencyPreview,
    runAdvFrequencyApply,
    runAdvReviewQueue,
    refreshAdvPolicyPacks: refreshPolicyPacks,
    runAdvPolicyPreview,
    runAdvPolicyApply,
    runAdvRetagBuild,
    runAdvRetagNext,
    markAdvRetag,
    runAdvVersionHistory,
    runAdvVersionRevert,
    runAdvCrossAggregate,
    runAdvCrossResult,
  };
}
