'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { mcpToolsList, a2aAgentCard, parseRpc } = require('../scripts/lib/links');

// A local server whose behaviour each test sets with `handler`.
let handler;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => handler(req, res, body ? JSON.parse(body) : null));
});
let base;
test.before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
  base = `http://127.0.0.1:${server.address().port}`;
  resolve();
})));
test.after(() => server.close());

const sse = (res, msg, headers = {}) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', ...headers });
  res.end(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
};
const json = (res, status, msg) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(msg));
};

// An MCP server like ours: SSE replies, a session id, and the negotiated version required on later calls.
function mcpServer({ toolsNeedAuth = false, tools = [{ name: 'a' }, { name: 'b' }] } = {}) {
  return (req, res, msg) => {
    if (msg.method === 'initialize') {
      return sse(res, { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }, { 'mcp-session-id': 'S1' });
    }
    if (req.headers['mcp-session-id'] !== 'S1' || req.headers['mcp-protocol-version'] !== '2025-03-26') {
      return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'No valid session ID provided' } });
    }
    if (msg.method === 'notifications/initialized') return res.writeHead(202).end();
    if (msg.method === 'tools/list') {
      if (toolsNeedAuth) return json(res, 401, { jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: 'Unauthorized' } });
      return sse(res, { jsonrpc: '2.0', id: msg.id, result: { tools } });
    }
    return json(res, 404, {});
  };
}

test('MCP: healthy when tools/list works without credentials', async () => {
  handler = mcpServer();
  const r = await mcpToolsList(base);
  assert.equal(r.ok, true);
  assert.equal(r.via, 'mcp tools/list, 2 tools');
});

test('MCP: down when tools/list needs auth, as registries see it', async () => {
  handler = mcpServer({ toolsNeedAuth: true });
  const r = await mcpToolsList(base);
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.match(r.error, /tools\/list failed: Unauthorized/);
});

test('MCP: down when initialize itself is rejected', async () => {
  handler = (req, res) => json(res, 401, { error: 'unauthorized' });
  const r = await mcpToolsList(base);
  assert.equal(r.ok, false);
  assert.match(r.error, /initialize failed/);
});

test('MCP: down when the server lists no tools', async () => {
  handler = mcpServer({ tools: [] });
  const r = await mcpToolsList(base);
  assert.equal(r.ok, false);
  assert.match(r.error, /no tools/);
});

test('MCP: replies parse as plain JSON or SSE', () => {
  assert.equal(parseRpc('{"jsonrpc":"2.0","id":2,"result":{}}', 2).id, 2);
  assert.equal(parseRpc('event: message\ndata: {"id":1}\n\ndata: {"id":2,"result":{}}\n', 2).id, 2);
  assert.equal(parseRpc('<html>oops</html>', 1), null);
});

const card = { name: 'Agent', description: 'd', url: 'https://a.example', version: '1', capabilities: {}, skills: [{ id: 's' }], defaultInputModes: ['text'], defaultOutputModes: ['text'] };

test('A2A: a complete agent card is healthy', async () => {
  handler = (req, res) => json(res, 200, card);
  const r = await a2aAgentCard(base);
  assert.equal(r.ok, true);
  assert.equal(r.via, 'a2a agent card, 1 skill');
});

test('A2A: missing fields and bad JSON are reported', async () => {
  handler = (req, res) => json(res, 200, { ...card, url: undefined, skills: undefined });
  assert.match((await a2aAgentCard(base)).error, /missing url, skills/);

  handler = (req, res) => res.writeHead(200).end('not json');
  assert.match((await a2aAgentCard(base)).error, /not valid JSON/);

  handler = (req, res) => json(res, 404, {});
  assert.equal((await a2aAgentCard(base)).ok, false);
});
