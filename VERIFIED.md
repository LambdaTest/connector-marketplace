# Verified listings

A listing can use the `verified` or `official` badge only if its id is in the table below.
The validator reads this file, so a partner cannot give themselves a badge by editing their own listing.

## What "verified" means

Before a maintainer adds a row, they confirm all of these:

1. **Tested by us.** We installed the connector from its listing and ran at least one real task end to end against each product in its `products` list.
2. **Healthy endpoint.** For remote connectors, `health_url` answers with a healthy response (the nightly link check keeps checking this).
3. **Docs.** `docs_url` explains setup, auth and every tool or endpoint the connector exposes.
4. **Support.** The `support` contact answered a test request within 2 business days.
5. **Privacy.** `privacy_url` covers the data the connector handles.

If any of these stop being true, a maintainer removes the row and the listing goes back to `community`.

## How to request verification

Open an issue that links your merged listing and says it is ready for verification. Only maintainers (see `CODEOWNERS`) can edit this file.

## Verified

| id | verified on | verified by | notes |
| --- | --- | --- | --- |
| `testmu-mcp` | _pending_ | _pending_ | First-party. Run the checklist above before going public |
| `kane-cli` | _pending_ | _pending_ | First-party |
| `smartui-cli` | _pending_ | _pending_ | First-party |
| `hyperexecute-cli` | _pending_ | _pending_ | First-party |
| `testmu-tunnel` | _pending_ | _pending_ | First-party |
| `testmu-jenkins` | _pending_ | _pending_ | First-party |
| `rook-cli` | _pending_ | _pending_ | First-party |
