'use strict';

// Fetches the public URLs in listings and probes health_url.
// install.url is not fetched: connector endpoints usually require auth.

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;
const UA = 'connector-marketplace-link-check/1.0';
// Statuses that usually mean bot protection or rate limiting, not a dead page.
const SOFT_FAIL = [403, 429];

async function request(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, ...init, headers: { 'user-agent': UA, ...init.headers } });
    // Only the status matters; abort instead of downloading the body.
    ctrl.abort();
    return { status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, ms: Date.now() - started, error: err.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : err.cause?.code || err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function getWithRetry(url) {
  const first = await request(url);
  if (first.status >= 200 && first.status < 400) return first;
  return request(url);
}

// Like request(), but reads the body. Used by probes that check what an endpoint returns.
async function fetchBody(url, init = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), ...init, headers: { 'user-agent': UA, ...init.headers } });
    return { status: res.status, headers: res.headers, text: await res.text(), ms: Date.now() - started };
  } catch (err) {
    return { status: 0, ms: Date.now() - started, error: err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : err.cause?.code || err.message };
  }
}

// A JSON-RPC reply comes back as plain JSON or, on streamable HTTP, as server-sent events.
function parseRpc(text, id) {
  const bodies = /^\s*[{[]/.test(text) ? [text] : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
  for (const b of bodies) {
    try {
      const msg = JSON.parse(b);
      if (msg.id === id) return msg;
    } catch {
      // not JSON: skip
    }
  }
  return null;
}

// MCP: the initialize handshake, then tools/list, without credentials.
// Registries and directories (Glama, Docker, Claude, ChatGPT) read tools this way,
// so a server that needs auth for tools/list is reported as down.
async function mcpToolsList(url) {
  const started = Date.now();
  const fail = (status, error) => ({ status, ms: Date.now() - started, ok: false, error });
  const post = (headers, body) =>
    fetchBody(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(body),
    });

  const init = await post({}, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: UA, version: '1.0' } },
  });
  if (init.error) return fail(0, init.error);
  const initMsg = parseRpc(init.text, 1);
  if (init.status !== 200 || !initMsg?.result) return fail(init.status, `initialize failed${initMsg?.error ? `: ${initMsg.error.message}` : ''}`);

  // Later requests must carry the session id and the version the server picked.
  const session = { 'mcp-protocol-version': initMsg.result.protocolVersion };
  if (init.headers.get('mcp-session-id')) session['mcp-session-id'] = init.headers.get('mcp-session-id');
  await post(session, { jsonrpc: '2.0', method: 'notifications/initialized' });
  const list = await post(session, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  if (list.error) return fail(0, list.error);
  const listMsg = parseRpc(list.text, 2);
  if (list.status !== 200 || !Array.isArray(listMsg?.result?.tools)) {
    return fail(list.status, `tools/list failed${listMsg?.error ? `: ${listMsg.error.message}` : ''}`);
  }
  const n = listMsg.result.tools.length;
  if (!n) return fail(list.status, 'tools/list returned no tools');
  return { status: list.status, ms: Date.now() - started, ok: true, via: `mcp tools/list, ${n} tool${n === 1 ? '' : 's'}` };
}

// A2A: health_url is the agent card (usually /.well-known/agent-card.json).
const AGENT_CARD_FIELDS = ['name', 'description', 'url', 'version', 'capabilities', 'skills', 'defaultInputModes', 'defaultOutputModes'];

async function a2aAgentCard(url) {
  const res = await fetchBody(url, { headers: { accept: 'application/json' } });
  const fail = (error) => ({ status: res.status, ms: res.ms, ok: false, error });
  if (res.error) return fail(res.error);
  if (res.status !== 200) return { status: res.status, ms: res.ms, ok: false };
  let card;
  try {
    card = JSON.parse(res.text);
  } catch {
    return fail('agent card is not valid JSON');
  }
  const missing = AGENT_CARD_FIELDS.filter((f) => card?.[f] === undefined);
  if (missing.length) return fail(`agent card is missing ${missing.join(', ')}`);
  if (!Array.isArray(card.skills) || !card.skills.length) return fail('agent card has no skills');
  return { status: res.status, ms: res.ms, ok: true, via: `a2a agent card, ${card.skills.length} skill${card.skills.length === 1 ? '' : 's'}` };
}

const PROBES = { 'mcp-tools-list': mcpToolsList, 'a2a-agent-card': a2aAgentCard };

async function checkHealth(listing, taxonomy) {
  // A protocol probe decides on its own: a 200 from a plain GET says nothing about
  // whether an MCP server lists its tools or an agent card is valid.
  for (const proto of listing.protocols || []) {
    const probe = PROBES[taxonomy.protocols.find((p) => p.id === proto)?.health_probe];
    if (probe) return probe(listing.health_url);
  }
  return getWithRetry(listing.health_url);
}

async function pool(items, worker) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx]);
      }
    }),
  );
  return out;
}

function linkFields(listing) {
  return {
    'vendor.url': listing.vendor?.url,
    docs_url: listing.docs_url,
    'integration.docs_url': listing.integration?.docs_url,
    privacy_url: listing.privacy_url,
    'support.url': listing.support?.url,
  };
}

/**
 * Check one listing. Returns { id, checks: [{ field, url, kind, status, ms, error?, via?, outcome }] }
 * where outcome is 'ok' | 'warn' | 'fail'.
 */
async function checkListing(listing, taxonomy) {
  const jobs = [];
  const seen = new Set();
  for (const [field, url] of Object.entries(linkFields(listing))) {
    if (typeof url !== 'string' || !url.startsWith('https://') || seen.has(url)) continue;
    seen.add(url);
    jobs.push({ field, url, kind: 'link' });
  }
  if (typeof listing.health_url === 'string') jobs.push({ field: 'health_url', url: listing.health_url, kind: 'health' });

  const checks = await pool(jobs, async (job) => {
    const { ok: probeOk, ...res } = job.kind === 'health' ? await checkHealth(listing, taxonomy) : await getWithRetry(job.url);
    const ok = job.kind === 'health' ? probeOk ?? (res.status >= 200 && res.status < 300) : res.status >= 200 && res.status < 400;
    const outcome = ok ? 'ok' : job.kind === 'link' && SOFT_FAIL.includes(res.status) ? 'warn' : 'fail';
    return { ...job, ...res, outcome };
  });
  return { id: listing.id, checks };
}

async function checkListings(listings, taxonomy) {
  const out = [];
  // Listings run one after another; URLs inside a listing run in parallel.
  for (const l of listings) out.push(await checkListing(l, taxonomy));
  return out;
}

function describeCheck(c) {
  const got = c.status && c.error ? `HTTP ${c.status}, ${c.error}` : c.status ? `HTTP ${c.status}` : c.error;
  if (c.outcome === 'ok') return `${got}${c.via ? ` (via ${c.via})` : ''}`;
  if (c.outcome === 'warn') return `${got} (may be bot protection; check by hand)`;
  return c.kind === 'health' ? `health_url is not healthy (${got})` : `${c.field} is broken (${got})`;
}

module.exports = { checkListing, checkListings, describeCheck, mcpToolsList, a2aAgentCard, parseRpc };
