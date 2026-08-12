// 训练前参数摘要确认卡（Feature 4）
//
// 在 preflight 通过后、api.runTraining 前弹出只读摘要卡，
// 用户确认才真正启动训练，取消则中止。
//
// 使用方式：
//   import { createTrainingSummaryTool } from './trainingSummaryTool.js';
//   const { openTrainingSummary } = createTrainingSummaryTool();
//   window.openTrainingSummary = openTrainingSummary;  // trainingActions.js 通过 window 调用

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal training-summary-modal';

export function createTrainingSummaryTool() {

  function closeTrainingSummary() {
    document.querySelector('.training-summary-modal')?.remove();
  }

  /**
   * 弹出训练摘要确认弹窗，返回 Promise<boolean>。
   * true = 用户点击「确认启动训练」，false = 用户取消或关闭。
   */
  function openTrainingSummary(config, trainingType, _runConfig) {
    closeTrainingSummary();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = MODAL_CLASS + ' open';
      overlay.innerHTML = renderSummary(config, trainingType);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeTrainingSummary(); resolve(false); }
      });

      const confirmBtn = overlay.querySelector('[data-ts-confirm]');
      const cancelBtn  = overlay.querySelector('[data-ts-cancel]');
      if (confirmBtn) confirmBtn.onclick = () => { closeTrainingSummary(); resolve(true); };
      if (cancelBtn)  cancelBtn.onclick  = () => { closeTrainingSummary(); resolve(false); };

      document.body.appendChild(overlay);
    });
  }

  return { openTrainingSummary, closeTrainingSummary };
}

// ── 渲染 ──────────────────────────────────────────────────────────────

function renderSummary(config, trainingType) {
  const groups = buildSummaryGroups(config, trainingType);
  const groupsHtml = groups.map(group => {
    const rowsHtml = group.rows.map(({ label, value, warn }) => `
      <div class="ts-param-row ${warn ? 'ts-row-warn' : ''}">
        <span class="ts-param-label">${escapeHtml(label)}</span>
        <span class="ts-param-value">${escapeHtml(String(value ?? '—'))}</span>
      </div>
    `).join('');

    return `
      <div class="ts-group">
        <div class="ts-group-title">${escapeHtml(group.title)}</div>
        <div class="ts-group-content">${rowsHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="training-option-help-dialog training-summary-dialog"
         role="dialog" aria-modal="true" aria-label="训练参数确认">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">训练确认</span>
          <h3>🚀 即将启动训练</h3>
        </div>
        <button class="modal-close" type="button" title="取消" data-ts-cancel>×</button>
      </div>
      <div class="training-option-help-body training-summary-body">
        <p class="field-desc">请确认以下参数无误后再启动训练：</p>
        <div class="ts-groups-container">${groupsHtml}</div>
      </div>
      <div class="training-option-help-foot">
        <button class="btn btn-outline" type="button" data-ts-cancel>取消</button>
        <button class="btn btn-primary" type="button" data-ts-confirm>✓ 确认启动训练</button>
      </div>
    </div>
  `;
}

function buildSummaryGroups(config, trainingType) {
  const c = config || {};
  const groups = [];

  const addGroup = (title, rowsFn) => {
    const rows = [];
    const add = (label, value, { warn = false } = {}) => {
      if (value !== undefined && value !== null && value !== '') {
        rows.push({ label, value, warn });
      }
    };
    rowsFn(add);
    if (rows.length > 0) {
      groups.push({ title, rows });
    }
  };

  // 基础配置
  addGroup('基础配置', (add) => {
    add('训练类型', trainingType || c.model_train_type || '—');
    add('输出名称', c.output_name || '—', { warn: !c.output_name });
    add('输出目录', c.output_dir || '—', { warn: !c.output_dir });
    add('基础模型', _short(c.pretrained_model_name_or_path));
  });

  // LoRA 参数
  const networkMod = c.network_module || c.lora_type || '';
  if (networkMod || c.network_dim || c.network_alpha) {
    addGroup('网络模块', (add) => {
      if (networkMod) add('网络模块', networkMod);
      if (c.network_dim) add('LoRA Rank', c.network_dim);
      if (c.network_alpha) add('LoRA Alpha', c.network_alpha);
    });
  }

  // 训练参数
  addGroup('训练参数', (add) => {
    const steps = c.max_train_steps || c.max_train_epochs
      ? (c.max_train_steps ? `${c.max_train_steps} 步` : `${c.max_train_epochs} Epoch`)
      : '—';
    add('训练量', steps);
    if (c.train_batch_size) add('Batch Size', c.train_batch_size);
    if (c.resolution) add('训练分辨率', c.resolution);
  });

  // 优化器与调度器
  addGroup('优化器', (add) => {
    const lr = c.unet_lr || c.learning_rate;
    if (lr) add('学习率', lr);
    if (c.optimizer_type || c.optimizer) add('优化器', c.optimizer_type || c.optimizer);
    if (c.lr_scheduler) add('LR Scheduler', c.lr_scheduler);
  });

  return groups;
}

/** 截断长路径只保留文件名 */
function _short(p) {
  if (!p) return '—';
  return p.replace(/\\/g, '/').split('/').pop() || p;
}
