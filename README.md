# PR Performance Reviewer Action

A JavaScript GitHub Action for Marketplace that reviews pull requests for high-impact performance issues and posts inline comments on the PR.

## What it does

- Runs on pull requests.
- Detects supported languages from changed file extensions: **JavaScript, TypeScript, SQL, C#**.
- Calls Copilot/GitHub Models **only when supported languages are present**.
- Uses language-specific performance prompts:
  - JavaScript/TypeScript: React and Web Components checks.
  - C#: EF and NHibernate checks.
- Focuses on meaningful performance issues:
  - Big-O complexity and growth impact.
  - Common anti-patterns with practical severity.
- Posts inline comments on changed lines, preferring method/function/class definition lines for symbol-level findings.
- Posts nothing when no worthwhile suggestions are found.

## Inputs

| Name                    | Required | Default                                               | Description                                                        |
| ----------------------- | -------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `github-token`          | Yes      | n/a                                                   | Token used for GitHub API calls and Copilot/GitHub Models requests |
| `model`                 | No       | `openai/gpt-4.1`                                      | Model identifier                                                   |
| `copilot-api-url`       | No       | `https://models.github.ai/inference/chat/completions` | Chat completions endpoint                                          |
| `min-severity`          | No       | `medium`                                              | `low\|medium\|high\|critical`                                      |
| `min-confidence`        | No       | `high`                                                | `low\|medium\|high`                                                |
| `min-impact-score`      | No       | `3`                                                   | Integer 1-5                                                        |
| `max-findings-per-file` | No       | `3`                                                   | Cap findings per file                                              |
| `review-summary`        | No       | Built-in default                                      | Review summary text                                                |

## Outputs

| Name                       | Description                         |
| -------------------------- | ----------------------------------- |
| `supported-files-detected` | Number of supported files in the PR |
| `analyzed-files`           | Number of files analyzed by Copilot |
| `comments-posted`          | Number of inline comments submitted |
| `skipped-reason`           | Skip reason, if nothing was posted  |

## Usage

### Marketplace usage

```yaml
name: performance-review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write
  models: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: andy-c-jones/copilot-performance@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Use this action within this same repository

`dist/` is committed, so no `npm run build` step is required in the workflow.

```yaml
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Development

```bash
npm ci
npm run lint
npm run format:check
npm run coverage
npm run build
```

If the token cannot access the configured model, the action now exits successfully with `skipped-reason=model_access_denied` and a warning message, instead of failing the workflow.

## Marketplace publishing note

This is a JavaScript action (`runs.using: node20`) and must ship compiled output in `dist/index.js`.
Before tagging a release, run `npm run check` and commit the updated `dist/` artifacts.

## Architecture

- `src/application`: orchestration, prompt building, line targeting.
- `src/domain`: language detection, filtering, diff and symbol utilities.
- `src/infrastructure`: GitHub API adapter and Copilot/GitHub Models adapter.
- `test`: unit tests with fake infrastructure collaborators.
