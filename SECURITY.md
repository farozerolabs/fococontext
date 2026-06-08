# Security Policy

## Supported Versions

FocoContext is in active early development. Security fixes are prioritized for
the current `main` branch and the latest published release tag when releases are
available.

## Reporting a Vulnerability

Please do not open a public issue, discussion, or pull request with exploit
details.

Use GitHub Private Vulnerability Reporting:

1. Open the repository on GitHub.
2. Go to `Security` -> `Advisories`.
3. Select `Report a vulnerability`.

Include as much of the following as possible:

- Affected version, release tag, or commit.
- Impact and affected component.
- Reproduction steps.
- Relevant logs, screenshots, API requests, or configuration snippets.
- Whether credentials, tenant data, source documents, generated Wiki content,
  object storage data, or API keys may be exposed.
- Any known mitigation or workaround.

## Handling Sensitive Material

- Do not include real provider API keys, database passwords, object storage
  credentials, webhook secrets, user data, or private documents in public
  channels.
- Redact secrets from logs and screenshots.
- Share minimal reproduction material whenever possible.

## 中文说明

请不要在公开 issue、discussion 或 pull request 中披露漏洞利用细节。

请通过仓库的 `Security` -> `Advisories` -> `Report a vulnerability`
提交安全问题。

报告中建议包含：受影响版本或 commit、影响范围、复现步骤、相关日志或截图、
涉及的凭证或租户数据风险，以及已知缓解方式。提交前请移除真实密钥、用户数
据、私有文档和其他敏感内容。
