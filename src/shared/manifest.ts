import { BUILTIN_MATCH_PATTERNS } from './sites';

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  short_name: string;
  version: string;
  description: string;
  minimum_chrome_version: string;
  icons: Record<string, string>;
  action: {
    default_title: string;
    default_popup: string;
    default_icon: Record<string, string>;
  };
  side_panel: { default_path: string };
  options_ui: { page: string; open_in_tab: boolean };
  background: { service_worker: string };
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: string;
    all_frames: boolean;
  }>;
}

const ICONS = {
  '16': 'icons/icon16.png',
  '32': 'icons/icon32.png',
  '48': 'icons/icon48.png',
  '128': 'icons/icon128.png',
};

/**
 * Manifest V3 单一数据源。
 * 自定义站点（P3）将通过 chrome.scripting 动态注入，避免申请 <all_urls> 全量权限。
 */
export function createManifest(version: string): ExtensionManifest {
  return {
    manifest_version: 3,
    name: 'OmniAsk 多模型协同问答',
    short_name: 'OmniAsk',
    version,
    description: '一次提问，多模型回答，交叉验证，生成最佳答案。所有数据默认保存在本地。',
    minimum_chrome_version: '114',
    icons: ICONS,
    action: {
      default_title: 'OmniAsk',
      default_popup: 'popup.html',
      default_icon: ICONS,
    },
    side_panel: { default_path: 'sidepanel.html' },
    options_ui: { page: 'app.html?view=settings', open_in_tab: true },
    background: { service_worker: 'background.js' },
    permissions: ['storage', 'tabs', 'sidePanel', 'scripting'],
    host_permissions: BUILTIN_MATCH_PATTERNS,
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    content_scripts: [
      {
        matches: BUILTIN_MATCH_PATTERNS,
        js: ['content.js'],
        run_at: 'document_idle',
        all_frames: false,
      },
    ],
  };
}
