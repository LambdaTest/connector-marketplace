# Contributing guide

Anyone who builds a connector for our products can list it in the marketplace. The whole process is one pull request (PR) on this repo: you add a short YAML file and a logo, automated checks review it in minutes, and a maintainer approves it.

This is step 2. Haven't built your connector yet? Start with [step 1: Build your connector](docs/building-a-connector.md): our REST APIs, MCP server, grid, webhooks and how to authenticate.

## What we accept

We only list connectors that **work with at least one of our products**: the `products` list in [`taxonomy.yaml`](taxonomy.yaml) (for example HyperExecute, SmartUI, KaneAI or Test Manager).
A general-purpose tool that doesn't use any of our products is not accepted, even if it's useful for development or testing.

Good fits:

- A Jira app that creates Test Manager test cases from stories and runs them on HyperExecute
- A Slack app that posts HyperExecute results and reruns failed jobs
- A CI plugin (Azure DevOps, Jenkins, GitHub Actions) that runs tests on our cloud grid
- An IDE extension that runs the current test on a cloud browser or real device
- An MCP server that lets AI agents use KaneAI or our real devices

Not accepted:

- A generic Jira, GitHub or Slack connector that never calls our products
- A connector you aren't allowed to list for its vendor
- A listing whose links or endpoint don't work

## Before you start

You need:

- A GitHub account
- A working connector, with public setup docs that show how to use it with our product (see [step 1: Build your connector](docs/building-a-connector.md))
- A privacy policy that covers the data the connector handles
- A support email or page where a person answers
- A square logo (SVG, or PNG at least 128×128 px), at most 100 KB
- Node.js 20 or newer, to run the checks on your machine

## Fork the repo and create a branch

```bash
# Fork on GitHub first, then:
git clone https://github.com/<your-account>/connector-marketplace.git
cd connector-marketplace
git checkout -b add-<your-id>
npm ci
```

## Add your listing and logo

Add exactly two files:

```
listings/<your-id>.yaml
logos/<your-id>.svg      (or .png)
```

The quickest start is to copy the example closest to your connector from [`examples/listings/`](examples/listings/):

| Your connector | Copy |
| --- | --- |
| App for a work-tracking tool (Jira, Linear) | `acme-jira-testing.yaml` |
| Chat or notification app (Slack, Teams) | `northwind-slack-alerts.yaml` |
| CI/CD plugin or pipeline task | `fabrikam-azure-devops.yaml` |
| GitHub Action or PR check | `tailspin-github-action.yaml` |
| IDE extension | `contoso-vscode.yaml` |
| Design-tool plugin | `wingtip-figma.yaml` |
| MCP server for AI agents | `adventure-works-qa-mcp.yaml` |

### A complete listing

```yaml
id: acme-jira-testing
name: Test Hub for Jira
summary: Plan, run and track tests on our platform without leaving Jira.
vendor:
  name: Acme Apps
  url: https://acme-apps.example
  github: acme-apps
products:
  - test-manager
  - kaneai
  - hyperexecute
integration:
  platform: Jira
  summary: Links Jira issues to Test Manager test cases, generates tests from stories with KaneAI, runs them on HyperExecute and files failures back as Jira bugs.
  docs_url: https://acme-apps.example/docs/test-hub/setup
  capabilities:
    - Generate test cases from a Jira story with KaneAI
    - Run a test suite on HyperExecute from a Jira issue
    - Create Jira bugs from failed tests, with logs and video
type: plugin
stages:
  - requirements
  - test-planning
  - test-execution
  - defect-triage
protocols:
  - rest
  - webhook
install:
  url: https://marketplace.atlassian.com/apps/0000000/test-hub-for-jira
  auth: oauth
docs_url: https://acme-apps.example/docs/test-hub
privacy_url: https://acme-apps.example/privacy
support:
  email: support@acme-apps.example
logo: logos/acme-jira-testing.svg
badge: community
```

### Field reference

Values marked *taxonomy* must be ids from [`taxonomy.yaml`](taxonomy.yaml). If nothing fits, open an issue rather than picking something close.

| Field | Required | What to put |
| --- | --- | --- |
| `id` | Yes | Lowercase kebab-case, 3–64 characters, same as the file name. It can't change later. |
| `name` | Yes | Display name, 2–60 characters |
| `summary` | No, recommended | One line for the card, 10–160 characters. Cards show 2 lines. |
| `vendor.name`, `vendor.url` | Yes | Your company name and https website |
| `vendor.github` | No | Your GitHub org. Reviews from its public members don't count toward ratings. |
| `products` | Yes | *taxonomy*: at least one of our products the connector works with |
| `integration.summary` | Yes | What a user can do with our product through it, 20–300 characters |
| `integration.docs_url` | Yes | Page that shows setup with our product |
| `integration.platform` | No | The other tool it connects, such as `Jira` or `Slack` |
| `integration.capabilities` | No | 1–8 short lines of what users can do |
| `type` | Yes | *taxonomy*: e.g. `mcp-server`, `plugin`, `api-integration`, `cli` |
| `stages` | Yes | *taxonomy*: the SDLC/STLC stages where it helps. Only list the ones that are really true. |
| `protocols` | Yes | *taxonomy*: e.g. `streamable-http`, `stdio`, `rest`, `webhook` |
| `install.url` | One of url or command | Where users install or connect (remote endpoint or install page) |
| `install.command` | One of url or command | Command that starts it locally, with a pinned version |
| `install.auth` | No | `none`, `oauth`, `api-key` or `basic` |
| `install.env` | No | Variable **names** users must set, with a description. Never values. |
| `install.registry_name` | No | Name in the official MCP Registry, if published there |
| `docs_url` | Yes | Main documentation |
| `privacy_url` | Yes | Privacy policy |
| `support.email` or `support.url` | At least one | Where users get help |
| `logo` | Yes | `logos/<your-id>.svg` or `.png` |
| `badge` | Yes | Always `community`. Maintainers grant `verified` and `official`. |
| `health_url` | Only for verified remote connectors | Endpoint that answers when the connector is up |

