# Webhook 与运维

## 引言

Webhook 用于把入库完成、失败、删除清理、Source Watch 扫描和版本变化通知外部系统。它可以减少轮询，并适合搭配最终状态 API 查询使用。

## 步骤 1：决定要订阅的事件

| 事件                        | 什么时候触发     | 典型用途                           |
| --------------------------- | ---------------- | ---------------------------------- |
| job.completed               | 入库任务完成     | 刷新业务侧缓存，允许用户检索新内容 |
| job.failed                  | 入库任务失败     | 通知运维或自动重试策略             |
| source.deleted              | 资料进入删除流程 | 清理业务侧引用                     |
| cleanup.completed           | 异步清理完成     | 更新存储统计或审计                 |
| source_watch.scan_completed | 扫描完成         | 展示同步状态                       |
| version.created             | 生成新知识版本   | 记录业务侧知识版本                 |

## 步骤 2：创建 Webhook

在后台或 OpenAPI 中创建 Webhook。关键字段：

| 字段         | 说明                       |
| ------------ | -------------------------- |
| name         | Webhook 显示名             |
| endpoint URL | 接收事件的 HTTPS 地址      |
| events       | 订阅的事件类型             |
| secret       | 用于签名校验的密钥         |
| enabled      | 是否启用投递               |
| retry policy | 失败后的重试次数和退避策略 |

生产环境建议 endpoint 使用 HTTPS，并限制只接受来自可信网络或网关的请求。

## 步骤 3：校验签名

接收方应校验签名和时间戳，防止伪造请求。推荐处理顺序：

1. 读取原始请求体。
2. 校验签名头。
3. 校验时间戳是否在可接受窗口内。
4. 按 event ID 做幂等去重。
5. 返回 2xx 表示接收成功。

事件体通常包含事件 ID、事件类型、发生时间、Knowledge Base ID、相关资源 ID 和状态摘要。接收方不应只信任事件体里的业务状态；重要场景需要再调用 API 读取最新资源。

```json
{
  "event_id": "evt_example",
  "event": "job.completed",
  "knowledge_base_id": "kb_example",
  "job_id": "job_example",
  "created_at": "2026-05-22T12:00:00.000Z"
}
```

## 步骤 4：处理投递失败

如果接收方超时或返回非 2xx，系统会按 retry policy 重试。

| 现象         | 处理                                      |
| ------------ | ----------------------------------------- |
| 一直重试     | 检查 endpoint 是否可达、TLS、响应码和超时 |
| 重复事件     | 使用 event ID 幂等处理                    |
| 消息太晚     | 结合 job 查询接口补偿                     |
| 业务处理失败 | 接收后先入队，异步处理业务逻辑            |

## 步骤 5：运维观察

后台应能查看 Webhook 状态、最近投递记录、失败原因、重试次数和下一次重试时间。

| 指标            | 说明                      |
| --------------- | ------------------------- |
| delivery status | success、failed、retrying |
| response code   | 接收方 HTTP 状态          |
| latency         | 投递耗时                  |
| attempt count   | 当前尝试次数              |
| next retry      | 下一次重试时间            |
| last error      | 最近错误摘要              |

## API 与轮询配合

Webhook 是通知机制。接入方收到事件后，应再调用 API 查询最终状态，并在自己的业务系统里记录处理状态。

```text
Webhook event -> Fetch job/source/version -> Update business cache -> Acknowledge internal workflow
```

## 生产注意事项

- Webhook handler 应快速返回，不要在请求内做长时间模型调用。
- 使用幂等 key，避免重试造成重复处理。
- Webhook URL 中应避免携带密钥明文。
- 监控失败率，连续失败时暂停对应 Webhook 并告警。
- 如果接收方需要执行耗时动作，应先把事件写入自己的队列，再异步执行。
- 对关键业务，Webhook 和定时补偿查询应同时存在，避免单次投递失败造成状态长期不同步。
