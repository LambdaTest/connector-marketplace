# Connector Marketplace

The public list of connectors (MCP servers, agent skills, plugins, API integrations) that work with our products.
**We only accept connectors that connect to at least one of our products.** Every listing names those products and links to a page showing the setup.
Each connector is one YAML file in `listings/`. Partners add theirs with a pull request.
CI checks every PR, and the merged listings build into `dist/catalog.json`, which the marketplace site reads.

## Repository layout

```
listings/<id>.yaml           one file per connector
logos/<id>.svg|png           square logo, max 100 KB
taxonomy.yaml                every allowed category: our products, stages (SDLC + STLC), types, protocols, badges
schema/listing.schema.json   structure of a listing (category values are filled in from taxonomy.yaml)
VERIFIED.md                  listings maintainers have tested; the only way to get a verified/official badge
scripts/                     validate, build-catalog, check-logos, scan-secrets, check-links, check-pr-scope
examples/                    fictional partner listings to copy (validated, never published)
docs/building-a-connector.md how a connector talks to our platform: REST APIs, MCP server, grid, webhooks, auth
site/index.html              the marketplace page (published to GitHub Pages)
tests/                       unit tests and broken fixtures
```

## Listing format

```yaml
id: acme-mcp                     # kebab-case, same as the file name
name: Acme MCP
summary: One line for the listing card.
vendor:
  name: Acme
  url: https://acme.example
  github: acme                   # optional
products: [hyperexecute]         # taxonomy.yaml → products; at least one of ours
integration:
  summary: Triggers HyperExecute jobs from a PR and posts results back.   # what it does with our product
  docs_url: https://docs.acme.example/hyperexecute                        # setup with our product
  platform: GitHub                                                        # optional: the other tool it connects
  capabilities:                                                           # optional: what users can do
    - Run HyperExecute jobs when a PR opens
type: mcp-server                 # from taxonomy.yaml → types
stages: [test-execution, defect-triage]   # taxonomy.yaml → stages
protocols: [streamable-http]     # taxonomy.yaml → protocols
install:
  url: https://mcp.acme.example/mcp       # remote connector, and/or
  command: npx -y @acme/mcp@1.2.0         # local connector
  registry_name: io.github.acme/mcp       # optional, official MCP Registry name
  auth: oauth                             # none | oauth | api-key | basic
  env:                                    # names only, never values
    - name: ACME_API_KEY
      description: API key from Settings → API
      required: true
      secret: true
docs_url: https://docs.acme.example/mcp
privacy_url: https://acme.example/privacy
support:
  email: support@acme.example    # email and/or url
logo: logos/acme-mcp.svg
badge: community                 # taxonomy.yaml → badges; verified/official need VERIFIED.md
health_url: https://mcp.acme.example/mcp  # required for verified/official remote connectors
```

The schema has the full rules: `schema/listing.schema.json`.

## Commands

Needs Node 20 or newer.

```bash
npm ci
npm run validate        # check every listing (or: node scripts/validate.js listings/acme-mcp.yaml)
npm run check           # validate + logos + secret scan
npm run check:links     # fetch docs/privacy/support links and health_url (needs network)
npm run build           # write dist/catalog.json
npm run serve           # build the site + health.json and open it at http://localhost:1221
npm test                # unit tests
```

Errors point at the file and line and suggest a fix:

```
✖ listings/acme-mcp.yaml  (3 problems)
    listings/acme-mcp.yaml:6  type: "mcp" is not a known type. Did you mean "mcp-server"? Allowed values (from taxonomy.yaml): ...
    listings/acme-mcp.yaml:14  docs: unknown field. Did you mean "docs_url"? ...
    listings/acme-mcp.yaml:16  support: needs at least one of `email` or `url`
```

## Categories

All categories live in `taxonomy.yaml` and nowhere else. To add a product, stage, type, protocol or badge, edit that file in a maintainer PR.
The validator, catalog and facet counts pick it up automatically, and a unit test fails if a category id is hardcoded in the schema or scripts.

## CI

`.github/workflows/checks.yml` runs on every PR, including PRs from forks:

| Job | What it checks |
| --- | --- |
| Schema, logos, secrets | Fork PRs only touch `listings/` and `logos/`; unit tests; schema + taxonomy rules; logo format/size/shape and no scripts in SVGs; credentials in any changed file; catalog builds |
| Links and health | `docs_url`, `integration.docs_url`, `privacy_url`, `support.url`, `vendor.url` resolve; `health_url` is healthy: MCP servers must answer `initialize` and `tools/list` without credentials, A2A agents must serve a complete agent card |

It uses the `pull_request` trigger with a read-only token and needs no secrets, so fork PRs get the same checks as internal ones.

**PR bot** (`pr-bot.yml`). The checks workflow also builds a report: a preview of each listing card plus a pass/fail checklist with line-by-line fixes.
Fork PRs can't comment, so `pr-bot.yml` (a `workflow_run` workflow in the base repo) posts it as one comment, updates it on every push, and labels the PR `ready-for-review` or `needs-changes`.
It never checks out PR code, and it finds the PR through the API rather than trusting anything in the report.

**Site and live health** (`pages.yml`). On every merge to `main` and every 6 hours, it:

1. builds `dist/site/` (page, `catalog.json`, logos),
2. checks every listing and writes `health.json`, reading the previous one from the live site to keep "down since" and "last OK" history,
3. opens a `listing-health` issue for a listing that has failed for about a day, and closes it when it recovers,
   hides a listing that has failed for 7 days by leaving it out of the published `catalog.json` (labels the issue `listing-hidden`); it reappears when checks pass,
4. deploys to GitHub Pages.

No server or database: the site is static, and health history lives in the published `health.json`.

**Ratings** (`reviews.yml`, `scripts/build-ratings.js`), **off for v1**. They stay off until the repo variable `RATINGS_ENABLED` is `true`; see [`.github/ratings/`](.github/ratings/README.md) to turn them on. When on, users rate a connector 1–5 stars through the **Rate a connector** issue form. The site's "Rate this connector" button opens it with the connector already filled in. Then:

1. `reviews.yml` checks the review, replies, closes the issue, and triggers a site rebuild. An incomplete review gets a reply saying what to fix and the `review-invalid` label.
2. `pages.yml` reads all review issues and writes `ratings.json`: average, 1–5 distribution, count, and the 5 newest written reviews per connector.

Rules:
- Each GitHub account's **latest** rating per connector counts once. Editing the issue changes the rating.
- Reviews from the vendor's own GitHub org are ignored: the vendor org account, plus public members of the org named in `vendor.github`. Reviewers also confirm they don't work for the vendor.
- Maintainers hide spam or abuse by adding the `review-hidden` label. The review drops out on the next build.
- Reviewers need a GitHub account. That's the trade-off for needing no server.

### Repo settings to turn on

Run `scripts/setup-github.sh <org>/<repo>` once after the first push (needs `gh`, logged in as a repo admin). It:

- creates the labels the workflows use (`ready-for-review`, `needs-changes`, `listing-health`, `listing-hidden`, plus the rating labels)
- turns on GitHub Pages (source: GitHub Actions) and private vulnerability reporting
- protects `main`: the "Listing checks" jobs must pass and Code Owners must review
- sets `RATINGS_ENABLED=false`

Do by hand:

- Create the `marketplace-maintainers` team named in `.github/CODEOWNERS`, and give it write access
- **Settings → Actions → General → Fork pull request workflows**: require approval for first-time contributors
- Optional custom domain: add it under Settings → Pages and create a CNAME DNS record

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