Some protocols need a matching install field: `streamable-http` and `sse` need `install.url`, and `stdio` needs `install.command`. All URLs must use `https://`.

### Logo rules

- Square, SVG or PNG; PNG at least 128×128 px
- At most 100 KB
- SVGs can't contain scripts, event handlers (`onclick=` and so on), `<foreignObject>` or links to outside files

## Run the checks on your machine

```bash
npm run check                                          # schema, logo, secret scan
node scripts/check-links.js listings/<your-id>.yaml    # your links and endpoint
```

Every error gives the file, the line and usually the fix:

```
✖ listings/acme-mcp.yaml  (3 problems)
    listings/acme-mcp.yaml:6   type: "mcp" is not a known type. Did you mean "mcp-server"?
    listings/acme-mcp.yaml:14  docs: unknown field. Did you mean "docs_url"?
    listings/acme-mcp.yaml:16  support: needs at least one of `email` or `url`
```

## Open the pull request

```bash
git add listings/<your-id>.yaml logos/<your-id>.svg
git commit -m "Add <your connector name>"
git push origin add-<your-id>
```

Open a PR from your branch on GitHub and fill in the PR template.

Within a few minutes a bot comments on your PR with:

- a preview of your listing card
- a checklist: schema, works with our products, logo, no secrets, links, health
- line-by-line fixes for anything that failed

Push fixes to the same branch; the comment updates each time. The PR is labelled `ready-for-review` once everything passes, or `needs-changes` until then.

A partner PR may only change `listings/` and `logos/`. If you think the schema or the categories need to change, open an issue instead.

## Review

A maintainer reviews PRs that pass all checks within 7 working days. We check that:

- the connector really works with the products it lists (we may ask for a demo or a test account)
- `docs_url` and `integration.docs_url` explain setup and auth
- you're allowed to list the connector for the vendor
- `stages` and `capabilities` describe what it really does

After the PR merges, your listing is live on the marketplace within a few minutes.

## Trust badges

| Badge | Meaning | Who grants it |
| --- | --- | --- |
| Community | Passed all automated checks | Automatic on merge |
| Verified | Tested by our team: installed, used with each listed product, healthy, support answered | Maintainers |
| Official | Built and maintained by us | Maintainers |

To get **Verified**, open an issue after your listing is merged, asking for verification. A maintainer will:

1. install it from the listing and run a real task with each product in `products`,
2. confirm `health_url` is healthy (remote connectors only),
3. send a test question to your `support` contact,
4. check your docs and privacy policy,

then add your id to [`VERIFIED.md`](VERIFIED.md). The checks only allow `verified` for ids in that file.

## Health checks

Every listing's links (`vendor.url`, `docs_url`, `integration.docs_url`, `privacy_url`, `support.url`) and `health_url` are checked every 6 hours.

- The marketplace shows **Healthy**, **Broken link** or **Down since** a date on your card.
- If your listing fails for about a day (4 checks in a row), we open a `listing-health` issue. It closes itself when the checks pass again.
- If it's still failing **7 days** after the first failure, the listing is hidden from the marketplace. It comes back on its own as soon as the checks pass; you don't need a new PR.
- If a problem isn't fixed, we may also remove the Verified badge or the listing.

## Ratings

Ratings aren't open yet. When they are, users will rate connectors 1–5 stars, and the average will show on your card:

- Each GitHub account's latest rating counts once.
- Ratings from your own team don't count: we ignore the vendor org account and public members of the GitHub org in `vendor.github`. Please don't ask colleagues to rate your connector.
- If a review is abusive or clearly wrong, open an issue and a maintainer can hide it. Critical but fair reviews stay up; respond by fixing the problem.

## Updating or removing your listing

- **Update:** send a PR that edits your files. Keep the same `id`.
- **Remove:** send a PR that deletes your listing and logo.
- New version or endpoint? Update `install` in the same way, so users always get working setup steps.

## Security

- Never put API keys, tokens or passwords anywhere in a PR. The secret scan blocks them, and you would need to rotate the key.
- Found a security problem in a listed connector? Report it privately through the security contact on the "New issue" page, not in a public issue.

## FAQ

**My connector works with a product that isn't in the list.**
Open an issue. Products are added to `taxonomy.yaml` by maintainers.

**The link check fails with HTTP 403, but my page works in a browser.**
Some sites block automated checks. 403 and 429 are reported as warnings, not failures; mention it in your PR.

**My connector needs a paid account on the other tool.**
That's fine. Say so in `summary` or your docs, and give reviewers a way to test it.

**Can I list more than one connector?**
Yes, one file per connector, each with its own `id`. Separate PRs are easiest to review.

**How do I get help?**
Open an issue, or ask in your PR. The bot comment links back to this guide.

## Maintainers

- Review partner PRs, and use CODEOWNERS review for anything outside `listings/` and `logos/`.
- Category changes go in `taxonomy.yaml` only.
- Never switch the checks workflow to `pull_request_target`, and never add steps that need secrets on PRs.
- Hide spam reviews with the `review-hidden` label.
