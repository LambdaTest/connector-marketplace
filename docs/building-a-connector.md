# Building a connector

This guide is for developers building a connector that works with TestMu AI (formerly LambdaTest): a Jira or Slack app, a CI plugin, an IDE extension, an MCP server or an AI agent.
This is step 1. When your connector works, go to [step 2: List your connector](../CONTRIBUTING.md).

Your connector runs on your side and talks to our platform **with the end user's own TestMu AI account**.
The marketplace only lists it; it never sits between your connector and our platform.

```
User ──installs──▶ Your connector
                        │  user's TestMu AI credentials
                        ▼
              TestMu AI platform
              ├─ REST APIs      builds, sessions, Test Manager, SmartUI, HyperExecute, Accessibility, Analytics
              ├─ Grid           Selenium / Appium hub for running tests
              ├─ MCP server     https://mcp.lambdatest.com/mcp, for AI agents
              └─ Webhooks       we POST to your endpoint when a build or job completes
```

## Choose how to connect

| You're building | Use | Auth |
|---|---|---|
| An app that reads or creates test data (Jira, Linear, dashboards) | [REST APIs](#rest-apis) | Username + access key |
| A CI plugin, GitHub Action or IDE extension that runs tests | [Grid](#running-tests-on-the-grid) or a CLI | Username + access key, from CI secrets |
| An AI agent or MCP client | [MCP server](#mcp-server) | OAuth |
| An app that reacts when tests finish (Slack, Teams, alerting) | [Webhooks](#webhooks), plus REST APIs for details | Webhook URL set by the user |

Most connectors combine two: for example a Slack app that receives a webhook, then calls the REST API for failed tests.

## Authentication

### Username and access key (REST APIs, grid, CLIs)

All REST APIs accept **HTTP Basic auth**, with the user's TestMu AI username as the user and their access key as the password.
Users find both in their account settings: see [How to get my username and access key](https://www.testmuai.com/support/docs/hyperexecute-how-to-get-my-username-and-access-key/).

```bash
curl -u "$LT_USERNAME:$LT_ACCESS_KEY" \
  "https://api.lambdatest.com/automation/api/v1/builds?limit=5"
```

Rules for handling keys:

- **Ask users for their own key.** Never ship a shared key in your connector.
- **Store keys encrypted**, and never log them, put them in URLs or show them again after setup.
- **Recommend service accounts for CI.** An admin creates one under **Settings → Organization Settings → Members → Service Accounts**, so a pipeline doesn't use a person's key. See [Service accounts](https://www.testmuai.com/support/docs/service-accounts/).
- **Handle expiry.** Organizations can set access keys to expire (see [Password and access key expiration policy](https://www.testmuai.com/support/docs/password-and-access-key-expiration-policy/)). On `401`, ask the user to reconnect instead of retrying.

Test Manager and Analytics also accept a bearer token.

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

## REST APIs

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

## Running tests on the grid

CI plugins and IDE extensions run tests by pointing Selenium or Appium at our hub:

| Grid | URL |
|---|---|
| Web browsers | `https://hub.lambdatest.com/wd/hub` |
| Mobile (real and virtual devices) | `https://mobile-hub.lambdatest.com/wd/hub` |

Read credentials from `LT_USERNAME` and `LT_ACCESS_KEY`, the names our docs and CLIs already use, so users can reuse their existing CI secrets.
Set the `build` and `name` capabilities so runs are easy to find in the dashboard, and use `customData` to link a run to your tool (for example a Jira issue key): see [Add test metadata](https://www.testmuai.com/support/docs/selenium-add-test-meta-data/).

For apps behind a firewall or on `localhost`, the user needs the [TestMu AI Tunnel](https://www.testmuai.com/support/docs/advanced-tunnel-features/).

Instead of the grid, you can also wrap one of our CLIs: HyperExecute CLI, SmartUI CLI or [Kane CLI](https://github.com/LambdaTest/kane-cli).

## MCP server

For AI agents, connect to our remote MCP server instead of calling REST APIs yourself.

- **URL:** `https://mcp.lambdatest.com/mcp` (streamable HTTP)
- **Auth:** OAuth, as above. The user signs in with their TestMu AI account on first use.

```json
{
  "mcpServers": {
    "testmu-ai": { "url": "https://mcp.lambdatest.com/mcp" }
  }
}
```

It has tools for HyperExecute, web automation, native app automation, SmartUI, Accessibility and Test Manager.
See [TestMu AI MCP Server](https://www.testmuai.com/support/docs/testmu-mcp-server/) for the tools and per-client setup.

**Building your own MCP server** on top of our REST APIs? Then you're a normal API connector: follow the [authentication](#authentication) rules above, and in your listing use `type: mcp-server`.

## Webhooks

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
| Products it calls | `products`, for example `[hyperexecute, test-manager]` |
| How users sign in | `install.auth`: `basic` or `api-key` for username + access key, `oauth` for the MCP server |
| How it connects | `protocols`: `rest`, `webhook`, `streamable-http` or `stdio` |
| Env variables it reads | `install.env`, names only, such as `LT_USERNAME` and `LT_ACCESS_KEY` |
| Setup page with our product | `integration.docs_url` |

Before you open the PR:

- [ ] Works with a fresh TestMu AI account, from your public setup docs alone
- [ ] Handles `401` (wrong or expired key) with a clear message
- [ ] Works for EU accounts, or your docs say it doesn't
- [ ] No access key in logs, URLs, screenshots or your repo
- [ ] Reviewers can test it: say how in your PR, and send any test account privately, never in the PR

## Getting help

- Questions about building a connector: open an issue in this repo
- Questions about an API: [TestMu AI support](https://www.testmuai.com/support/)
- A security problem in our APIs: report it privately, never in a public issue
