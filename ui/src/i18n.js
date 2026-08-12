const translations = {
  en: {
    nav: {
      config: 'Config',
      training: 'Training',
      tagger: 'Tagger',
      dataset: 'Dataset',
      logs: 'Logs',
      tools: 'Tools',
      settings: 'Settings',
      about: 'About',
    },
    navigator: {
      header: 'Explorer',
      training_types: 'Training types',
      preset_list: 'Presets',
      new_preset: 'New preset',
      editing: 'Editing…',
    },
    // data-i18n keys on .top-nav-item slots (legacy HTML names) map 1:1 by DOM
    // order to UI_TABS / TOPBAR_TABS:
    // model, dataset, training, network, optimizer, preview, speed, frontier, advanced
    topbar: {
      model: 'Model',
      tagger: 'Dataset',
      advanced: 'Training',
      dataset: 'Network',
      optimizer: 'Optimizer',
      tensorboard: 'Preview / Validation',
      tools: 'Acceleration',
      frontier: 'Frontier',
      help: 'Advanced',
    },
    config: {
      title: 'Model config',
      subtitle: 'Base architecture and core weight redistribution settings.',
      base_model_path: 'Base model path',
      precision: 'Training precision',
      save_format: 'Save format',
      network_rank: 'Network rank (DIM)',
      network_alpha: 'Network alpha',
      enable_preview: 'Enable training preview',
      enable_preview_desc: 'Generate sample images during training to monitor quality.',
    },
    actions: {
      execute: 'Start training',
      press_f5: '',
    },
    json_panel: {
      header: 'Parameter preview',
    },
    settings: {
      title: 'System settings',
      language: 'Language',
      theme: 'Theme',
      dark: 'Dark',
      light: 'Light',
      accent_color: 'Accent color',
      reset: 'Reset',
    },
  },
  zh: {
    nav: {
      config: '配置',
      training: '训练',
      tagger: '标注',
      dataset: '数据集',
      logs: '日志',
      tools: '工具',
      settings: '设置',
      about: '关于',
    },
    navigator: {
      header: '资源管理器',
      training_types: '训练类型',
      preset_list: '参数管理',
      new_preset: '新建预设',
      editing: '正在编辑...',
    },
    topbar: {
      model: '模型',
      tagger: '数据参数',
      advanced: '训练',
      dataset: '网络',
      optimizer: '优化器',
      tensorboard: '预览/验证',
      tools: '加速',
      frontier: '先锋',
      help: '高级',
    },
    config: {
      title: '模型配置',
      subtitle: '定义基础架构与核心权重重分布参数。',
      base_model_path: '基础模型路径',
      precision: '训练精度',
      save_format: '保存格式',
      network_rank: '网络秩 (DIM)',
      network_alpha: '网络 ALPHA',
      enable_preview: '启用训练预览',
      enable_preview_desc: '在训练期间实时生成样本图以监控质量。',
    },
    actions: {
      execute: '开始训练',
      press_f5: '',
    },
    json_panel: {
      header: '参数预览',
    },
    settings: {
      title: '系统设置',
      language: '语言',
      theme: '主题',
      dark: '深色',
      light: '浅色',
      accent_color: '强调色',
      reset: '重置',
    },
  },
};

export const t = (path, lang = 'zh') => {
  const keys = path.split('.');
  let result = translations[lang] || translations.zh;
  for (const key of keys) {
    if (!result || !result[key]) return path;
    result = result[key];
  }
  return result;
};

export default translations;
