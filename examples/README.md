# Example listings

Fictional third-party listings that show partners what a good submission looks like.
The vendors are made up (Microsoft's sample company names) and every URL uses the reserved `.example` domain.
The test suite validates these files, but they're never published in the catalog.

| Example | Vendor | Connects | Our products | Shows |
| --- | --- | --- | --- | --- |
| [`acme-jira-testing`](listings/acme-jira-testing.yaml) | Acme Apps | Jira | Test Manager, KaneAI, HyperExecute | Several products, full `capabilities` list |
| [`northwind-slack-alerts`](listings/northwind-slack-alerts.yaml) | Northwind Labs | Slack | HyperExecute, Test Analytics | Webhook integration, `api-integration` type |
| [`fabrikam-azure-devops`](listings/fabrikam-azure-devops.yaml) | Fabrikam | Azure DevOps | Web Automation Cloud, Test Manager | CI plugin with `install.env` secrets |
| [`contoso-vscode`](listings/contoso-vscode.yaml) | Contoso | VS Code | Web Automation Cloud, Real Device Cloud | Local install with `install.command` |
| [`tailspin-github-action`](listings/tailspin-github-action.yaml) | Tailspin | GitHub | HyperExecute, SmartUI | PR checks in the code review stage |
| [`wingtip-figma`](listings/wingtip-figma.yaml) | Wingtip | Figma | SmartUI | Design-stage connector, single product |
| [`adventure-works-qa-mcp`](listings/adventure-works-qa-mcp.yaml) | Adventure Works | none (agent tool) | KaneAI, Real Device Cloud | Remote MCP server, no `platform` |

To list your own connector, copy the closest example into `listings/<your-id>.yaml`, add your logo to `logos/`, and follow [CONTRIBUTING.md](../CONTRIBUTING.md).
