# 发布验证

## 引言

发布验证从两个角度证明 FocoContext 可以进入发布流程。

白盒验证检查代码级契约：API 路由行为、repository 查询、迁移、队列状态、运行时配置、资料入库、检索契约、来源证据、租户隔离、清理、安全控制和 Admin UI 行为。

黑盒验证启动 Docker Compose 运行时，并以开发者和管理员的方式使用产品：公开 OpenAPI、Admin Web、PostgreSQL、Redis、S3-compatible 存储、OCR、API、Worker 和迁移。

## 验证命令

先安装依赖：

```bash
pnpm install
```

运行报告契约自检：

```bash
pnpm run validation:report-contract
```

运行白盒路径：

```bash
pnpm run validation:white-box -- --env .env
```

运行完整发布验证路径：

```bash
pnpm run validation:release -- --env .env
```

完整路径会上传代表性文档、轮询入库任务、执行 Retrieve、执行 Retrieve Expand、解析来源证据、通过浏览器打开 Admin Web，并清理临时知识库。

## 代表性文档

默认样本保持小规模。

| 来源                                                   | 默认用途                                        |
| ------------------------------------------------------ | ----------------------------------------------- |
| `/Users/gaobohan/Desktop/documents-test`               | Markdown、PDF、Office、表格、文本等通用文件形态 |
| `local-knowledge-demos/legal-corpus/official-flk-sync` | 已清洗的法律 Markdown 样本                      |

全量语料验证不是默认路径。大规模或高成本运行需要显式开启，并在开始前记录预计耗时、provider 依赖和成本风险。

## 报告输出

默认报告写入 `test-results/whitebox-blackbox-validation`。也可以通过 `FOCOCONTEXT_VALIDATION_REPORT_DIR` 或 `--report-dir` 修改路径。该目录属于本地验证产物，不提交到 Git。

每次运行会写出：

| 文件          | 用途                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| `report.json` | 机器可读的运行元数据、指标、endpoint 覆盖、样本文件、发现项和发布门禁状态 |
| `summary.md`  | 面向发布审查的人类可读摘要                                                |
| Admin 截图    | 启用 Admin 验证时保存关键后台流程的浏览器证据                             |

报告会脱敏 API Key、密码、provider secret、私有对象 URL 和敏感 payload。

## 通过标准

发布验证只有在以下条件满足时才算 ready：

- 必需白盒检查通过。
- 选定运行时的 Docker Compose 配置、迁移、API、Worker、OCR、PostgreSQL、Redis 和对象存储检查通过。
- 认证公开 OpenAPI 的上传、任务轮询、Retrieve、Retrieve Expand、Source Evidence 和清理通过。
- 未认证 OpenAPI 和 OpenAPI JSON 请求被拒绝。
- Admin Web session 流程通过，浏览器存储中没有 API Key。
- 报告契约通过。
- 被接受的残留风险明确写入报告。

如果验证发现阻塞产品缺陷，先修复缺陷，再重跑受影响路径，最后重跑完整发布验证。
