import {
  clearLocalTaskHistoryFile,
  postJson,
  rawRequest,
  request,
  syncLocalTaskHistoryRemoval,
} from './apiTransport.js';

export const api = {
  getGraphicCards() {
    return request('/api/graphic_cards');
  },

  getPresets() {
    return request('/api/presets');
  },

  getSavedParams() {
    return request('/api/config/saved_params');
  },

  getConfigOptions() {
    return request('/api/config/options');
  },

  getExecutionProfiles() {
    return request('/api/train/execution-profiles');
  },

  previewWeightComposer(config, points = 65) {
    return postJson('/api/train/weight-composer/preview', { config, points });
  },

  previewTrainingIntentProfile(config, intent, explicitFields = []) {
    return postJson('/api/train/training-intent/preview', { config, intent, explicit_fields: explicitFields });
  },

  startSampleDifficultyScoring(payload) {
    return postJson('/api/train/sample-difficulty/score', payload);
  },

  getSampleDifficultyScoring(jobId) {
    return request(`/api/train/sample-difficulty/score/${encodeURIComponent(jobId)}`);
  },

  cancelSampleDifficultyScoring(jobId) {
    return postJson(`/api/train/sample-difficulty/score/${encodeURIComponent(jobId)}/cancel`, {});
  },

  getTasks() {
    return request('/api/tasks');
  },

  terminateTask(taskId) {
    return request(`/api/tasks/terminate/${taskId}`);
  },

  /**
   * 删除单个任务记录。优先走后端 DELETE /api/tasks/{taskId}，
   * 同时同步清理本地 task_history.json 缓存。
   */
  async deleteTask(taskId) {
    const normalizedId = String(taskId || '');
    if (!normalizedId) {
      return { status: 'success', data: { deleted: 0 } };
    }
    const resp = await request(`/api/tasks/${encodeURIComponent(normalizedId)}`, { method: 'DELETE' });
    // 后端真删除成功后，再同步清掉本地历史中的同 ID 记录
    syncLocalTaskHistoryRemoval(normalizedId);
    return resp;
  },

  /**
   * 清空所有已完成任务记录。优先走后端 DELETE /api/tasks，
   * 同时清空本地 task_history.json 文件。
   */
  async deleteAllTasks() {
    const resp = await request('/api/tasks', { method: 'DELETE' });
    // 后端真清空后，本地缓存文件也一并清空
    clearLocalTaskHistoryFile();
    return resp;
  },

  /** 仅清空本地 task_history.json 缓存（不动后端）。 */
  deleteLocalTaskHistory(taskId) {
    return syncLocalTaskHistoryRemoval(taskId);
  },

  async pickFile(type, context = '') {
    // 非阻塞版本：/pick_file_async 立即返回 session_id，对话框在后台线程打开，
    // 前端轮询 /pick_file_result。后端信封：{status:'success',data} / {status:'error',message}
    //
    // 轮询走 rawRequest（不经 globalConcurrencyLimit）：picker 的长轮询不能和页面
    // 健康检查/任务轮询抢同一批并发槽，否则冷启动 + --dev reload 期间会堵死浏览器
    // 连接池，连 /ui/ 静态资源都 Stalled 一两分钟。
    const params = [`picker_type=${encodeURIComponent(type)}`];
    if (context) params.push(`context=${encodeURIComponent(context)}`);

    // 1. 启动对话框（20s 超时，reload 期间也不无限挂起）
    const initResp = await rawRequest(`/api/pick_file_async?${params.join('&')}`, { timeoutMs: 20000 });
    if (!initResp || initResp.status !== 'success') {
      throw new Error(initResp?.message || '启动文件选择器失败');
    }

    const sessionId = initResp.data?.session_id;
    if (!sessionId) {
      throw new Error('未收到有效的 session_id');
    }

    // 2. 轮询结果：间隔从 600ms 退避到 1500ms 封顶，最多等 5 分钟。
    //    单次轮询失败（后端 reload/超时）不致命，继续重试直到总 deadline。
    const deadline = Date.now() + 5 * 60 * 1000;
    let interval = 600;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, interval));
      if (interval < 1500) interval += 150;

      let resultResp;
      try {
        resultResp = await rawRequest(
          `/api/pick_file_result?session_id=${encodeURIComponent(sessionId)}`,
          { timeoutMs: 20000 },
        );
      } catch (_err) {
        continue; // reload/网络抖动：重试而非直接失败
      }

      if (!resultResp || resultResp.status === 'error') {
        throw new Error(resultResp?.message || '获取文件选择结果失败');
      }

      const data = resultResp.data || {};
      if (data.status === 'completed') {
        // 返回结构与旧版 /pick_file 一致：{status:'success', data:{path}}
        return {
          status: 'success',
          data: data.result || { path: '' },
        };
      }
      // data.status === 'opening' 继续等待
    }
    throw new Error('文件选择超时，请重试');
  },

  getBuiltinPicker(type, context = '') {
    const params = [`picker_type=${encodeURIComponent(type)}`];
    if (context) params.push(`context=${encodeURIComponent(context)}`);
    return request(`/api/builtin_picker?${params.join('&')}`);
  },

  /**
   * 扫描 Anima 模型根目录，智能识别 DiT/VAE/Qwen3/T5 等组件路径。
   * 通过 safetensors 二进制头 + 文件名 pattern 双重检测，不加载权重。
   * @param {string} folderPath  本地文件夹绝对路径
   */
  scanAnimaFolder(folderPath) {
    return request(`/api/scan_anima_folder?folder_path=${encodeURIComponent(folderPath)}`, { method: 'POST' });
  },

  /**
   * 读取 LoRA/safetensors 文件的 __metadata__ 头部，不加载权重张量。
   * @param {string} loraPath  本地 .safetensors / .pt / .ckpt 文件绝对路径
   */
  readLoraMetadata(loraPath) {
    return postJson('/api/read_lora_metadata', { path: loraPath });
  },

  /**
   * 检查路径是否存在于文件系统（用于路径字段存在性验证）。
   * @param {string} path  本地绝对路径
   * @returns {{ exists: boolean, type: 'file'|'dir'|'missing' }}
   */
  checkPathExists(path) {
    return postJson('/api/check_path_exists', { path });
  },

  /**
   * 在训练启动前检查输出目录是否已有同名 LoRA 文件（冲突检测）。
   * @param {string} outputDir   输出目录绝对路径
   * @param {string} outputName  LoRA 输出名（不含扩展名）
   * @returns {{ conflict: boolean, existing_files: string[] }}
   */
  checkOutputConflict(outputDir, outputName) {
    return postJson('/api/check_output_conflict', { output_dir: outputDir, output_name: outputName });
  },

  /**
   * 启动数据集质量扫描（异步后台任务）。
   * @param {string} datasetDir  数据集目录绝对路径
   * @returns {{ task_id: string, status: 'running' }}
   */
  startDatasetQualityScan(datasetDir) {
    return postJson('/api/dataset/start_quality_scan', { dataset_dir: datasetDir, recursive: true });
  },

  /**
   * 查询数据集质量扫描任务状态 + 结果。
   * @param {string} taskId  任务 ID
   * @returns {{ status: 'running'|'completed'|'failed', progress: number, total: number, result: object }}
   */
  getDatasetQualityStatus(taskId) {
    return getJson(`/api/dataset/quality_scan_status/${taskId}`);
  },

  probeSemanticSegmentation(params = {}) {
    return postJson('/api/dataset/semantic-segmentation/probe', params);
  },

  previewSemanticSegmentation(params = {}) {
    return postJson('/api/dataset/semantic-segmentation/preview', params);
  },

  buildSemanticSegmentationCache(params = {}) {
    return postJson('/api/dataset/semantic-segmentation/build-cache', params);
  },
  async listResourceCatalog() {
    const response = await request('/api/dataset/semantic-segmentation/providers');
    if (response?.status === 'error') throw new Error(response.message || '资源目录加载失败');
    return response;
  },

  async downloadResourceFromCatalog(payload = {}) {
    const response = await postJson('/api/dataset/semantic-segmentation/download', payload);
    if (response?.status === 'error') throw new Error(response.message || '资源下载失败');
    const result = response?.data || response;
    if (!['completed', 'reused'].includes(result?.status)) throw new Error(result?.error || '资源下载未完成');
    return response;
  },

  async listLocalResources(opts = {}) {
    const response = await postJson('/api/dataset/semantic-segmentation/local-scan', {
      limit: opts.limit ?? 1000,
      include_hash: Boolean(opts.include_hash),
      roots: opts.roots ?? [],
    });
    if (response?.status === 'error') throw new Error(response.message || '本地资源扫描失败');
    return response;
  },
  saveConfig(name, config) {
    return postJson('/api/saved_configs/save', { name, config });
  },

  /** Kohya TOML / ai-toolkit YAML → lulynx flat fields + migration notes */
  importExternalConfig(file) {
    const form = new FormData();
    form.append('file', file, file?.name || 'config.bin');
    return request('/api/import_external_config', { method: 'POST', body: form });
  },

  listSavedConfigs() {
    return request('/api/saved_configs/list');
  },

  loadSavedConfig(name) {
    return request(`/api/saved_configs/load?name=${encodeURIComponent(name)}`);
  },

  deleteSavedConfig(name) {
    return request(`/api/saved_configs/delete?name=${encodeURIComponent(name)}`);
  },

  renameSavedConfig(oldName, newName) {
    return postJson('/api/saved_configs/rename', { oldName, newName });
  },


  runScript(params) {
    return postJson('/api/run_script', params);
  },

  runCoreTool(endpoint, params) {
    return postJson(endpoint, params);
  },

  startGhostReplayRecord(params) {
    return postJson('/api/tools/ghost-replay/record', params);
  },

  runPreflight(config) {
    return postJson('/api/train/preflight', {
      allow_attention_fallback: true,
      ...config,
    });
  },

  applyBubbleAdvisorPatch(config, report, options = {}) {
    return postJson('/api/train/bubble-advisor/apply', {
      config: config || {},
      report: report || {},
      embed_ledger: true,
      keep_bubble_controller_enabled: true,
      ...options,
    });
  },

  runPcieTransferBenchmark(params = {}) {
    return postJson('/api/train/pcie-transfer-benchmark', params || {});
  },

  previewSamplePrompt(config) {
    return postJson('/api/train/sample_prompt', config);
  },

  getLogDirs() {
    return request('/api/log_dirs');
  },

  getLogDetail(dir) {
    return request(`/api/log_detail?dir=${encodeURIComponent(dir)}`);
  },

  runInterrogate(params) {
    return postJson('/api/interrogate', params);
  },

  checkInterrogateHealth(params) {
    return postJson('/api/interrogate/health', params);
  },

  getLlmTaggerChannels() {
    return request('/api/interrogate/llm_channels');
  },

  saveLlmTaggerChannel(params) {
    return postJson('/api/interrogate/llm_channels', params);
  },

  deleteLlmTaggerChannel(channelId) {
    return request(`/api/interrogate/llm_channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' });
  },

  clearLlmTaggerChannelKeys(channelId) {
    return postJson(`/api/interrogate/llm_channels/${encodeURIComponent(channelId)}/clear_keys`, {});
  },

  getDatasetTags(dir) {
    return request(`/api/dataset_tags?dir=${encodeURIComponent(dir)}`);
  },

  saveDatasetTag(params) {
    return postJson('/api/dataset_tags/save', params);
  },

  runImageResize(params) {
    return postJson('/api/image_resize', params);
  },

  getImageResizeStatus() {
    return request('/api/local/image_resize_status').catch(() => ({
      status: 'success',
      data: {
        process_status: 'unavailable',
        lines: ['后端已接收图像预处理任务（后台运行），不提供实时日志状态，请稍后查看输出目录。'],
      },
    }));
  },

  getSampleImages() {
    return request('/api/local/sample_images');
  },

  openFolder(folder) {
    return postJson('/api/local/open_folder', { folder: folder || 'output' });
  },

  openAdvancedMonitor() {
    return postJson('/api/system/open_advanced_monitor', {});
  },

  getWebuiErrors({ limit = 100, kind = '', q = '' } = {}) {
    const params = [`limit=${encodeURIComponent(limit)}`];
    if (kind && kind !== 'all') params.push(`kind=${encodeURIComponent(kind)}`);
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    return request(`/api/system/webui_errors?${params.join('&')}`);
  },

  runTraining(config) {
    return postJson('/api/run', {
      allow_attention_fallback: true,
      ...config,
    });
  },

  startLabDistiller(config) {
    return postJson('/api/lulynx-lab/distiller/start', { config });
  },

  startTurboLora(config) {
    return postJson('/api/lulynx-lab/turbo-lora/start', { config });
  },

  startDitFewStepLora(config) {
    return postJson('/api/lulynx-lab/dit-few-step-lora/start', { config });
  },

  validateTurboLoraOutput(outputPath, runtimeId = '') {
    return postJson('/api/lulynx-lab/turbo-lora/validate', {
      output_path: outputPath,
      runtime_id: runtimeId,
    });
  },

  reportTurboLoraSamples(outputPath, samplesDir = '', runtimeId = '') {
    return postJson('/api/lulynx-lab/turbo-lora/report-samples', {
      output_path: outputPath,
      samples_dir: samplesDir,
      runtime_id: runtimeId,
    });
  },

  getTensorBoardStatus(logdir = '') {
    const q = logdir ? `?logdir=${encodeURIComponent(logdir)}` : '';
    return request(`/api/tensorboard/status${q}`);
  },

  startTensorBoard(logdir, port = 6006) {
    return postJson('/api/tensorboard/start', {
      logdir,
      port,
    });
  },

  stopTensorBoard() {
    return postJson('/api/tensorboard/stop', {});
  },

  // === 新增接口 ===

  /** 获取标签编辑器启动状态 */
  getTagEditorStatus() {
    return request('/api/tageditor_status');
  },

  getTagTranslationTemplates() { return request('/tags/translation/templates'); },
  startTagTranslation(params = {}) { return postJson('/tags/translation/start', params || {}); },
  stopTagTranslation() { return postJson('/tags/translation/stop', {}); },
  getTagTranslationStatus() { return request('/tags/translation/status'); },

  /** 获取可用标注模型列表（WD14 / CL / LLM） */
  getInterrogators() {
    return request('/api/interrogators');
  },

  /** 数据集分析 */
  analyzeDataset(params) {
    return postJson('/api/dataset/analyze', params);
  },

  /** FIM-LoRA 训练前逐层 rank 扫描（companion tool，提交异步 job） */
  startFimScan(config) {
    return postJson('/api/system/fim-scan', { config });
  },

  /** 只读达标预测（copilot 只读预测器）：按当前趋势能否在总步数内达标 */
  getGoalForecast(runId, { lossTarget, validationLossTarget, l2Target, totalSteps } = {}) {
    const params = new URLSearchParams();
    if (lossTarget != null) params.set('loss_target', String(lossTarget));
    if (validationLossTarget != null) params.set('validation_loss_target', String(validationLossTarget));
    if (l2Target != null) params.set('l2_target', String(l2Target));
    if (totalSteps != null) params.set('total_steps', String(totalSteps));
    const qs = params.toString();
    return request(`/api/system/goal-forecast/${encodeURIComponent(runId)}${qs ? `?${qs}` : ''}`);
  },

  /** 自动训练 Copilot：授权一次无人值守闭环训练会话（提交后台 job） */
  startCopilot(payload) {
    return postJson('/api/system/copilot/start', payload);
  },

  /** Copilot 会话状态（含持久化 SessionState + job 状态） */
  getCopilotStatus(sessionId) {
    return request(`/api/system/copilot/status/${encodeURIComponent(sessionId)}`);
  },

  /** 请求优雅停止一个 Copilot 会话 */
  stopCopilot(sessionId) {
    return postJson(`/api/system/copilot/stop/${encodeURIComponent(sessionId)}`, {});
  },

  /** Copilot 中间态快照列表 */
  getCopilotSnapshots(sessionId) {
    return request(`/api/system/copilot/snapshots/${encodeURIComponent(sessionId)}`);
  },

  /** Copilot 试验报告 URL */
  getCopilotReportUrl(sessionId, trialIndex) {
    return `/api/system/copilot/report/${encodeURIComponent(sessionId)}/${encodeURIComponent(trialIndex)}`;
  },

  /** 删除 Copilot 中间态快照 */
  deleteCopilotSnapshot(sessionId, trialIndex) {
    return request(`/api/system/copilot/snapshots/${encodeURIComponent(sessionId)}/${encodeURIComponent(trialIndex)}`, { method: 'DELETE' });
  },

  /** 分布式/异步任务列表 */
  getJobs() {
    return request('/api/jobs');
  },

  /** 异步任务详情 */
  getJob(jobId) {
    return request(`/api/jobs/${encodeURIComponent(jobId)}`);
  },

  /** 取消异步任务 */
  cancelJob(jobId) {
    return postJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {});
  },

  /** 标签分析 - 提交异步任务 */
  startTagAnalysis(params) {
    return postJson('/api/tageditor/analysis/start', params);
  },

  /** 标签分析 - 快速预览 */
  previewTagAnalysis(params) {
    return postJson('/api/tageditor/analysis/preview', params);
  },

  /** 标签分析 - 读取缓存结果 */
  getTagAnalysisResult(params) {
    return postJson('/api/tageditor/analysis/result', params);
  },

  /** 标签建议 - 获取建议 */
  getTagSuggestions(params) {
    return postJson('/api/tageditor/suggestions', params);
  },

  /** 标签建议 - LLM 精修 */
  refineTagSuggestions(params) {
    return postJson('/api/tageditor/suggestions/llm_refine', params);
  },

  /** 标签建议 - 刷新索引 */
  refreshTagSuggestions(params) {
    return postJson('/api/tageditor/suggestions/refresh', params);
  },

  /** 标签批量操作 - 预览 */
  previewTagBatchAction(params) {
    return postJson('/api/tageditor/batch_action/preview', params);
  },

  /** 标签批量操作 - 开始 */
  startTagBatchAction(params) {
    return postJson('/api/tageditor/batch_action/start', params);
  },

  /** 标签批量标注 - 开始 */
  startInterrogateBatch(params) {
    return postJson('/api/tageditor/interrogate_batch/start', params);
  },

  /** 标签结果列表 */
  listTagResults(params) {
    return postJson('/api/tageditor/results/list', params);
  },

  /** 标签任务结果 */
  getTagJobResult(params) {
    return postJson('/api/tageditor/job_result', params);
  },

  // ===== 高级标签工具（P1/P2/P3，需 advanced_enabled） =====

  /** P1.1 集成打标管线 - 预览 */
  ensembleTagPreview(params) {
    return postJson('/api/tageditor/ensemble/preview', params);
  },

  /** P1.1 集成打标管线 - 应用 */
  ensembleTagApply(params) {
    return postJson('/api/tageditor/ensemble/start', params);
  },

  /** P1.2 结构化 caption - 预览 */
  structurePreview(params) {
    return postJson('/api/tageditor/structure/preview', params);
  },

  /** P1.2 结构化 caption - 应用 */
  structureApply(params) {
    return postJson('/api/tageditor/structure/start', params);
  },

  /** P1.3 近重复聚类审查 */
  nearDuplicatesReview(params) {
    return postJson('/api/tageditor/near_duplicates', params);
  },

  /** P5 近重复一键隔离（plan / quarantine / delete） */
  nearDuplicatesCull(params) {
    return postJson('/api/tageditor/near_duplicates/cull', params);
  },

  /** P5 本地内容扫描（opt-in；非合规保证） */
  contentScan(params) {
    return postJson('/api/dataset/content_scan', params);
  },

  /** P5 离群一键隔离 */
  outliersCull(params) {
    return postJson('/api/dataset/outliers/cull', params);
  },

  /** 缓存健康：report / repair_plan / quarantine_bad（只动 cache 产物） */
  cacheHealth(params) {
    return postJson('/api/dataset/cache_health', params);
  },

  /** P1.4 频率/类别批量 - 预览 */
  frequencyBatchPreview(params) {
    return postJson('/api/tageditor/frequency_batch/preview', params);
  },

  /** P1.4 频率/类别批量 - 应用 */
  frequencyBatchApply(params) {
    return postJson('/api/tageditor/frequency_batch/start', params);
  },

  /** P1.5 审查队列 */
  reviewQueue(params) {
    return postJson('/api/tageditor/review_queue', params);
  },

  /** P2.1 版本历史 */
  versionHistory(params) {
    return postJson('/api/tageditor/version/history', params);
  },

  /** P2.1 版本差异 */
  versionDiff(params) {
    return postJson('/api/tageditor/version/diff', params);
  },

  /** P2.1 版本回退（写） */
  versionRevert(params) {
    return postJson('/api/tageditor/version/revert', params);
  },

  /** P2.2 策略包 - 列表 */
  policyPackList(params) {
    return postJson('/api/tageditor/policy/list', params);
  },

  /** P2.2 策略包 - 预览 */
  policyPackPreview(params) {
    return postJson('/api/tageditor/policy/preview', params);
  },

  /** P2.2 策略包 - 应用（写） */
  policyPackApply(params) {
    return postJson('/api/tageditor/policy/apply', params);
  },

  /** P2.3 智能重标队列 - 构建 */
  retagQueueBuild(params) {
    return postJson('/api/tageditor/retag/queue', params);
  },

  /** P2.3 智能重标队列 - 标记（写） */
  retagQueueMark(params) {
    return postJson('/api/tageditor/retag/mark', params);
  },

  /** P2.3 智能重标队列 - 下一批 */
  retagQueueNext(params) {
    return postJson('/api/tageditor/retag/next', params);
  },

  /** P3.2 跨数据集标签情报 - 聚合 */
  crossDatasetAggregate(params) {
    return postJson('/api/tageditor/cross_dataset/aggregate', params);
  },

  /** P3.2 跨数据集标签情报 - 读取缓存 */
  crossDatasetResult(params) {
    return postJson('/api/tageditor/cross_dataset/result', params);
  },

  /** P3.3 闭环清洗管线 - 计划（只读） */
  pipelinePlan(params) {
    return postJson('/api/tageditor/pipeline/plan', params);
  },

  /** P3.3 闭环清洗管线 - 运行（写） */
  pipelineRun(params) {
    return postJson('/api/tageditor/pipeline/run', params);
  },

  /** Masked-loss 数据集审查 */
  maskedLossAudit(params) {
    return postJson('/api/dataset/masked_loss_audit', params);
  },

  /** BBox 标注 - 图片列表 */
  listBBoxImages(params) {
    return postJson('/api/dataset/bbox/list', params);
  },

  /** BBox 标注 - 读取单张图片标注 */
  readBBoxAnnotation(params) {
    return postJson('/api/dataset/bbox/read', params);
  },

  /** BBox 标注 - 保存单张图片标注 */
  saveBBoxAnnotation(params) {
    return postJson('/api/dataset/bbox/save', params);
  },

  /** BBox 标注 - 当前图模型预标注 */
  predictBBoxAnnotation(params) {
    return postJson('/api/dataset/bbox/predict', params);
  },

  /** BBox 标注 - 整目录批量预标注 */
  startBBoxBatchPredict(params) {
    return postJson('/api/dataset/bbox/predict_batch/start', params);
  },

  /** BBox 标注 - 图片预览地址 */
  getBBoxImageUrl(path) {
    return `/api/dataset/bbox/image?path=${encodeURIComponent(path || '')}`;
  },

  /** Caption 训练 mutate 预览（不写盘） */
  captionMutatePreview(params) {
    return postJson('/api/captions/mutate/preview', params);
  },

  /** Caption 清洗 - 预览 */
  captionCleanupPreview(params) {
    return postJson('/api/captions/cleanup/preview', params);
  },

  /** Caption 清洗 - 应用 */
  captionCleanupApply(params) {
    return postJson('/api/captions/cleanup/apply', params);
  },

  /** Caption 清洗 - 提交异步任务 */
  captionCleanupStart(params) {
    return postJson('/api/captions/cleanup/start', params);
  },

  /** Tag Manager Lite - 预览与统计 */
  tagManagerLitePreview(params) {
    return postJson('/api/captions/tag_manager/preview', params);
  },

  /** Tag Manager Lite - 提交异步任务 */
  tagManagerLiteStart(params) {
    return postJson('/api/captions/tag_manager/start', params);
  },

  /** Caption 备份 - 创建 */
  captionBackupCreate(params) {
    return postJson('/api/captions/backups/create', params);
  },

  /** Caption 备份 - 列表 */
  captionBackupList(params) {
    return postJson('/api/captions/backups/list', params);
  },

  /** Caption 备份 - 恢复 */
  captionBackupRestore(params) {
    return postJson('/api/captions/backups/restore', params);
  },

  /** 图像预处理预览 */
  imageResizePreview(inputDir, recursive = false, limit = 8) {
    return request(`/api/image_resize/preview?input_dir=${encodeURIComponent(inputDir)}&recursive=${recursive}&limit=${limit}`);
  },

  /** 获取可用脚本列表 */
  getAvailableScripts() {
    return request('/api/scripts');
  },

  /** 获取文件列表（模型文件 / 训练目录） */
  getFiles(pickType) {
    return request(`/api/get_files?pick_type=${encodeURIComponent(pickType)}`);
  },

  /** 获取配置摘要 */
  getConfigSummary() {
    return request('/api/config/summary');
  },

  /** 获取训练任务输出日志 */
  getTaskOutput(taskId, tail = 100) {
    return request(`/api/task_output/${taskId}?tail=${tail}`);
  },

  /** GPU 实时状态 (VRAM 占用等) */
  getGpuStatus() {
    return request('/api/gpu_status');
  },

  /** 系统资源监控 (GPU VRAM + CPU + RAM) */
  getSystemMonitor() {
    return request('/api/system_monitor');
  },

  /** 切换当前启用的 UI */
  activateUiProfile(profileId) {
    return postJson('/api/ui_profiles/activate', { profile_id: profileId });
  },

  /** 列出数据集文件夹中的图片 */
  listDatasetImages(folder, limit = 6) {
    return request(`/api/dataset/list_images?folder=${encodeURIComponent(folder)}&limit=${limit}`);
  },


  // ═══ 插件系统 API ═══

  /** 获取插件运行时状态 */
  getPluginRuntime() {
    return request('/api/plugins/runtime');
  },

  /** 重新加载所有插件 */
  reloadPlugins() {
    return postJson('/api/plugins/reload', {});
  },

  /** 获取插件能力列表 */
  getPluginCapabilities() {
    return request('/api/plugins/capabilities');
  },

  /** 获取插件钩子列表 */
  getPluginHooks() {
    return request('/api/plugins/hooks');
  },

  /** 设置开发者模式 */
  setPluginDeveloperMode(enabled) {
    return postJson('/api/plugins/developer_mode', { enabled });
  },

  /** 审批插件 */
  approvePlugin(pluginId, approvedBy) {
    return postJson('/api/plugins/approve', { plugin_id: pluginId, approved_by: approvedBy || 'ui_user' });
  },

  /** 审批单个 SDK Runner */
  approvePluginRunner(pluginId, runnerId, approvedBy) {
    return postJson('/api/plugins/sdk/approve_runner', {
      plugin_id: pluginId,
      runner_id: runnerId,
      approved_by: approvedBy || 'ui_user',
    });
  },

  /** 撤销插件审批 */
  revokePluginApproval(pluginId) {
    return postJson('/api/plugins/revoke_approval', { plugin_id: pluginId });
  },

  /** 获取插件审计日志 */
  getPluginAudit(limit) {
    return request('/api/plugins/audit' + (limit ? '?limit=' + limit : ''));
  },

  getPluginSdkStatus() {
    return request('/api/plugins/sdk/status');
  },

  executePluginSdkRunner(runnerId, payload = {}, requestedBy = 'ui-user') {
    return postJson('/api/plugins/sdk/execute', {
      runner_id: runnerId,
      payload,
      requested_by: requestedBy,
    });
  },

  getPluginSettings(pluginId) {
    return request(`/api/plugins/${encodeURIComponent(pluginId)}/settings`);
  },

  savePluginSettings(pluginId, settings, updatedBy = 'ui-user') {
    return postJson(`/api/plugins/${encodeURIComponent(pluginId)}/settings`, {
      settings,
      updated_by: updatedBy,
    });
  },

};
