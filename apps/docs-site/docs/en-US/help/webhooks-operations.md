# Webhooks and Operations

## Overview

Webhooks notify external systems about ingest, failure, deletion cleanup, Source Watch scans, and version changes. They reduce polling and work best with final-state API queries.

## Step 1: Choose Events

| Event                       | Trigger                       | Typical use                                 |
| --------------------------- | ----------------------------- | ------------------------------------------- |
| job.completed               | Ingest job completed          | Refresh business cache and enable retrieval |
| job.failed                  | Ingest job failed             | Notify operators or trigger retry policy    |
| source.deleted              | Source enters deletion flow   | Clean business-side references              |
| cleanup.completed           | Async cleanup completed       | Update storage stats or audit records       |
| source_watch.scan_completed | Scan completed                | Display synchronization state               |
| version.created             | New knowledge version created | Record business-side knowledge version      |

## Step 2: Create Webhook

Create a webhook from Admin or OpenAPI. Key fields:

| Field        | Meaning                                |
| ------------ | -------------------------------------- |
| name         | Webhook display name                   |
| endpoint URL | HTTPS receiver URL                     |
| events       | Event types to subscribe to            |
| secret       | Secret used for signature verification |
| enabled      | Whether delivery is active             |
| retry policy | Retry count and backoff strategy       |

Use HTTPS in production and restrict receivers to trusted networks or gateways where possible.

## Step 3: Verify Signature

Receivers should verify signature and timestamp to prevent forged requests. Recommended sequence:

1. Read raw request body.
2. Verify signature header.
3. Verify timestamp tolerance.
4. Deduplicate by event ID.
5. Return 2xx when accepted.

## Step 4: Handle Delivery Failure

If the receiver times out or returns non-2xx, the system retries according to retry policy.

| Symptom                 | Action                                                        |
| ----------------------- | ------------------------------------------------------------- |
| Keeps retrying          | Check endpoint reachability, TLS, status code, and timeout    |
| Duplicate events        | Process idempotently with event ID                            |
| Late event              | Reconcile by calling job query API                            |
| Business handling fails | Acknowledge quickly and process business logic asynchronously |

## Step 5: Observe Operations

Admin should show webhook state, recent deliveries, failure reason, attempt count, and next retry time.

| Metric          | Meaning                   |
| --------------- | ------------------------- |
| delivery status | success, failed, retrying |
| response code   | Receiver HTTP status      |
| latency         | Delivery duration         |
| attempt count   | Current attempt count     |
| next retry      | Next retry time           |
| last error      | Recent error summary      |

## Use API with Webhooks

Webhooks are notifications. After receiving an event, query final state through API and let your business workflow record its own processing state.

```text
Webhook event -> Fetch job/source/version -> Update business cache -> Acknowledge internal workflow
```

## Production Notes

- Webhook handlers should return quickly and avoid long model calls inside the request.
- Use idempotency keys to avoid duplicate processing.
- Keep secrets out of webhook URLs.
- Monitor failure rate. Pause and alert when deliveries fail continuously.
