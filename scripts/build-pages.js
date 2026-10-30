'use strict';

// Writes one page per connector to dist/site/connectors/<id>/index.html.
// Everything about the listing is in the HTML, so search engines can index it;
// only the live status is read from health.json in the browser.
// Called by build-site.js.

const fs = require('node:fs');
const path = require('node:path');
const { esc, shell } = require('./lib/page');
const { snippets } = require('./lib/snippets');

const SHIELD = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1 2.5 3v4.2c0 3.4 2.3 6.3 5.5 7.3 3.2-1 5.5-3.9 5.5-7.3V3L8 1Zm-1 9.6L4.6 8.2l1-1L7 8.6l3.4-3.4 1 1L7 10.6Z"/></svg>';

const CSS = `
.hero { display: grid; grid-template-columns: auto 1fr; gap: 6px 18px; align-items: center; margin-bottom: 8px; }
.hero .logo { width: 72px; height: 72px; border-radius: 16px; grid-row: span 2; }
.hero h1 { font: 800 clamp(26px, 4vw, 38px)/1.1 var(--f-display); letter-spacing: -.02em; margin: 0; overflow-wrap: anywhere; }
.hero .by { color: var(--muted); display: flex; align-items: center; gap: 8px; min-width: 0; }
.vendor-logo { width: 20px; height: 20px; border-radius: 5px; flex: none; object-fit: contain; background: #fff; }
.kv .vendor-logo { width: 16px; height: 16px; border-radius: 4px; vertical-align: -3px; margin-right: 6px; }
.summary { font-size: 17px; max-width: 70ch; margin: 14px 0; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 8px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; margin-top: 28px; align-items: start; }
.layout > * { min-width: 0; display: grid; gap: 28px; }
.layout aside { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; gap: 22px; }
.works { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
.works .arrow { color: var(--muted); }
@media (max-width: 860px) { .layout { grid-template-columns: minmax(0, 1fr); } }
`;

// Tabs, copy, and live status. Runs on each connector page.
const SCRIPT = `
const tabs = [...document.querySelectorAll('.tab')];
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
  document.querySelectorAll('.snip').forEach((p) => (p.hidden = p.id !== t.getAttribute('aria-controls')));
}));
document.getElementById('copy')?.addEventListener('click', async (e) => {
  const pre = [...document.querySelectorAll('.snip')].find((p) => !p.hidden);
  try { await navigator.clipboard.writeText(pre.textContent); e.target.textContent = 'Copied'; }
  catch { const r = document.createRange(); r.selectNodeContents(pre); getSelection().removeAllRanges(); getSelection().addRange(r); e.target.textContent = 'Selected'; }
  setTimeout(() => (e.target.textContent = 'Copy'), 1500);
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 60) return Math.max(m, 1) + ' min ago'; const h = Math.round(m / 60); return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago'; };
fetch(document.body.dataset.root + 'health.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((all) => {
  const h = all?.listings?.[document.body.dataset.id];
  if (!h) return;
  const box = document.getElementById('health');
  const title = { healthy: 'Healthy', degraded: 'A public link is broken', down: 'Down since ' + fmtDate(h.down_since) }[h.status];
  const detail = 'Checked ' + ago(h.checked_at) + (h.health ? ' · ' + (h.health.via ? 'endpoint answered (' + h.health.via + ')' : 'endpoint answered HTTP ' + h.health.status) + ' in ' + h.health.ms + ' ms' : ' · links only (no health endpoint)') + (h.status !== 'healthy' && h.last_ok ? ' · last OK ' + fmtDate(h.last_ok) : '');
  box.className = 'health ' + h.status;
  box.innerHTML = '<span class="dot"></span><div><strong>' + title + '</strong><small>' + esc(detail) + '</small>' + (h.problems.length ? '<ul>' + h.problems.map((p) => '<li>' + esc(p.message) + '</li>').join('') + '</ul>' : '') + '</div>';
  if (h.hidden) document.getElementById('hidden-notice').hidden = false;
});
`;

const label = (list, id) => (list.find((x) => x.id === id) || { label: id }).label;
const host = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const ext = (url, text = host(url)) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;

