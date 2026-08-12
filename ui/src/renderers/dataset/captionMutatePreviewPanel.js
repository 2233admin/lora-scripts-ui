// Caption 训练时 mutate 预览（drop/shuffle/scope/group）— 不写盘、不跑 TE

export function createCaptionMutatePreviewPanel({ api, $, escapeHtml, showToast }) {
  function renderCaptionMutatePreview() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>Caption Mutate 预览</h3></header>
        <div class="section-summary">
          用与训练相同的 caption 处理逻辑（drop / shuffle / after_separator / 组打乱 / 前缀防丢）对单条文本采样 N 次。
          只预览，不改磁盘文件、不编码 TE。
        </div>
        <div class="section-content tool-fields">
          <div class="config-group" style="grid-column:1/-1;">
            <label>示例 Caption</label>
            <textarea class="text-input" id="mutate-caption" rows="3" placeholder="trigger, 1girl, pose, ||| red hair, jacket, boots">trigger, 1girl, pose, ||| red hair, jacket, boots</textarea>
          </div>
          <div class="config-group">
            <label>采样次数</label>
            <input class="text-input" type="number" id="mutate-samples" value="12" min="1" max="100">
          </div>
          <div class="config-group">
            <label>Seed</label>
            <input class="text-input" type="number" id="mutate-seed" value="0">
          </div>
          <div class="config-group">
            <label>Mutate Scope</label>
            <select class="text-input" id="mutate-scope">
              <option value="all">all（整段）</option>
              <option value="after_separator" selected>after_separator（只动 ||| 后）</option>
            </select>
          </div>
          <div class="config-group">
            <label>Scope 分隔符</label>
            <input class="text-input" type="text" id="mutate-scope-sep" value="|||">
          </div>
          <div class="config-group">
            <label>Tag Dropout Rate</label>
            <input class="text-input" type="number" id="mutate-tag-dropout" value="0.3" min="0" max="1" step="0.05">
          </div>
          <div class="config-group">
            <label>Keep Tokens</label>
            <input class="text-input" type="number" id="mutate-keep-tokens" value="0" min="0">
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>Shuffle Caption</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="mutate-shuffle" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>标签组内打乱</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="mutate-group-shuffle"><span class="slider round"></span></label>
          </div>
          <div class="config-group">
            <label>组分隔符</label>
            <input class="text-input" type="text" id="mutate-group-sep" value="|||">
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>前缀防丢弃</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="mutate-protect-prefix"><span class="slider round"></span></label>
          </div>
          <div class="config-group">
            <label>定向丢弃 targets（逗号/换行）</label>
            <input class="text-input" type="text" id="mutate-targets" placeholder="red hair, jacket">
          </div>
          <div class="config-group">
            <label>定向模式</label>
            <select class="text-input" id="mutate-target-mode">
              <option value="drop_all">drop_all</option>
              <option value="random_n">random_n</option>
            </select>
          </div>
          <div class="config-group">
            <label>定向 random_n 数量</label>
            <input class="text-input" type="number" id="mutate-target-count" value="1" min="1">
          </div>
        </div>
        <div class="tool-actions" style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" type="button" onclick="runCaptionMutatePreview()">采样预览</button>
        </div>
        <div id="mutate-result" style="margin-top:16px;"></div>
      </section>
    `;
  }

  function gatherMutateParams() {
    return {
      caption: $('#mutate-caption')?.value || '',
      samples: Number($('#mutate-samples')?.value || 12),
      seed: Number($('#mutate-seed')?.value || 0),
      caption_tag_mutate_scope: $('#mutate-scope')?.value || 'all',
      caption_tag_scope_separator: $('#mutate-scope-sep')?.value || '|||',
      tag_dropout_rate: Number($('#mutate-tag-dropout')?.value || 0),
      keep_tokens: Number($('#mutate-keep-tokens')?.value || 0),
      shuffle_caption: $('#mutate-shuffle')?.checked || false,
      tag_group_shuffle: $('#mutate-group-shuffle')?.checked || false,
      tag_group_separator: $('#mutate-group-sep')?.value || '|||',
      caption_protect_prefix_from_dropout: $('#mutate-protect-prefix')?.checked || false,
      caption_tag_dropout_targets: $('#mutate-targets')?.value || '',
      caption_tag_dropout_target_mode: $('#mutate-target-mode')?.value || 'drop_all',
      caption_tag_dropout_target_count: Number($('#mutate-target-count')?.value || 1),
    };
  }

  function renderSamples(data) {
    const samples = data.samples || [];
    const unique = data.unique || [];
    const cfg = data.config || {};
    const rows = samples
      .map(
        (text, index) => `
      <div class="module-list-item module-list-item-static">
        <div class="module-list-main">
          <strong>#${index + 1}</strong>
          <span class="module-list-meta">${escapeHtml(String(text || ''))}</span>
        </div>
      </div>`
      )
      .join('');
    return `
      <div class="module-list">
        <div class="module-list-item module-list-item-static">
          <div class="module-list-main">
            <strong>采样 ${data.sample_count ?? samples.length} 次</strong>
            <span class="module-list-meta">
              唯一 ${data.unique_count ?? unique.length}
              | head_stable: ${data.head_stable === true ? 'yes' : data.head_stable === false ? 'no' : '-'}
              | scope=${escapeHtml(String(cfg.caption_tag_mutate_scope || '-'))}
              | drop=${cfg.tag_dropout_rate ?? '-'}
              | shuffle=${cfg.shuffle_caption ? 'on' : 'off'}
              | group=${cfg.tag_group_shuffle ? 'on' : 'off'}
              | protect=${cfg.caption_protect_prefix_from_dropout ? 'on' : 'off'}
            </span>
          </div>
        </div>
        ${rows || '<div class="builtin-picker-empty"><span>无样本</span></div>'}
      </div>
    `;
  }

  async function runCaptionMutatePreview() {
    const params = gatherMutateParams();
    if (!String(params.caption || '').trim()) {
      showToast('请先填写示例 Caption。');
      return;
    }
    const result = $('#mutate-result');
    if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>采样中...</span></div>';
    try {
      const response = await api.captionMutatePreview(params);
      const data = response?.data ?? response;
      if (!data || data.ok === false) {
        if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>';
        return;
      }
      if (result) result.innerHTML = renderSamples(data);
    } catch (error) {
      if (result) {
        result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '预览失败')}</span></div>`;
      }
      showToast(error.message || 'Mutate 预览失败');
    }
  }

  return {
    renderCaptionMutatePreview,
    runCaptionMutatePreview,
  };
}
