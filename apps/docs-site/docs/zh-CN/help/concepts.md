# 核心概念

## 引言

本页解释后台和 OpenAPI 中反复出现的对象。阅读后再进入具体流程页，会更容易判断一个问题属于资料层、编译层、知识层、版本层还是检索层。

| 概念                 | 主要页面              | 常用 API 场景                       |
| -------------------- | --------------------- | ----------------------------------- |
| Knowledge Base       | 主页、设置、版本      | 创建数据集、保存配置、调用 Retrieve |
| Source Document      | 资料、任务            | 上传文件、提交文本、删除资料        |
| Ingest Job           | 任务、资料详情        | 查询处理进度、重试失败任务          |
| Wiki Page            | Wiki 页面、Graph View | 阅读长期知识、导出 Markdown         |
| Graph Edge           | Graph View            | 解释页面关系和多跳扩展              |
| Knowledge Check      | Knowledge Check       | 发现缺源、断链、重复和孤立页面      |
| Version / Change Set | 版本                  | 对比、回滚、追踪每次知识变化        |
| Fork                 | Fork 提交             | 隔离终端用户或工作区产生的新增知识  |

## 知识库（Knowledge Base）

Knowledge Base 是顶层数据集。一个 Knowledge Base 拥有资料、解析结果、Wiki 页面、图谱边、检索索引、Knowledge Check、版本、Webhook 和 Fork。

创建时需要关注：

| 字段            | 说明                                              |
| --------------- | ------------------------------------------------- |
| name            | 给管理员看的显示名称                              |
| slug            | 稳定短标识，适合 URL、脚本和排查                  |
| purpose         | 知识库目的，会影响生成和检索风格                  |
| output language | 生成 Wiki 页面和系统页使用的语言                  |
| schema          | 页面类型、字段、命名、链接和 Markdown 契约        |
| retrieve config | topK、图谱扩展、rerank、context budget 等检索策略 |

建议开发者在业务数据库里保存 Knowledge Base ID。ID 是 API 调用的稳定主键，name 和 slug 更适合展示、URL 和排查。

## 源资料（Source Document）

Source Document 是证据层。它可以来自后台上传、OpenAPI 文本提交、URL、Source Watch 扫描或 Fork-owned submission。

Source 会保存：

- 原始文件名和 MIME。
- S3 object key 和内容 hash。
- 归档路径或虚拟目录。
- 解析器名称、版本、警告和可追溯 locator。
- 图片、表格、附件等媒体资产。
- 最近一次入库任务和清理状态。

Source 是证据输入。它提供证据、引用和可重放输入。检索面向编译后的 Wiki 页面和页面片段。

## 入库任务（Ingest Job）

Ingest Job 是异步处理记录。后台任务列表和资料列表都会显示当前阶段。

| 阶段       | 发生什么                                     |
| ---------- | -------------------------------------------- |
| queued     | 任务进入队列，等待 Worker                    |
| parsing    | 解析文档、抽取文本、表格、图片和 locator     |
| analyzing  | 调用模型分析实体、概念、关系和摘要           |
| generating | 生成 Wiki 页面草稿和系统页更新               |
| merging    | 合并到已有页面，生成 Change Set 和页面版本   |
| indexing   | 更新全文索引、向量索引、图索引和检索就绪状态 |
| completed  | 整个编译流程完成，可以用于 Retrieve          |
| failed     | 某阶段失败，保留错误、阶段和可重试信息       |

任务时间线是历史事件，最新事件排在上面。每条事件包含状态、时间、消息和必要元数据，用于排查模型、解析器、索引或存储问题。

## Wiki 页面（Wiki Page）

Wiki Page 是长期知识资产。它包含 Markdown 正文、frontmatter、来源引用、相关页面、版本记录和导出契约。

常见页面类型：

| 类型           | 用途                                 |
| -------------- | ------------------------------------ |
| source summary | 资料摘要页，说明来源内容和可引用证据 |
| entity         | 人、组织、产品、接口、模块等稳定对象 |
| concept        | 概念、流程、规范、问题类型           |
| overview       | 知识库整体概览                       |
| index          | 目录和导航入口                       |
| changelog      | 知识变化记录                         |

Retrieve 的主体是 Wiki Page。这样可以让知识长期维护，并让不同资料中的同一概念沉淀到同一个对象上。

## 图谱视图（Graph View）

Graph View 展示页面之间的关系。关系来源包括 Wiki link、shared source、common neighbor、type affinity、模型生成证据关系和社群检测结果。

| 图谱信息 | 作用                                   |
| -------- | -------------------------------------- |
| 节点     | Wiki Page、Source Summary 或系统页     |
| 边       | 页面关系、来源共享、类型亲和、引用证据 |
| 社群     | 一组高度相关的页面集合                 |
| 桥接页面 | 连接多个主题区域的页面                 |
| 图谱洞察 | 孤立页、意外连接、缺口和重点关系       |

图谱用于解释和扩展检索，来源引用仍然是证据边界。

## 知识检查（Knowledge Check）

Knowledge Check 是非阻塞质量信号。它用于提示管理员哪些知识可能需要关注。

| 发现类型            | 含义                         |
| ------------------- | ---------------------------- |
| isolated page       | 页面缺少足够关系             |
| broken link         | Markdown 或图谱里存在断链    |
| missing source      | 页面缺少可追溯证据           |
| duplicate candidate | 多个页面可能描述同一对象     |
| conflict candidate  | 新资料与已有页面可能存在冲突 |
| weak retrieval      | 页面检索可见性较弱           |

这些发现是非阻塞质量信号。管理员可以根据证据判断是否需要继续补资料、修改 schema 或删除错误来源。

## 版本、Change Set 和回滚

每次知识变化都应形成可追溯版本。版本记录回答三个问题：

1. 哪些页面改变了。
2. 改变来自哪些资料或操作。
3. 如果需要回滚，系统能回到哪个状态。

版本能力保留 Git-like 的审计思路。系统会自动应用编译结果，并保留可对比、可回滚的记录。

## Fork 隔离层

Fork 用于隔离用户或工作区自己的知识增量。它适合多用户产品：每个终端用户可以基于同一个上游知识库形成自己的分叉，并提交自己的补充资料。主知识库保持稳定、干净、可共享。

Fork 只保存隔离后的提交和版本关系。外部应用负责决定何时收集用户内容、何时调用 Fork submission API、何时使用 fork scope 检索。
