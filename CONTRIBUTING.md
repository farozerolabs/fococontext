# Contributing to FocoContext

Thanks for taking the time to contribute to FocoContext.

FocoContext is a TypeScript workspace for self-hostable, Wiki-first knowledge
infrastructure. Good contributions keep the product reliable, inspectable, and
pleasant to integrate through OpenAPI, the Admin Console, and the SDK.

## Ways to Contribute

- Fix focused bugs in API, worker, retrieval, parser, storage, SDK, or Admin UI.
- Improve OpenAPI behavior, examples, documentation, and developer experience.
- Add parser, OCR, citation, retrieval, graph, or source-evidence improvements.
- Improve self-hosted deployment, Docker Compose templates, runtime checks, and
  configuration docs.
- Report product gaps with concrete reproduction steps and expected behavior.

## Before You Start

1. Search existing issues and discussions to avoid duplicate work.
2. For larger behavior changes, open an issue or proposal first so the scope is
   clear.
3. Keep changes focused. Separate unrelated refactors, formatting-only changes,
   and product behavior changes into different pull requests.
4. Do not commit local secrets, `.env`, `docker-compose.yml`, OpenSpec planning
   artifacts, local benchmark output, or local data-processing directories.

## Branch Workflow

Use `dev` for ordinary source, docs, workflow, and test development. Create
short-lived feature branches from `dev` and open pull requests back to `dev`.

Use `main` as the stable protected branch. Release or stabilization work moves
from `dev` to `main` through a pull request after CI and release-readiness
checks pass. Release tags for Docker images and public documentation should be
cut from stable `main` history.

During private pre-release work, maintainers may push focused internal updates
directly to `dev` when needed. Pull requests remain the normal path for
collaborative work and public contributions.

Urgent hotfixes that enter `main` should be back-merged or cherry-picked into
`dev` so the integration branch keeps the fix.

## Local Development

Install dependencies:

```bash
pnpm install
```

Start the local development stack:

```bash
pnpm run docker:up
```

Start with OCR enabled:

```bash
pnpm run docker:up:ocr
```

Run the documentation site:

```bash
pnpm run docs:dev
```

## Validation

Run the checks that match your change:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

For a full local pass:

```bash
pnpm run verify
```

For Compose template changes:

```bash
docker compose -f docker-compose.example.yml config --quiet
docker compose -f docker-compose.dev.example.yml config --quiet
```

## Pull Request Checklist

- The change is scoped to one clear purpose.
- Ordinary development PRs target `dev`; release or stabilization PRs target
  `main`.
- Public README, docs-site pages, OpenAPI docs, and SDK examples match behavior
  when the change affects developer-facing contracts.
- Runtime configuration changes are reflected in `.env.example` and deployment
  docs.
- Database, Docker, storage, queue, parser, retrieval, and Admin UI changes have
  relevant validation.
- Security-sensitive changes preserve tenant isolation, API-key enforcement,
  source evidence boundaries, and secret masking.
- The PR description explains user impact, developer impact, validation run, and
  any remaining risks.

## Documentation

Documentation lives in the VitePress docs site under `apps/docs-site/docs`.
Keep English and Simplified Chinese pages aligned when the user-facing behavior
changes.

README files should stay concise. Put detailed setup, API, operations, and
troubleshooting material in the docs site.

## Security

Do not report security issues through public issues or discussions. Follow
[SECURITY.md](SECURITY.md).

## 中文说明

感谢你为 FocoContext 贡献。

贡献前请先搜索已有 issue 和 discussion。较大的行为变更建议先开 issue 或
proposal，把目标、影响范围和验收方式说清楚。

提交 PR 时请保持变更聚焦，不要混入无关重构、格式化或本地数据处理结果。
不要提交 `.env`、`docker-compose.yml`、OpenSpec 规划文件、本地 benchmark 输
出、私有数据目录或任何真实密钥。

日常开发 PR 以 `dev` 为目标；发布或稳定化 PR 以 `main` 为目标。`main` 是受
保护的稳定分支，用于 release tag、Docker 镜像发布和公开文档快照。私有预发布
阶段，maintainer 可以在需要时将聚焦的内部更新直接推送到 `dev`；协作开发和公开
贡献默认通过 PR 进行。紧急修复进入 `main` 后，需要回合并或 cherry-pick 到
`dev`。

常用验证命令：

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run verify
```

如果改动了公开 API、SDK、管理后台或文档，请同步更新对应 README、docs-site
页面、OpenAPI 文档和示例。安全问题请按 [SECURITY.md](SECURITY.md) 处理。
