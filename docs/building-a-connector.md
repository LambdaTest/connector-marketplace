# Building a connector

This guide is for developers building a connector that works with TestMu AI (formerly LambdaTest): a coding-agent skill, a CI step, an IDE extension, an agent-testing tool or an AI agent that needs a browser.
This is step 1. When your connector works, go to [step 2: List your connector](../CONTRIBUTING.md).

Your connector runs on your side and talks to our platform **with the end user's own TestMu AI account**.
The marketplace only lists it; it never sits between your connector and our platform.

```
User ──installs──▶ Your connector
                        │  user's TestMu AI credentials
                        ▼
              TestMu AI platform
              ├─ Kane CLI        AI tests of web and mobile apps
              ├─ Rook CLI        tests agents that take actions
              ├─ Agent Testing   agents that test chat, voice and phone agents
              ├─ Browser Cloud   cloud browsers for AI agents
              └─ Also            REST APIs, test grid, MCP server, webhooks
```

## Choose how to connect

We most want connectors for the first three rows.

| You're building | Use | Listing `products` |
|---|---|---|
| A coding-agent skill, IDE extension or CI step that tests a web or mobile app | [Kane CLI](#kane-cli) | `kaneai` |
| A tool or pipeline step that tests AI agents that take actions | [Rook](#rook) | `agent-assurance` |
| A tool that tests chat, voice or phone agents | [Agent Testing CLI](#agent-to-agent-testing) | `agent-testing` |
| An AI agent or agent framework that needs a real browser | [Browser Cloud](#browser-cloud) | `browser-cloud` |
| A CI plugin that runs existing Selenium or Appium tests | [Test grid](#test-grid) | `automation-cloud`, `real-device-cloud` |
| An app that reads or creates test data (Jira, dashboards) | [REST APIs](#rest-apis) | the product you call |
| An MCP client or AI assistant | [MCP server](#mcp-server) | the products you use |
| An app that reacts when tests finish (Slack, Teams, alerting) | [Webhooks](#webhooks) | the product you watch |

Every option signs in with the user's own account: see [Authentication](#authentication).

## Kane CLI and Rook

Both are command-line tools your connector can wrap. Ask users to install the CLI themselves, then call it from your skill, extension or CI step and read its JSON output. Pin the CLI version you tested with.

### Kane CLI

[Kane CLI](https://www.testmuai.com/support/docs/kane-cli-getting-started/) runs a test written as a plain-English objective in a real browser, and reports what happened.

```bash
npm install -g @testmuai/kane-cli
kane-cli login          # OAuth in the browser; or --username and --access-key
kane-cli whoami
```

Run it in **agent mode** from your connector: `--agent` swaps the terminal UI for machine-readable output, and `--headless` avoids display errors in CI and agents.

```bash
kane-cli run "Verify the checkout flow completes successfully" \
  --url https://myapp.example \
  --agent --headless 2>/dev/null | tail -1 | jq -r '.status'
```

- **Output:** one JSON event per line on stdout; logs go to stderr. The last line is always the `run_end` event, with `status` (`passed` or `failed`), `summary`, `reason` on failure, `test_url` (the dashboard link to show your user), `run_dir` and `session_dir` (logs and screenshots).
- **Exit codes:** `0` passed, `1` failed, `2` error (for example a failed sign-in), `3` timeout or cancelled.
- **No questions in CI:** Kane CLI can ask the user a question mid-run, but not when stdin isn't a terminal. Write objectives that need no answers.
- **In CI:** pass `--username` and `--access-key` from the CI secret store.

See [Agent mode](https://www.testmuai.com/support/docs/kane-cli-agent-mode/) and [CI/CD integration](https://www.testmuai.com/support/docs/kane-cli-cicd/).

### Rook

[Rook](https://www.testmuai.com/support/docs/rook-installation/) is the CLI for Agent Assurance. It tests agents that take actions: it reads the agent's code or spec, writes scenarios, runs the agent and judges each criterion from recorded evidence as Pass, Fail or Unable to Verify. Source and release notes: [LambdaTest/rook](https://github.com/LambdaTest/rook).

```bash
npm install -g @testmuai/rook@latest     # Node 20+; or: brew install lambdatest/rook/rook
rook doctor
```

Rook reaches the agent under test through a **profile**: an HTTP call (curl), a command (such as `claude -p`) or an MCP tool over stdio. A profile must return enough evidence, such as tool calls, state and files, or most criteria come back Unable to Verify.

In CI, set `LT_USERNAME` and `LT_ACCESS_KEY` from the secret store, then run the reviewed scenarios:

```bash
rook project use <project-id>
rook agent use <agent-id>
rook profile use staging
rook run --only SC-001,SC-004 --profile staging --concurrency 1 \
  --allow '<exact rule you reviewed locally>' --json > rook-run.json
```

- **Gate on the JSON, not the exit code.** A zero exit doesn't mean the agent passed. Require `ok: true`, `halted: false`, and `report.totals` with `failed`, `unverifiable`, `unjudged`, `not_run` and `unrunnable` all `0`.
- **Rook doesn't sandbox or roll back the agent it tests.** Point it at a staging agent, and say so in your setup docs.
- Headless runs refuse any action no `--allow` rule covers, so never pass a blanket rule.

See [CI/CD](https://www.testmuai.com/support/docs/agent-assurance-ci-cd/) and [Permissions and safety](https://www.testmuai.com/support/docs/rook-permissions-and-safety/).

## Agent-to-agent testing

[Agent Testing](https://www.testmuai.com/support/docs/agent-testing-cli/) uses AI agents to test your chat, voice and phone agents: it holds multi-turn conversations from generated scenarios and scores each one. The user sets up the agent, scenarios and suites in TestMu AI; your connector starts runs and reads results with the Agent Testing CLI (Python 3.10+).

```bash
pip install agent-testing-cli
agent-testing-cli login                  # or set LT_USERNAME and LT_ACCESS_KEY

agent-testing-cli --project "$TESTMU_PROJECT_ID" --json run \
  --workflow "$TESTMU_WORKFLOW_ID" \
  --suite "$TESTMU_SUITE_ID" \
  --yes
agent-testing-cli --project "$TESTMU_PROJECT_ID" --json results --suite "$TESTMU_SUITE_ID"
```

- **Chat runs finish later.** Don't add `--wait` to a chat evaluation; fetch the results afterwards.
- **Phone caller runs make real calls.** Make that clear to your users before you start one.
- **Exit codes:** `0` success, `1` a test failed, `2` invalid input, `3` sign-in failed, `4` API error, `5` timed out.

If your own agent speaks the A2A protocol, it can also be listed here as an agent: see `type: agent` in [step 2](../CONTRIBUTING.md).

## Browser

### Browser Cloud

[Browser Cloud](https://www.testmuai.com/support/docs/connect-to-session/) gives an AI agent a real cloud browser, driven through Puppeteer, Playwright or Selenium.

```ts
import { Browser } from '@testmuai/browser-cloud';

const client = new Browser();
const session = await client.sessions.create({
  adapter: 'playwright',             // or 'puppeteer', 'selenium'
  lambdatestOptions: {
    build: 'Acme Agent',
    name: 'Book a flight',
    'LT:Options': { username: process.env.LT_USERNAME, accessKey: process.env.LT_ACCESS_KEY },
  },
});

const { browser, page } = await client.playwright.connect(session);
await page.goto('https://example.com');
await browser.close();
await client.sessions.release(session.id);   // sessions stay open until released or timed out
```

Show your user `session.sessionViewerUrl` so they can watch or replay what the agent did. Set `tunnel: true` to reach a site on `localhost`.
For agents that use skills rather than code, see [AI agent skills](https://www.testmuai.com/support/docs/browser-cloud-skills/).

### Test grid

CI plugins and IDE extensions that run existing Selenium or Appium tests point them at our hub:

| Grid | URL |
|---|---|
| Web browsers | `https://hub.lambdatest.com/wd/hub` |
| Mobile (real and virtual devices) | `https://mobile-hub.lambdatest.com/wd/hub` |

Set the `build` and `name` capabilities so runs are easy to find in the dashboard, and use `customData` to link a run to your tool (for example a Jira issue key): see [Add test metadata](https://www.testmuai.com/support/docs/selenium-add-test-meta-data/).
For apps behind a firewall or on `localhost`, the user needs the [TestMu AI Tunnel](https://www.testmuai.com/support/docs/advanced-tunnel-features/).

## Authentication

### Username and access key

Kane CLI, Rook, the Agent Testing CLI, Browser Cloud, the grid and the REST APIs all accept the user's TestMu AI **username and access key**.
Users find both in their account settings: see [How to get my username and access key](https://www.testmuai.com/support/docs/hyperexecute-how-to-get-my-username-and-access-key/).
Read them from `LT_USERNAME` and `LT_ACCESS_KEY`, the names our docs and CLIs already use, so users can reuse their existing CI secrets.

Rules for handling keys:

- **Ask users for their own key.** Never ship a shared key in your connector.
- **Store keys encrypted**, and never log them, put them in URLs or command lines that get logged, or show them again after setup.
- **Recommend service accounts for CI.** An admin creates one under **Settings → Organization Settings → Members → Service Accounts**, so a pipeline doesn't use a person's key. See [Service accounts](https://www.testmuai.com/support/docs/service-accounts/).
- **Handle expiry.** Organizations can set access keys to expire (see [Password and access key expiration policy](https://www.testmuai.com/support/docs/password-and-access-key-expiration-policy/)). On `401`, or a CLI's sign-in exit code, ask the user to reconnect instead of retrying.

### OAuth (MCP server)

The MCP server uses OAuth 2.0. MCP clients discover it automatically:

| Endpoint | URL |
|---|---|
| Protected resource metadata | `https://mcp.lambdatest.com/.well-known/oauth-protected-resource` |
| Authorization server metadata | `https://mcp.lambdatest.com/.well-known/oauth-authorization-server` |
| Authorize | `https://accounts.lambdatest.com/oauth2` |
| Token | `https://auth.lambdatest.com/oauth2/token` |
| Dynamic client registration | `https://auth.lambdatest.com/oauth2/register` |

It supports the authorization code flow with PKCE (`S256`), refresh tokens and dynamic client registration, so most MCP clients need no client ID set up in advance.

### Regions

Accounts on our EU data center use the `eu-` hosts (for example `eu-api.lambdatest.com`). If your connector serves EU customers, let the user pick the region, or try the EU host when the US host returns `401`.

## Other ways to connect

### REST APIs

All REST APIs accept **HTTP Basic auth** with the username and access key. Test Manager and Analytics also accept a bearer token.

```bash
curl -u "$LT_USERNAME:$LT_ACCESS_KEY" \
  "https://api.lambdatest.com/automation/api/v1/builds?limit=5"
```

| Product | Base URL (US) | EU |
|---|---|---|
| Web automation (Selenium) | `https://api.lambdatest.com/automation/api/v1` (also `/v2`) | `eu-api.lambdatest.com` |
| Cypress | `https://api.lambdatest.com/automation/api/v1/cypress` | `eu-api.lambdatest.com` |
| App automation (real devices) | `https://mobile-api.lambdatest.com/mobile-automation/api/v1` | `eu-mobile-api.lambdatest.com` |
| App upload and manual testing | `https://manual-api.lambdatest.com` | `eu-manual-api.lambdatest.com` |
| Automated screenshots | `https://api.lambdatest.com/screenshots/v1` | `eu-api.lambdatest.com` |
| SmartUI | `https://api.lambdatest.com/automation/smart-ui` | `eu-api.lambdatest.com` |
| Test Manager | `https://test-manager-api.lambdatest.com` | `eu-test-manager-api.lambdatest.com` |
| HyperExecute | `https://api.hyperexecute.cloud` | — |
| Accessibility | `https://api.lambdatest.com/accessibility` | `eu-api.lambdatest.com` |
| Analytics | `https://api.lambdatest.com/insights/api/v3/public` | `eu-api.lambdatest.com` |
| User management | `https://auth.lambdatest.com` | `eu-auth.lambdatest.com` |

Full reference:

- [API reference](https://www.lambdatest.com/support/api-doc/), browsable by product
- [OpenAPI specs](https://www.testmuai.com/support/docs/OpenAPI.md): all 12 specs in one file, to generate a client
- [Docs index for AI agents](https://www.testmuai.com/support/docs/llms.txt): every docs page as Markdown

Good practice:

- Send a `User-Agent` that names your connector and version, such as `acme-test-hub/1.4.0`. It helps us debug problems your users report.
- On `429`, back off and retry. Don't poll faster than you need to; use [webhooks](#webhooks) where you can.

Other CLIs you can wrap the same way as Kane CLI: HyperExecute CLI and SmartUI CLI.

### MCP server

For AI assistants, connect to our remote MCP server instead of calling REST APIs yourself.

- **URL:** `https://mcp.lambdatest.com/mcp` (streamable HTTP)
- **Auth:** [OAuth](#oauth-mcp-server). The user signs in with their TestMu AI account on first use.

```json
{
  "mcpServers": {
    "testmu-ai": { "url": "https://mcp.lambdatest.com/mcp" }
  }
}
```

It has tools for HyperExecute, web automation, native app automation, SmartUI, Accessibility and Test Manager.
See [TestMu AI MCP Server](https://www.testmuai.com/support/docs/testmu-mcp-server/) for the tools and per-client setup.

**Building your own MCP server** on top of our APIs or CLIs? Then you're a normal connector: follow the [authentication](#authentication) rules above, and in your listing use `type: mcp-server`.

### Webhooks

We send a `POST` to a URL the user configures when a build or job finishes. The user adds your URL in **Settings → Integrations → Communication → Webhooks**, and picks which events to receive:

- Build completion
- Test failed / test passed
- Agent testing notifications
- HyperExecute job completion

The payload has the build status and results, test details, timestamps and metadata. Use the IDs in it to call the REST APIs for anything more.
See [Webhooks integration](https://www.testmuai.com/support/docs/webhooks-integration/).

Your setup docs should tell users exactly which URL to paste and which events to turn on.

## Before you list it

Check that your connector and your listing agree:

| Your connector | In `listing.yaml` |
|---|---|
| Products it uses | `products`, for example `[kaneai]`, `[agent-assurance]`, `[agent-testing]` or `[browser-cloud]` |
| How users sign in | `install.auth`: `basic` or `api-key` for username + access key, `oauth` for Kane CLI login or the MCP server |
| How it connects | `protocols`: for example `stdio`, `rest`, `a2a`, `streamable-http` or `webhook` |
| Env variables it reads | `install.env`, names only, such as `LT_USERNAME` and `LT_ACCESS_KEY` |
| Setup page with our product | `integration.docs_url` |

Before you open the PR:

- [ ] Works with a fresh TestMu AI account, from your public setup docs alone
- [ ] Pins the version of any CLI it wraps (Kane CLI, Rook, Agent Testing CLI)
- [ ] Handles a wrong or expired key (`401`, or the CLI's sign-in exit code) with a clear message
- [ ] Works for EU accounts, or your docs say it doesn't
- [ ] No access key in logs, URLs, command lines, screenshots or your repo
- [ ] Reviewers can test it: say how in your PR, and send any test account privately, never in the PR

## Getting help

- Questions about building a connector: open an issue in this repo
- Questions about a product or API: [TestMu AI support](https://www.testmuai.com/support/)
- A security problem in our APIs: report it privately, never in a public issue
