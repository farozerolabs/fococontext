# Fork-owned Submissions

## Overview

Forks isolate knowledge additions from end users, team spaces, or business workspaces. They keep the upstream Knowledge Base clean while allowing downstream spaces to add their own evidence.

## Why Forks Exist

A server-side product may be used by many developers and end users. Forks give each customer, workspace, or user a scoped overlay on top of the same upstream Knowledge Base. Canonical knowledge remains stable while each owner can add confirmed private material.

| Scenario                    | Recommended target           |
| --------------------------- | ---------------------------- |
| Shared public dataset       | Upstream Knowledge Base      |
| Customer-specific additions | Customer Fork                |
| End-user personal material  | User Fork                    |
| Temporary experiment        | Experiment Fork, then delete |

## Step 1: Resolve Fork

External applications call the resolve fork API with upstream Knowledge Base ID, owner type, and owner key to get a stable Fork.

The owner key should be generated and stored by your application, such as user ID, team ID, or project ID. Your application remains responsible for the end-user identity system.

## Step 2: Submit Content

A fork-owned submission can contain confirmed text, business-system generated content, or uploaded user material. It still goes through parsing, analysis, generation, merge, indexing, and versioning.

| Field       | Meaning                                               |
| ----------- | ----------------------------------------------------- |
| fork_id     | Target Fork                                           |
| title       | Submission title                                      |
| content     | Body or summary to ingest                             |
| source type | External system, user upload, automation, and similar |
| metadata    | Business ID, labels, source URL                       |

## Step 3: Wait for Completion

The submission returns job data. Your application should poll jobs or listen to webhooks, then expose new retrieval results after completion.

## Step 4: Retrieve with Fork Scope

Pass fork scope during retrieval. The system merges visible upstream knowledge and Fork-owned additions without writing Fork data back to upstream.

| Scope           | Result                                                |
| --------------- | ----------------------------------------------------- |
| upstream only   | Query canonical Knowledge Base only                   |
| fork scope      | Query upstream plus current Fork additions            |
| fork-owned only | Query current Fork content only, useful for debugging |

## Step 5: Delete Fork or Submission

Deleting a Fork should asynchronously clean its sources, pages, indexes, and object storage resources. Upstream Knowledge Base should remain unchanged.

Before deletion:

- Confirm no business user still depends on the Fork.
- Export Fork-owned Markdown if needed.
- Check for running submission jobs.

## Production Notes

- Use stable internal IDs for owner keys and keep plaintext sensitive data out of them.
- Fork scope is a knowledge visibility scope. Your application still validates whether an end user can access a Fork.
- Your application decides how to generate, confirm, and submit Fork content.
