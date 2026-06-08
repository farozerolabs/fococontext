# Source Watch

## 引言

Source Watch 用于把外部资料位置和 Knowledge Base 保持同步。它适合长期运行的资料目录、S3 前缀、URL 列表和 Git 仓库。

## 步骤 1：选择来源类型

| 类型     | 说明                            | 生产建议                                       |
| -------- | ------------------------------- | ---------------------------------------------- |
| 挂载目录 | 扫描挂载到 API 容器内的目录     | 通过 Docker volume 明确挂载                    |
| S3       | 扫描用户提供的 bucket 和 prefix | 使用该数据源自己的 S3 凭证，不复用系统对象存储 |
| URL 列表 | 定期抓取一组固定 URL            | 限制域名、大小和超时                           |
| Git 仓库 | 扫描仓库中的文档路径            | 使用只读 token 或公开仓库                      |

当前部署如果只开放挂载目录，可以先只创建 mounted directory 规则。默认容器路径是 `/source-watch`，创建规则时填该路径或它的子路径。其他类型应在后端配置和安全策略准备好后启用。

## 步骤 2：创建规则

在资料页或 Source Watch 页面创建规则。核心字段：

| 字段               | 说明                                            |
| ------------------ | ----------------------------------------------- |
| 名称               | 规则显示名                                      |
| Knowledge Base     | 扫描结果进入哪个知识库                          |
| 来源类型           | mounted directory、S3、URL list、Git repository |
| 位置               | 目录路径、bucket prefix、URL 列表或仓库地址     |
| include extensions | 允许的扩展名，例如 `.md,.pdf,.docx`             |
| exclude globs      | 排除路径，例如 `**/node_modules/**`             |
| max file size      | 单个文件大小上限                                |
| schedule           | 定时扫描表达式或间隔                            |
| auto ingest        | 扫描到新增或变更后是否自动入库                  |

## 步骤 3：先手动扫描

创建后先点击手动扫描。不要直接开启定时任务。

手动扫描应检查：

1. 规则状态是否成功。
2. discovered、created、changed、skipped、failed 数量是否符合预期。
3. 创建的 Source ID 和 Job ID 是否能在资料页和任务页看到。
4. skipped 原因是否可接受。
5. 规则没有扫描到不该进入知识库的目录。

## 步骤 4：查看扫描历史

扫描历史是 Source Watch 的运维入口，也对应 API 中的 scan history。

| 字段               | 含义                         |
| ------------------ | ---------------------------- |
| started / finished | 本次扫描开始和结束时间       |
| status             | success、partial、failed     |
| discovered count   | 扫描到的候选项               |
| changed count      | 新增或内容变化数量           |
| delete candidates  | 外部位置消失的候选资料       |
| skipped count      | 被扩展名、大小或排除规则跳过 |
| error summary      | 认证、网络、权限或解析前错误 |

delete candidates 会先进入资料删除生命周期和影响预览，再进入清理。

## 步骤 5：开启定时扫描

手动扫描稳定后，再启用 schedule。生产环境建议：

- 低频资料源每天或每小时扫描。
- 高频资料源用较小范围的路径或 prefix。
- 大仓库先限制 include extensions。
- Git 和 URL 规则设置合理 timeout。
- 对模型成本敏感的知识库关闭 auto ingest，先人工检查扫描结果。

## 故障排查

| 现象                 | 检查项                                                |
| -------------------- | ----------------------------------------------------- |
| 挂载目录扫描不到文件 | Docker volume 是否挂载到容器内，路径是否是容器路径    |
| S3 扫描失败          | 用户数据源凭证、bucket、region、endpoint、prefix 权限 |
| URL 全部跳过         | URL 安全策略、MIME、大小限制、请求超时                |
| Git 认证失败         | token 权限、仓库 URL、分支、路径过滤                  |
| 扫描重复创建资料     | 内容 hash 和外部 locator 是否稳定                     |

## 生产注意事项

- Source Watch 凭证属于被扫描数据源，不应复用系统 S3 存储凭证。
- 规则配置应尽量窄，避免把整个服务器目录或巨大 bucket 扫进去。
- 定时扫描需要观察 Worker 并发，避免和手动上传互相挤占资源。
- 关闭规则会停止后续扫描。已入库资料会保留，直到正常资料删除流程执行。
