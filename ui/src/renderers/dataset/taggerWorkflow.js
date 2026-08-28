import { renderTaggerTemplate } from './taggerTemplate.js';

export function createTaggerWorkflow({ state, api, $, _ico, escapeHtml, showToast }) {
  let taggerPollTimer = null;
  const PROMPT_OVERRIDE_KEY = 'lulynx-ui-tagger-prompt-overrides-v1';
  let promptOverrides = { llm: null, hybrid: null };

  function loadPromptOverrides() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROMPT_OVERRIDE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        promptOverrides = { llm: saved.llm || null, hybrid: saved.hybrid || null };
      }
    } catch (_error) {
      // localStorage unavailable (privacy mode); keep defaults.
    }
  }

  function persistPromptOverrides() {
    try {
      localStorage.setItem(PROMPT_OVERRIDE_KEY, JSON.stringify(promptOverrides));
    } catch (_error) {
      // Ignore storage failures; overrides stay effective for this session.
    }
  }

  function getLlmPromptDefaults() {
    const presetId = $('#llm-preset')?.value || 'anime-tags';
    const presets = state.interrogators?.llm_template_presets || [];
    const preset = presets.find((entry) => entry.id === presetId) || {};
    return { system_prompt: String(preset.system_prompt || ''), user_template: String(preset.user_template || '') };
  }

  function getHybridPromptDefaults() {
    const format = $('#hybrid-output-format')?.value || 'txt';
    const preset = format === 'json' ? state.interrogators?.hybrid_json_preset : state.interrogators?.hybrid_nl_preset;
    return {
      system_prompt: String(preset?.system_prompt || ''),
      user_template: String(preset?.user_template || ''),
      label: format === 'json' ? 'JSON 模式默认' : 'TXT 模式默认',
    };
  }

  function renderInlinePromptPreviews() {
    const llmBox = document.getElementById('llm-prompt-preview');
    if (llmBox) {
      const override = promptOverrides.llm;
      const defaults = getLlmPromptDefaults();
      const sysEl = document.getElementById('llm-prompt-preview-system');
      const usrEl = document.getElementById('llm-prompt-preview-user');
      if (sysEl) sysEl.value = override?.system_prompt ?? defaults.system_prompt;
      if (usrEl) usrEl.value = override?.user_template ?? defaults.user_template;
      const badge = llmBox.querySelector('[data-prompt-badge]');
      if (badge) badge.textContent = override ? '已自定义' : '默认';
      const name = llmBox.querySelector('[data-prompt-preset-name]');
      if (name) name.textContent = $('#llm-preset')?.value || 'anime-tags';
    }
    const hybridBox = document.getElementById('hybrid-prompt-preview');
    if (hybridBox) {
      const override = promptOverrides.hybrid;
      const defaults = getHybridPromptDefaults();
      const sysEl = document.getElementById('hybrid-prompt-preview-system');
      const usrEl = document.getElementById('hybrid-prompt-preview-user');
      if (sysEl) sysEl.value = override?.system_prompt ?? defaults.system_prompt;
      if (usrEl) usrEl.value = override?.user_template ?? defaults.user_template;
      const badge = hybridBox.querySelector('[data-prompt-badge]');
      if (badge) badge.textContent = override ? '已自定义' : '默认';
      const name = hybridBox.querySelector('[data-prompt-preset-name]');
      if (name) name.textContent = defaults.label;
    }
  }

  function closePromptEditor() {
    const modal = document.getElementById('prompt-editor-modal');
    if (modal) modal.remove();
  }

  function resetPromptEditor(target) {
    const defaults = target === 'hybrid' ? getHybridPromptDefaults() : getLlmPromptDefaults();
    const sysEl = document.getElementById('prompt-editor-system');
    const usrEl = document.getElementById('prompt-editor-user');
    if (sysEl) sysEl.value = defaults.system_prompt;
    if (usrEl) usrEl.value = defaults.user_template;
  }

  function savePromptEditor(target) {
    const sys = document.getElementById('prompt-editor-system')?.value?.trim() || '';
    const usr = document.getElementById('prompt-editor-user')?.value?.trim() || '';
    const defaults = target === 'hybrid' ? getHybridPromptDefaults() : getLlmPromptDefaults();
    const isDefault = sys === defaults.system_prompt.trim() && usr === defaults.user_template.trim();
    promptOverrides[target] = (!sys && !usr) || isDefault ? null : { system_prompt: sys, user_template: usr };
    persistPromptOverrides();
    renderInlinePromptPreviews();
    closePromptEditor();
    showToast(promptOverrides[target] ? '✓ 已应用自定义提示词，提交打标时生效。' : '已恢复默认提示词。');
  }

  function openPromptEditor(target) {
    closePromptEditor();
    loadPromptOverrides();
    const isHybrid = target === 'hybrid';
    const defaults = isHybrid ? getHybridPromptDefaults() : getLlmPromptDefaults();
    const current = promptOverrides[target] || defaults;
    const title = isHybrid ? '编辑混合打标 NL 提示词' : '编辑 LLM 打标提示词';
    const placeholderHint = isHybrid
      ? '可用占位符：{wd_tags} {filename} {stem} {image_name} {existing_caption}'
      : '可用占位符：{image_name} {existing_caption}';
    const modal = document.createElement('div');
    modal.id = 'prompt-editor-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `
      <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;max-width:860px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.4);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);">
          <div>
            <h3 style="margin:0;font-size:1rem;color:var(--text-main);">${title}</h3>
            <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-dim);">${placeholderHint} · 两项均留空则使用后端默认</p>
          </div>
          <button class="btn btn-outline btn-sm" type="button" onclick="closePromptEditor()">关闭</button>
        </div>
        <div style="padding:14px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:0.8rem;color:var(--text-dim);">系统提示词 System Prompt</label>
            <textarea id="prompt-editor-system" rows="6" style="width:100%;margin-top:4px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-family:monospace;font-size:0.8rem;line-height:1.5;resize:vertical;user-select:text;-webkit-user-select:text;">${escapeHtml(current.system_prompt)}</textarea>
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--text-dim);">用户模板 User Template</label>
            <textarea id="prompt-editor-user" rows="12" style="width:100%;margin-top:4px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-family:monospace;font-size:0.8rem;line-height:1.5;resize:vertical;user-select:text;-webkit-user-select:text;">${escapeHtml(current.user_template)}</textarea>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border);">
          <button class="btn btn-outline btn-sm" type="button" onclick="resetPromptEditor('${target}')">恢复默认</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="closePromptEditor()">取消</button>
          <button class="btn btn-primary btn-sm" type="button" onclick="savePromptEditor('${target}')">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const sysEl = document.getElementById('prompt-editor-system');
    if (sysEl) sysEl.focus();
  }

  function renderTagger() {
    const content = $('#dataset-content');
    if (!content) return;

    const allInterrogators = state.interrogators?.interrogators || [];
    const defaultModel = 'wd-eva02-large-v3';
    const wdModels = allInterrogators.filter((model) => model.kind === 'wd' || model.kind === 'cl');
    const llmModels = allInterrogators.filter((model) => model.kind === 'llm');
    const llmChannels = state.interrogators?.llm_channels || [];
    const fallbackModels = [
      'wd-eva02-large-v3',
      'wd-convnext-v3',
      'wd-swinv2-v3',
      'wd-vit-v3',
      'wd14-convnextv2-v2',
      'wd14-swinv2-v2',
      'wd14-vit-v2',
      'wd14-moat-v2',
      'wd-eva02-large-tagger-v3',
      'wd-vit-large-tagger-v3',
      'eva02_large_E621_FULL_V1',
      'cl_tagger_1_01',
    ];
    const models = wdModels.length > 0 ? wdModels.map((model) => model.name) : fallbackModels;
    const conflicts = ['ignore', 'copy', 'prepend', 'append'];
    const conflictLabels = { ignore: '跳过已有', copy: '覆盖', prepend: '前置追加', append: '后置追加' };
    const presets = state.interrogators?.llm_template_presets || [
      { id: 'anime-tags', label: '动漫标签 / Anime Tags' },
      { id: 'natural-caption', label: '自然语言描述 / Natural Caption' },
    ];

    content.innerHTML = renderTaggerTemplate({
      models,
      defaultModel,
      llmModels,
      llmChannels,
      presets,
      conflicts,
      conflictLabels,
      escapeHtml,
    });
    loadPromptOverrides();
    const llmPresetEl = $('#llm-preset');
    if (llmPresetEl) llmPresetEl.addEventListener('change', renderInlinePromptPreviews);
    const hybridFormatEl = $('#hybrid-output-format');
    if (hybridFormatEl) hybridFormatEl.addEventListener('change', renderInlinePromptPreviews);
    renderInlinePromptPreviews();
  }

  function setTaggerButtonLoading(btnId, hintId, loading) {
    const btn = $('#' + btnId);
    const hint = $('#' + hintId);
    if (btn) {
      btn.disabled = loading;
      if (loading) {
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = _ico('loader') + ' 提交中...';
      } else {
        btn.textContent = btn.dataset.origText || '开始标注';
      }
    }
    if (hint && loading) {
      hint.innerHTML = '';
    }
  }

  function showTaggerRunningHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:var(--warning);">' + _ico('loader') + ' ' + message + '</span>';
    }
  }

  function showTaggerDoneHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:var(--success);">' + _ico('check-circle') + ' ' + message + '</span>';
      setTimeout(() => {
        if (hint) hint.innerHTML = '';
      }, 15000);
    }
  }

  function showTaggerErrorHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:var(--danger);">' + _ico('x-circle') + ' ' + message + '</span>';
    }
  }

  function formatTaggerHealthMessage(health) {
    const errors = Array.isArray(health?.errors) ? health.errors.filter(Boolean) : [];
    const warnings = Array.isArray(health?.warnings) ? health.warnings.filter(Boolean) : [];
    if (errors.length) return errors.join('；');
    if (warnings.length) return warnings.join('；');
    const count = Number(health?.image_count || 0);
    return count > 0 ? `预检通过，检测到 ${count} 张图片。` : '预检通过。';
  }

  function formatTaggerSummary(summary, fallbackCount) {
    if (!summary || typeof summary !== 'object') {
      return '标注完成' + (fallbackCount ? ` (${fallbackCount})` : '') + '！标签文件已生成。';
    }
    const total = Number(summary.total_images || 0);
    const written = Number(summary.written_count || 0);
    const skippedExisting = Number(summary.skipped_existing_count || 0);
    const skippedEmpty = Number(summary.skipped_empty_count || 0);
    const empty = Number(summary.empty_output_count || 0);
    const parts = [];
    if (total) parts.push(`共 ${total} 张`);
    parts.push(`写入 ${written} 张`);
    if (skippedExisting) parts.push(`跳过已有 ${skippedExisting} 张`);
    if (skippedEmpty) parts.push(`空输出跳过 ${skippedEmpty} 张`);
    if (empty && !skippedEmpty) parts.push(`空输出 ${empty} 张`);
    return '标注完成：' + parts.join('，') + '。';
  }

  function getSelectedFallbackChannels(selectId = 'llm-fallback-channels') {
    const select = $(`#${selectId}`);
    if (!select) return [];
    return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
  }

  function updateChannelState(channels) {
    state.interrogators = {
      ...(state.interrogators || {}),
      llm_channels: Array.isArray(channels) ? channels : [],
    };
  }

  async function refreshLlmTaggerChannels() {
    try {
      const response = await api.getLlmTaggerChannels();
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast('LLM 通道已刷新。');
    } catch (error) {
      showToast(error.message || '刷新 LLM 通道失败。');
    }
  }

  async function saveLlmTaggerChannelFromForm() {
    const name = $('#llm-channel-name')?.value?.trim() || '';
    const provider = $('#llm-channel-provider')?.value || 'openai_compatible';
    const model = $('#llm-channel-model')?.value?.trim() || '';
    const apiKeys = $('#llm-channel-keys')?.value || '';
    const existing = (state.interrogators?.llm_channels || []).find((channel) => String(channel.id || '') === channelIdFromName(name));
    if (!name || !model) {
      showToast('请填写通道名称和模型。');
      return;
    }
    if (!existing && !apiKeys.trim()) {
      showToast('新通道请至少填写一个 API Key。');
      return;
    }
    try {
      const response = await api.saveLlmTaggerChannel({
        name,
        provider,
        model,
        api_base: $('#llm-channel-base')?.value?.trim() || '',
        api_keys: apiKeys,
        replace_api_keys: !!apiKeys.trim(),
        enabled: true,
        retries: parseInt($('#llm-retries')?.value, 10) || 1,
      });
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast(`已保存 LLM 通道：${name}`);
    } catch (error) {
      showToast(error.message || '保存 LLM 通道失败。');
    }
  }

  function channelIdFromName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  async function clearSelectedLlmTaggerChannelKeys() {
    const channelId = $('#llm-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择要清空密钥的通道。');
      return;
    }
    if (channelId.startsWith('env-')) {
      showToast('环境变量通道的密钥来自系统环境，不能在这里清空。');
      return;
    }
    try {
      const response = await api.clearLlmTaggerChannelKeys(channelId);
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast('已清空所选通道的 API Key。');
    } catch (error) {
      showToast(error.message || '清空 API Key 失败。');
    }
  }

  async function deleteSelectedLlmTaggerChannel() {
    const channelId = $('#llm-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择要删除的通道。');
      return;
    }
    if (channelId.startsWith('env-')) {
      showToast('环境变量通道不能在这里删除。');
      return;
    }
    try {
      const response = await api.deleteLlmTaggerChannel(channelId);
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast('已删除所选 LLM 通道。');
    } catch (error) {
      showToast(error.message || '删除 LLM 通道失败。');
    }
  }

  function pollTaggerProgress(hintId, taskId = '') {
    if (taggerPollTimer) clearInterval(taggerPollTimer);
    let imageCount = '';
    const targetTaskId = String(taskId || '');
    taggerPollTimer = setInterval(async () => {
      try {
        const tasksResp = await api.getTasks();
        const tasks = tasksResp?.data?.tasks || [];
        const targetTask = targetTaskId
          ? tasks.find((task) => String(task.id || task.task_id || '') === targetTaskId)
          : null;
        const running = targetTask
          ? (String(targetTask.status || '').toUpperCase() === 'RUNNING' ? [targetTask] : [])
          : tasks.filter((task) => task.status === 'RUNNING');
        if (running.length === 0) {
          clearInterval(taggerPollTimer);
          taggerPollTimer = null;
          const finished = targetTask || tasks.find((task) => ['COMPLETED', 'FINISHED'].includes(String(task.status || '').toUpperCase()) && String(task.type || '').toLowerCase() === 'tagging');
          const doneMsg = formatTaggerSummary(finished?.metadata?.summary, imageCount);
          showTaggerDoneHint(hintId, doneMsg);
          showToast('✓ ' + doneMsg);
          return;
        }
        const taskId = running[0].id || running[0].task_id;
        if (!taskId) return;

        const outResp = await api.getTaskOutput(taskId, 30);
        const lines = outResp?.data?.lines || [];
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          const line = lines[index];
          const imgMatch = line.match(/[Ff]ound\s+(\d+)\s+image/i);
          if (imgMatch) {
            imageCount = imgMatch[1] + ' 张图片';
            const hint = document.getElementById(hintId);
            if (hint) {
              hint.innerHTML = '<span style="color:var(--warning);">' + _ico('loader') + ' 标注中... 检测到 ' + imageCount + '</span>';
            }
            break;
          }
          if (/all\s*done|识别完成|Unloaded/i.test(line)) {
            clearInterval(taggerPollTimer);
            taggerPollTimer = null;
            const doneMsg = '标注完成' + (imageCount ? ` (${imageCount})` : '') + '！标签文件已生成。';
            showTaggerDoneHint(hintId, doneMsg);
            showToast('✓ ' + doneMsg);
            return;
          }
        }
      } catch (error) {
        // Progress polling is best-effort; the backend task continues independently.
      }
    }, 3000);
  }

  async function runLlmTagger() {
    const pathVal = $('#llm-tagger-path')?.value?.trim();
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
    const channelId = $('#llm-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择可用的 LLM 通道，或先保存一个通道。');
      return;
    }
    const params = {
      path: pathVal,
      method: 'llm',
      llm_channel_id: channelId,
      llm_fallback_channel_ids: getSelectedFallbackChannels().filter((id) => id !== channelId),
      llm_fallback_enabled: $('#llm-fallback-enabled')?.checked ?? true,
      llm_model: $('#llm-model')?.value?.trim() || '',
      llm_template_preset: $('#llm-preset')?.value || 'anime-tags',
      llm_system_prompt: promptOverrides.llm?.system_prompt || '',
      llm_user_prompt: promptOverrides.llm?.user_template || '',
      batch_output_action_on_conflict: $('#llm-conflict')?.value || 'ignore',
      llm_temperature: parseFloat($('#llm-temperature')?.value) || 0.2,
      llm_max_tokens: parseInt($('#llm-max-tokens')?.value, 10) || 300,
      llm_retries: parseInt($('#llm-retries')?.value, 10) || 1,
      llm_min_tags: parseInt($('#llm-min-tags')?.value, 10) || 1,
      llm_max_tags: parseInt($('#llm-max-tags')?.value, 10) || 120,
      batch_input_recursive: $('#llm-recursive')?.checked || false,
      threshold: 0.5,
    };
    setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', true);
    try {
      const healthResp = await api.checkInterrogateHealth(params);
      const health = healthResp?.data || {};
      const healthMessage = formatTaggerHealthMessage(health);
      if (!health.ok) {
        throw new Error(healthMessage || 'LLM 标注预检未通过。');
      }
      if (Array.isArray(health.warnings) && health.warnings.length) {
        showToast(healthMessage);
      }
      const response = await api.runInterrogate(params);
      const taskId = response?.data?.task_id || response?.task_id || '';
      setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
      showTaggerRunningHint(
        'llm-tagger-status-hint',
        'LLM 标注后台运行中... 进度请查看后端控制台窗口（任务栏最小化窗口 "LoRA-Backend"）',
      );
      showToast('✓ LLM 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
      pollTaggerProgress('llm-tagger-status-hint', taskId);
    } catch (error) {
      setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
      showTaggerErrorHint('llm-tagger-status-hint', error.message || '提交失败');
      showToast(error.message || 'LLM 标注任务启动失败。');
    }
  }

  async function runHybridTagger() {
    const pathVal = $('#hybrid-tagger-path')?.value?.trim();
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
    const channelId = $('#hybrid-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择可用的 NL 通道，或先在 LLM 标签器里保存一个通道。');
      return;
    }
    const wdModel = $('#hybrid-wd-model')?.value || 'wd-eva02-large-v3';
    const params = {
      path: pathVal,
      method: 'hybrid',
      hybrid_wd_model: wdModel,
      hybrid_trigger_word: $('#hybrid-trigger-word')?.value?.trim() || '',
      hybrid_separator: $('#hybrid-separator')?.value ?? ', ',
      hybrid_output_format: $('#hybrid-output-format')?.value || 'txt',
      hybrid_nl_system_prompt: promptOverrides.hybrid?.system_prompt || '',
      hybrid_nl_user_template: promptOverrides.hybrid?.user_template || '',
      llm_channel_id: channelId,
      llm_fallback_channel_ids: getSelectedFallbackChannels('hybrid-fallback-channels').filter((id) => id !== channelId),
      llm_fallback_enabled: $('#hybrid-fallback-enabled')?.checked ?? true,
      llm_model: $('#hybrid-model')?.value?.trim() || '',
      llm_temperature: parseFloat($('#hybrid-temperature')?.value) || 1.0,
      llm_max_tokens: parseInt($('#hybrid-max-tokens')?.value, 10) || 1000,
      llm_retries: parseInt($('#hybrid-retries')?.value, 10) || 1,
      batch_output_action_on_conflict: $('#hybrid-conflict')?.value || 'ignore',
      batch_input_recursive: $('#hybrid-recursive')?.checked || false,
      threshold: parseFloat($('#hybrid-threshold')?.value) || 0.5,
      exclude_tags: $('#hybrid-exclude')?.value || '',
      replace_underscore: $('#hybrid-underscore')?.checked ?? true,
      escape_tag: $('#hybrid-escape')?.checked ?? true,
      protect_empty_output: true,
    };
    setTaggerButtonLoading('btn-run-hybrid-tagger', 'hybrid-tagger-status-hint', true);
    try {
      const healthResp = await api.checkInterrogateHealth(params);
      const health = healthResp?.data || {};
      const healthMessage = formatTaggerHealthMessage(health);
      if (!health.ok) {
        throw new Error(healthMessage || '混合打标预检未通过。');
      }
      if (Array.isArray(health.warnings) && health.warnings.length) {
        showToast(healthMessage);
      }
      const response = await api.runInterrogate(params);
      const taskId = response?.data?.task_id || response?.task_id || '';
      setTaggerButtonLoading('btn-run-hybrid-tagger', 'hybrid-tagger-status-hint', false);
      showTaggerRunningHint(
        'hybrid-tagger-status-hint',
        '混合打标后台运行中（WD tag + LLM NL）... 进度请查看后端控制台窗口',
      );
      showToast('✓ 混合打标任务已提交到后端，完成后 .txt 会以「触发词, tag... NL 描述」形式生成在图片旁边。');
      pollTaggerProgress('hybrid-tagger-status-hint', taskId);
    } catch (error) {
      setTaggerButtonLoading('btn-run-hybrid-tagger', 'hybrid-tagger-status-hint', false);
      showTaggerErrorHint('hybrid-tagger-status-hint', error.message || '提交失败');
      showToast(error.message || '混合打标任务启动失败。');
    }
  }

  async function runTagger() {
    const pathVal = $('#tagger-path')?.value?.trim();
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
    const params = {
      path: pathVal,
      interrogator_model: $('#tagger-model')?.value || 'wd-eva02-large-v3',
      threshold: parseFloat($('#tagger-threshold')?.value) || 0.5,
      additional_tags: $('#tagger-additional')?.value || '',
      exclude_tags: $('#tagger-exclude')?.value || '',
      batch_input_recursive: $('#tagger-recursive')?.checked || false,
      batch_output_action_on_conflict: $('#tagger-conflict')?.value || 'ignore',
      replace_underscore: $('#tagger-underscore')?.checked ?? true,
      escape_tag: $('#tagger-escape')?.checked ?? true,
      protect_empty_output: $('#tagger-empty-protect')?.checked ?? true,
    };
    setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', true);
    try {
      const healthResp = await api.checkInterrogateHealth({ ...params, method: 'wd14' });
      const health = healthResp?.data || {};
      const healthMessage = formatTaggerHealthMessage(health);
      if (!health.ok) {
        throw new Error(healthMessage || '标注预检未通过。');
      }
      if (Array.isArray(health.warnings) && health.warnings.length) {
        showToast(healthMessage);
      }
      const response = await api.runInterrogate(params);
      const taskId = response?.data?.task_id || response?.task_id || '';
      setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
      showTaggerRunningHint(
        'tagger-status-hint',
        '标注后台运行中（首次需下载模型，可能需要几分钟）... 进度请查看后端控制台窗口',
      );
      showToast('✓ 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
      pollTaggerProgress('tagger-status-hint', taskId);
    } catch (error) {
      setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
      showTaggerErrorHint('tagger-status-hint', error.message || '提交失败');
      showToast(error.message || '标注任务启动失败。');
    }
  }

  return {
    renderTagger,
    runTagger,
    runLlmTagger,
    runHybridTagger,
    refreshLlmTaggerChannels,
    saveLlmTaggerChannelFromForm,
    clearSelectedLlmTaggerChannelKeys,
    deleteSelectedLlmTaggerChannel,
    openPromptEditor,
    closePromptEditor,
    resetPromptEditor,
    savePromptEditor,
  };
}
