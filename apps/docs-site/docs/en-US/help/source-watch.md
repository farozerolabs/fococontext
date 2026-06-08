# Source Watch

## Overview

Source Watch keeps external locations synchronized with a Knowledge Base. It is useful for long-running document directories, S3 prefixes, URL lists, and Git repositories.

## Step 1: Choose Source Type

| Type              | Meaning                                          | Production guidance                                                         |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| Mounted directory | Scans a directory mounted into the API container | Mount it explicitly with Docker volumes                                     |
| S3                | Scans a user-provided bucket and prefix          | Use credentials for that data source, not system object storage credentials |
| URL list          | Fetches a fixed list of URLs periodically        | Restrict domains, size, and timeout                                         |
| Git repository    | Scans document paths in a repository             | Use read-only tokens or public repositories                                 |

If the current deployment enables only mounted directories, create mounted directory rules first. The default container path is `/source-watch`; create rules with that path or a child path. Enable other types after backend config and security policy are ready.

## Step 2: Create a Rule

Create a rule from Sources or Source Watch. Key fields:

| Field              | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| Name               | Rule display name                                          |
| Knowledge Base     | Target Knowledge Base                                      |
| Source type        | mounted directory, S3, URL list, Git repository            |
| Location           | Directory path, bucket prefix, URL list, or repository URL |
| include extensions | Allowed extensions such as `.md,.pdf,.docx`                |
| exclude globs      | Excluded paths such as `**/node_modules/**`                |
| max file size      | Per-file size limit                                        |
| schedule           | Scheduled scan expression or interval                      |
| auto ingest        | Whether to ingest new or changed items automatically       |

## Step 3: Run Manual Scan First

After creation, run a manual scan before enabling schedules.

Check that:

1. Rule status is successful.
2. discovered, created, changed, skipped, and failed counts match expectations.
3. Created Source IDs and Job IDs appear in Sources and Jobs.
4. skipped reasons are acceptable.
5. The rule scanned only intended directories.

## Step 4: Read Scan History

Scan history is the operational view for Source Watch.

| Field              | Meaning                                            |
| ------------------ | -------------------------------------------------- |
| started / finished | Start and finish time                              |
| status             | success, partial, failed                           |
| discovered count   | Candidate items found                              |
| changed count      | New or changed items                               |
| delete candidates  | External items that disappeared                    |
| skipped count      | Items skipped by extension, size, or exclude rules |
| error summary      | Auth, network, permission, or pre-parse errors     |

Delete candidates enter the source deletion lifecycle and impact preview before cleanup.

## Step 5: Enable Scheduled Scans

Enable schedules after manual scan is stable. In production:

- Scan low-frequency sources daily or hourly.
- Use narrower paths or prefixes for high-frequency sources.
- Restrict include extensions for large repositories.
- Set reasonable timeouts for Git and URL rules.
- Disable auto ingest when model cost is sensitive and inspect results first.

## Troubleshooting

| Symptom                          | Check                                                                 |
| -------------------------------- | --------------------------------------------------------------------- |
| Mounted directory finds no files | Docker volume, container path, and permissions                        |
| S3 scan fails                    | Data-source credentials, bucket, region, endpoint, prefix permissions |
| URL items are skipped            | URL safety policy, MIME, size limit, request timeout                  |
| Git auth fails                   | token permission, repository URL, branch, path filter                 |
| Scan creates duplicates          | Stability of content hash and external locator                        |

## Production Notes

- Source Watch credentials belong to the scanned data source. Do not reuse system S3 storage credentials.
- Keep rule scope narrow. Avoid scanning whole server directories or huge buckets.
- Watch Worker concurrency so scheduled scans leave capacity for manual uploads.
- Disabling a rule stops future scans. Already ingested sources remain until the normal source deletion flow runs.
