'use strict';

// Install instructions shown on a connector's page, as [tab label, text] pairs.
// MCP servers get Claude Code and JSON config tabs; CLIs, plugins and integrations
// get their own command (with the env vars to set first) or install page.
// taxonomyProtocols: the protocol list from taxonomy.yaml (`mcp` and `install_requires` decide).

function snippets(l, taxonomyProtocols) {
  const out = [];
  const install = l.install || {};
  const env = install.env || [];
  const mcp = (l.protocols || []).map((id) => taxonomyProtocols.find((p) => p.id === id)).filter((p) => p?.mcp);
  const remoteMcp = install.url && mcp.some((p) => p.install_requires === 'url');
  const localMcp = install.command && mcp.some((p) => p.install_requires === 'command');

  if (remoteMcp) {
    out.push(['Claude Code', `claude mcp add --transport http ${l.id} ${install.url}`]);
    out.push(['JSON config', JSON.stringify({ mcpServers: { [l.id]: { type: 'http', url: install.url } } }, null, 2)]);
  }
  if (localMcp) {
    const [cmd, ...args] = install.command.split(' ');
    const cfg = { command: cmd, args };
    if (env.length) cfg.env = Object.fromEntries(env.map((e) => [e.name, `<your ${e.name}>`]));
    out.push([remoteMcp ? 'Local (stdio)' : 'Claude Code', `claude mcp add ${l.id} -- ${install.command}`]);
    out.push([remoteMcp ? 'Local JSON' : 'JSON config', JSON.stringify({ mcpServers: { [l.id]: cfg } }, null, 2)]);
  }
  if (!remoteMcp && install.url) out.push(['Install', `Install from:\n${install.url}`]);
  if (!localMcp && install.command) {
    out.push(['Command', [...env.map((e) => `export ${e.name}=<your ${e.name}>`), install.command].join('\n')]);
  }
  return out;
}

module.exports = { snippets };
