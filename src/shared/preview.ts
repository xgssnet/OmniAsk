import type { ModelResponse } from './types';

/**
 * 界面预览用的示例数据。
 * 仅用于验证 Markdown、代码高亮、表格、状态卡片、复制与折叠等 UI 能力，
 * 不是任何 AI 模型的真实回答，也不会被写入历史记录或发送给任何接口。
 */
export const PREVIEW_QUESTION =
  'Rocky Linux 9 如何部署 Docker，并配置国内镜像源？';

export const PREVIEW_SITE_IDS = ['chatgpt', 'claude', 'deepseek'];

export const PREVIEW_RESPONSES: ModelResponse[] = [
  {
    siteId: 'chatgpt',
    status: 'completed',
    attempts: 1,
    durationMs: 12_400,
    content: `## 示例：安装 Docker CE

先卸载旧组件，再添加官方仓库：

\`\`\`bash
sudo dnf remove -y podman buildah
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io
sudo systemctl enable --now docker
\`\`\`

镜像加速配置写入 \`/etc/docker/daemon.json\`：

\`\`\`json
{
  "registry-mirrors": ["https://<你的镜像加速地址>"]
}
\`\`\`

> 这是界面示例文本，不是真实模型回答。`,
  },
  {
    siteId: 'claude',
    status: 'completed',
    attempts: 1,
    durationMs: 15_800,
    content: `### 示例：核对要点

| 检查项 | 说明 |
| --- | --- |
| 仓库来源 | 确认与发行版匹配 |
| 服务状态 | \`systemctl status docker\` |
| 配置生效 | \`sudo systemctl daemon-reload && sudo systemctl restart docker\` |

1. 配置修改后必须重启服务。
2. 使用 \`docker info\` 验证 Registry Mirrors。

*界面示例文本，仅用于验证表格与列表渲染。*`,
  },
  {
    siteId: 'deepseek',
    status: 'failed',
    attempts: 2,
    durationMs: 8_100,
    content: '',
    error: '示例错误：目标页面未找到输入框（用于验证失败卡片样式）。P4 阶段会实现真实适配器与错误分类。',
  },
];

export const PREVIEW_ANALYSIS = `# 最终综合答案

> 以下为界面示例文本，用于验证综合答案的 Markdown 渲染与复制能力，**不是真实裁决结果**。

## 核心结论

- 多模型观点需要在 P6 阶段经过结构化与冲突检测后才能生成。
- 无法验证的结论必须标记为「尚未验证」，不编造来源。

## 争议点示意

| 争议点 | 模型 A | 模型 B |
| --- | --- | --- |
| 配置生效方式 | 重启服务 | 重载配置 |

## 不确定性说明

示例数据仅用于界面验证，不包含任何事实核查结论。`;
