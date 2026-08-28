export function renderTaggerTemplate({ models, defaultModel, llmModels, presets, conflicts, conflictLabels, llmChannels, escapeHtml }) {
  const usableChannels = (llmChannels || []).filter((channel) => channel.enabled && channel.has_key);
  const channelOptions = (llmChannels || []).length
    ? llmChannels.map((channel) => {
        const disabled = channel.enabled && channel.has_key ? '' : 'disabled';
        const reason = !channel.enabled ? '（禁用）' : (!channel.has_key ? '（缺少 Key）' : '');
        const label = `${channel.name || channel.id} · ${channel.provider || 'api'} · ${channel.model || '-'} ${reason}`;
        return `<option value="${escapeHtml(channel.id || '')}" ${disabled}>${escapeHtml(label)}</option>`;
      }).join('')
    : '<option value="">未配置通道</option>';
  const fallbackOptions = usableChannels.map((channel) => `<option value="${escapeHtml(channel.id || '')}">${escapeHtml(channel.name || channel.id)}</option>`).join('');
  return `
    <!-- WD14 / CL 标签器 -->
    <section class="form-section">
      <header class="section-header"><h3>WD14 / CL 标签器</h3></header>
      <div class="section-summary">对训练数据集进行自动标注，为每张图片生成 .txt 标签文件。使用本地 ONNX 模型运行，无需网络。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('tagger-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>标注模型</label>
          <select id="tagger-model">
            ${models.map((m) => `<option value="${m}" ${m === defaultModel ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>置信度阈值</label>
          <p class="field-desc">模型对标签的最低置信度，低于此值的标签不会写入，简单来说，数值越低打出的标越多。一般推荐 0.5，调低可获得更多标签但可能不准。</p>
          <input class="text-input" type="number" id="tagger-threshold" value="0.5" min="0" max="1" step="0.01">
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="tagger-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected': ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>额外追加标签</label>
          <input class="text-input" type="text" id="tagger-additional" placeholder="tag1, tag2">
        </div>
        <div class="config-group">
          <label>排除标签</label>
          <input class="text-input" type="text" id="tagger-exclude" placeholder="tag_to_remove">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-recursive" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>替换下划线为空格</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-underscore" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>转义括号</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-escape" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>空输出保护</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-empty-protect" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-tagger" onclick="runTagger()">开始标注</button>
        <span id="tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>

    <!-- LLM 标签器 -->
    <section class="form-section">
      <header class="section-header"><h3>LLM 标签器（大语言模型）</h3></header>
      <div class="section-summary">使用 OpenAI / Claude / 自定义 API 的视觉语言模型对图片进行标注。需要填写 API Key，会消耗 API 额度。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('llm-tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('llm-tagger-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="llm-tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>主通道</label>
          <select id="llm-channel">${channelOptions}</select>
        </div>
        <div class="config-group">
          <label>备用通道</label>
          <select id="llm-fallback-channels" multiple size="3">${fallbackOptions}</select>
        </div>
        <div class="config-group">
          <label>模型覆盖</label>
          <input class="text-input" type="text" id="llm-model" placeholder="留空使用通道默认模型">
        </div>
        <div class="config-group">
          <label>重试次数</label>
          <input class="text-input" type="number" id="llm-retries" value="1" min="0" max="5">
        </div>
        <div class="config-group">
          <label>模板预设</label>
          <select id="llm-preset">
            ${presets.map((p) => `<option value="${p.id}">${escapeHtml(p.label ||p.id)}</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm" type="button" id="btn-edit-llm-prompt" style="margin-top:8px;width:100%;" onclick="openPromptEditor('llm')">✏️ 编辑提示词</button>
          <div id="llm-prompt-preview" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.75rem;color:var(--text-dim);">当前提示词预览（预设: <span data-prompt-preset-name></span>）</span>
              <span data-prompt-badge style="font-size:0.7rem;padding:1px 8px;border-radius:10px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-dim);">默认</span>
            </div>
            <textarea readonly rows="4" id="llm-prompt-preview-system" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-dim);font-family:monospace;font-size:0.72rem;line-height:1.5;resize:vertical;user-select:text;-webkit-user-select:text;"></textarea>
            <textarea readonly rows="6" id="llm-prompt-preview-user" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-dim);font-family:monospace;font-size:0.72rem;line-height:1.5;resize:vertical;user-select:text;-webkit-user-select:text;"></textarea>
          </div>
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="llm-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected' : ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>Temperature</label>
          <input class="text-input" type="number" id="llm-temperature" value="0.2" min="0" max="2" step="0.1">
        </div>
        <div class="config-group">
          <label>最大 Tokens</label>
          <input class="text-input" type="number" id="llm-max-tokens" value="300" min="1" max="8192">
        </div>
        <div class="config-group">
          <label>最少标签数</label>
          <input class="text-input" type="number" id="llm-min-tags" value="1" min="0" max="100">
        </div>
        <div class="config-group">
          <label>最多标签数</label>
          <input class="text-input" type="number" id="llm-max-tags" value="120" min="1" max="500">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="llm-recursive"><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>自动回退备用通道</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="llm-fallback-enabled" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group" style="grid-column:1/-1;">
          <label>通道管理</label>
          <div style="display:grid;grid-template-columns:1fr 160px 1fr 1fr;gap:8px;align-items:end;">
            <input class="text-input" type="text" id="llm-channel-name" placeholder="通道名称">
            <select id="llm-channel-provider">
              <option value="openai_compatible">OpenAI 兼容</option>
              <option value="gemini">Gemini</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <input class="text-input" type="text" id="llm-channel-model" placeholder="默认模型">
            <input class="text-input" type="text" id="llm-channel-base" placeholder="API 地址，可留空">
          </div>
          <textarea class="text-input" id="llm-channel-keys" style="margin-top:8px;min-height:72px;width:100%;" placeholder="API Key，一行一个；已有通道留空会保留旧密钥"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" type="button" onclick="saveLlmTaggerChannelFromForm()">保存通道</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="refreshLlmTaggerChannels()">刷新通道</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="clearSelectedLlmTaggerChannelKeys()">清空密钥</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="deleteSelectedLlmTaggerChannel()">删除所选通道</button>
          </div>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-llm-tagger" onclick="runLlmTagger()">LLM 开始标注</button>
        <span id="llm-tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>

    <!-- 混合打标器（WD14/CL tag + LLM NL） -->
    <section class="form-section">
      <header class="section-header"><h3>混合打标器（触发词 + Tag + NL）</h3></header>
      <div class="section-summary">先用 WD14 / CL 本地模型打出 booru tag，再用 LLM 视觉模型生成自然语言描述（NL），最后合并为「触发词, tag1, tag2, ... 分隔符 NL 描述」写入同名 .txt。LLM 部分走下方通道配置，会消耗 API 额度。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('hybrid-tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('hybrid-tagger-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="hybrid-tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>Tag 模型（WD14 / CL）</label>
          <select id="hybrid-wd-model">
            ${models.map((m) => `<option value="${m}" ${m === defaultModel ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>触发词</label>
          <p class="field-desc">将置于 caption 最前部，可留空。如 @nshu、my_oc_name。</p>
          <input class="text-input" type="text" id="hybrid-trigger-word" placeholder="trigger_word">
        </div>
        <div class="config-group">
          <label>NL 分隔符</label>
          <p class="field-desc">tag 部分与 NL 描述之间的分隔符。</p>
          <input class="text-input" type="text" id="hybrid-separator" value=", ">
        </div>
        <div class="config-group">
          <label>NL 主通道（LLM）</label>
          <select id="hybrid-channel">${channelOptions}</select>
        </div>
        <div class="config-group">
          <label>NL 备用通道</label>
          <select id="hybrid-fallback-channels" multiple size="3">${fallbackOptions}</select>
        </div>
        <div class="config-group">
          <label>模型覆盖</label>
          <input class="text-input" type="text" id="hybrid-model" placeholder="留空使用通道默认模型">
        </div>
        <div class="config-group">
          <label>输出格式</label>
          <select id="hybrid-output-format">
            <option value="txt" selected>TXT（触发词, tag... 分隔符 NL）</option>
            <option value="json">JSON（Anima 训练用结构化）</option>
          </select>
          <p class="field-desc">JSON 模式写入同名 .json（trigger / tags / nl 字段），供 Anima 结构化训练读取。</p>
        </div>
        <div class="config-group" style="grid-column:1/-1;">
          <label>NL 提示词（System / User Template）</label>
          <p class="field-desc">控制 LLM 生成 NL 描述的提示词，留空使用后端默认。可用占位符：{wd_tags} {filename} {stem} {image_name} {existing_caption}。</p>
          <button class="btn btn-outline btn-sm" type="button" id="btn-edit-hybrid-prompt" style="width:100%;" onclick="openPromptEditor('hybrid')">✏️ 编辑 NL 提示词</button>
          <div id="hybrid-prompt-preview" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.75rem;color:var(--text-dim);">当前提示词预览（<span data-prompt-preset-name>TXT 模式默认</span>）</span>
              <span data-prompt-badge style="font-size:0.7rem;padding:1px 8px;border-radius:10px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-dim);">默认</span>
            </div>
            <textarea readonly rows="4" id="hybrid-prompt-preview-system" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-dim);font-family:monospace;font-size:0.72rem;line-height:1.5;resize:vertical;user-select:text;-webkit-user-select:text;"></textarea>
            <textarea readonly rows="6" id="hybrid-prompt-preview-user" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-dim);font-family:monospace;font-size:0.72rem;line-height:1.5;resize:vertical;user-select:text;-webkit-user-select:text;"></textarea>
          </div>
        </div>
        <div class="config-group">
          <label>重试次数</label>
          <p class="field-desc">LLM 请求失败后自动重试的次数，0 表示不重试。</p>
          <input class="text-input" type="number" id="hybrid-retries" value="1" min="0" max="5">
        </div>
        <div class="config-group">
          <label>Temperature（NL 部分）</label>
          <input class="text-input" type="number" id="hybrid-temperature" value="1" min="0" max="2" step="0.1">
        </div>
        <div class="config-group">
          <label>最大 Tokens（NL 部分）</label>
          <input class="text-input" type="number" id="hybrid-max-tokens" value="1000" min="1" max="8192">
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="hybrid-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected' : ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>置信度阈值（Tag 部分）</label>
          <input class="text-input" type="number" id="hybrid-threshold" value="0.5" min="0" max="1" step="0.01">
        </div>
        <div class="config-group">
          <label>排除标签（Tag 部分）</label>
          <input class="text-input" type="text" id="hybrid-exclude" placeholder="tag_to_remove">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="hybrid-recursive" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>替换下划线为空格（Tag 部分）</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="hybrid-underscore" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>转义括号（Tag 部分）</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="hybrid-escape" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>自动回退备用通道</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="hybrid-fallback-enabled" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-hybrid-tagger" onclick="runHybridTagger()">混合打标开始</button>
        <span id="hybrid-tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>
  `;
}