function connectorPage(l, catalog, { repoUrl }) {
  const t = catalog.taxonomy;
  const stageInfo = Object.fromEntries(t.stage_groups.flatMap((g) => g.values.map((v) => [v.id, { ...v, group: g.id }])));
  const typeLabel = label(t.types, l.type);
  const snips = snippets(l, t.protocols);
  const env = l.install.env || [];
  const caps = l.integration.capabilities || [];
  const root = '../../';
  const vendorLogo = l.vendor.logo ? `<img class="vendor-logo" src="${root}${esc(l.vendor.logo)}" alt="">` : '';
  const report = repoUrl
    ? `<a href="${esc(`${repoUrl}/issues/new?template=report-broken-listing.yml&title=${encodeURIComponent(`[Broken] ${l.id}`)}`)}" target="_blank" rel="noopener">Report a problem with this connector</a>`
    : '';

  const body = `
  <p class="notice" id="hidden-notice" hidden>This connector has been failing its checks for over a week, so it's hidden from the marketplace until it passes again.</p>
  <header class="hero">
    <img class="logo" src="${root}${esc(l.logo)}" alt="">
    <h1>${esc(l.name)}</h1>
    <div class="by">by ${vendorLogo}${ext(l.vendor.url, l.vendor.name)}</div>
  </header>
  <div class="meta">
    <span class="badge ${esc(l.badge)}">${t.badges.find((b) => b.id === l.badge)?.verified_registry ? SHIELD : ''}${esc(label(t.badges, l.badge))}</span>
    <span class="tag">${esc(typeLabel)}</span>
    ${l.protocols.map((p) => `<span class="tag">${esc(label(t.protocols, p))}</span>`).join('')}
  </div>
  ${l.summary ? `<p class="summary">${esc(l.summary)}</p>` : ''}
  <div class="actions">
    <a class="btn primary" href="${esc(l.integration.docs_url)}" target="_blank" rel="noopener">Setup guide</a>
    ${l.docs_url !== l.integration.docs_url ? `<a class="btn" href="${esc(l.docs_url)}" target="_blank" rel="noopener">Documentation</a>` : ''}
  </div>

  <div class="layout">
    <main>
      <section class="section">
        <h2>${l.integration.platform ? `Connects ${esc(l.integration.platform)} to our products` : 'Works with our products'}</h2>
        <div class="works">${l.integration.platform ? `<span class="tag sdlc">${esc(l.integration.platform)}</span><span class="arrow">⇄</span>` : ''}${l.products.map((p) => `<span class="tag stlc">${esc(label(t.products, p))}</span>`).join('')}</div>
        <p>${esc(l.integration.summary)}</p>
        ${caps.length ? `<ul class="caps">${caps.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      </section>

      <section class="section">
        <h2>Install</h2>
        <div class="tabs" role="tablist">${snips.map(([name], i) => `<button class="tab" type="button" role="tab" aria-selected="${i === 0}" aria-controls="snip-${i}">${esc(name)}</button>`).join('')}</div>
        <div class="code"><button class="copy" type="button" id="copy">Copy</button>${snips.map(([, text], i) => `<pre class="snip" id="snip-${i}" role="tabpanel"${i ? ' hidden' : ''}>${esc(text)}</pre>`).join('')}</div>
      </section>

      ${env.length ? `<section class="section"><h2>You'll need</h2><div class="env">${env.map((e) => `<div><code>${esc(e.name)}</code>${e.required ? '' : ' <span style="color:var(--muted)">(optional)</span>'} · ${esc(e.description)}</div>`).join('')}</div></section>` : ''}

      <section class="section">
        <h2>Status</h2>
        <div class="health" id="health"><span class="dot"></span><div>Not checked yet. Every listing is checked every 6 hours.</div></div>
      </section>
    </main>

    <aside>
      <section class="section">
        <h2>Details</h2>
        <dl class="kv">
          <dt>Vendor</dt><dd>${vendorLogo}${ext(l.vendor.url, l.vendor.name)}</dd>
          <dt>Docs</dt><dd>${ext(l.docs_url)}</dd>
          <dt>Privacy</dt><dd>${ext(l.privacy_url)}</dd>
          <dt>Support</dt><dd>${[l.support.url ? ext(l.support.url) : '', l.support.email ? `<a href="mailto:${esc(l.support.email)}">${esc(l.support.email)}</a>` : ''].filter(Boolean).join('<br>')}</dd>
          <dt>Sign-in</dt><dd>${esc(l.install.auth || 'not stated')}</dd>
          ${l.install.registry_name ? `<dt>MCP Registry</dt><dd><code>${esc(l.install.registry_name)}</code></dd>` : ''}
          <dt>Listing id</dt><dd><code>${esc(l.id)}</code></dd>
        </dl>
      </section>
      <section class="section">
        <h2>Lifecycle stages</h2>
        <div class="meta">${l.stages.map((s) => `<span class="tag ${stageInfo[s]?.group || ''}">${esc(stageInfo[s]?.label || s)}</span>`).join('')}</div>
      </section>
      ${report ? `<section class="section">${report}</section>` : ''}
    </aside>
  </div>`;

  return shell({
    title: l.name,
    description: l.summary || l.integration.summary,
    root,
    crumbs: [
      { label: 'Connector Marketplace', href: root },
      { label: typeLabel, href: `${root}?type=${encodeURIComponent(l.type)}` },
      { label: l.name },
    ],
    body,
    css: CSS,
    script: SCRIPT,
  }).replace('<body>', `<body data-id="${esc(l.id)}" data-root="${root}">`);
}

/** Writes every connector page into <outDir>/connectors/<id>/. Returns how many were written. */
function buildPages(outDir, catalog, opts = {}) {
  const dir = path.join(outDir, 'connectors');
  fs.rmSync(dir, { recursive: true, force: true }); // drop pages of removed listings
  for (const l of catalog.listings) {
    fs.mkdirSync(path.join(dir, l.id), { recursive: true });
    fs.writeFileSync(path.join(dir, l.id, 'index.html'), connectorPage(l, catalog, opts));
  }
  return catalog.listings.length;
}

module.exports = { buildPages, connectorPage };
