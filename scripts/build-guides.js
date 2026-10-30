'use strict';

// Renders the partner guides (CONTRIBUTING.md, docs/building-a-connector.md) into
// dist/site/guides/*.html, so the site links to readable pages instead of raw Markdown on GitHub.
// Called by build-site.js. Links between guides point at the built pages; links to other repo
// files point at GitHub when the repo URL is known, and become plain text when it isn't.

const fs = require('node:fs');
const path = require('node:path');
const { Marked } = require('marked');
const { ROOT } = require('./lib/taxonomy');

const GUIDES = [
  // In the order a partner follows them: build the connector, then list it.
  { src: 'docs/building-a-connector.md', out: 'building-a-connector.html', title: 'Step 1: Build your connector', nav: '1 · Build it' },
  { src: 'CONTRIBUTING.md', out: 'contributing.html', title: 'Step 2: List your connector', nav: '2 · List it' },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// GitHub-style heading ids, so #anchors written for GitHub work on the site too.
function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
}

function renderGuide(guide, repoUrl) {
  const fromDir = path.posix.dirname(guide.src);
  const toc = [];
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type !== 'link' || /^(https?:|mailto:|#)/.test(token.href)) return;
      const [file, hash = ''] = token.href.split('#');
      const target = path.posix.normalize(path.posix.join(fromDir, file));
      const other = GUIDES.find((g) => g.src === target);
      if (other) token.href = other.out + (hash ? `#${hash}` : '');
      else token.href = repoUrl ? `${repoUrl}/${target.endsWith('/') ? 'tree' : 'blob'}/main/${target}` : '';
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(html);
        if (depth === 2) toc.push({ id, html });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        const html = this.parser.parseInline(tokens);
        if (!href) return html; // repo file, but no repo URL yet
        const external = /^https?:/.test(href) && !(repoUrl && href.startsWith(repoUrl));
        return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${html}</a>`;
      },
    },
  });
  const md = fs.readFileSync(path.join(ROOT, guide.src), 'utf8');
  // The page title comes from the template; drop the Markdown's own top heading.
  const body = marked.parse(md.replace(/^# .*\n/, ''));
  return { body, toc };
}

function page(guide, { body, toc }, repoUrl) {
  const nav = GUIDES.map((g) => (g === guide ? `<span aria-current="page">${esc(g.nav)}</span>` : `<a href="${g.out}">${esc(g.nav)}</a>`)).join('');
  const source = repoUrl ? `<a href="${esc(`${repoUrl}/blob/main/${guide.src}`)}">Edit this page on GitHub</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(guide.title)} · Connector Marketplace</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root { --bg: #f5f7f8; --surface: #fff; --sunken: #eaeff1; --fg: #12202a; --muted: #5a6b76; --line: #d6dfe3; --accent: #0b7a75; --code-bg: #0f1b23; --code-fg: #d8e6ee;
  --f-display: "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif; --f-body: "Instrument Sans", "Segoe UI", system-ui, sans-serif; --f-mono: "JetBrains Mono", ui-monospace, Menlo, monospace; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d151b; --surface: #142029; --sunken: #0a1116; --fg: #e3ecf1; --muted: #93a6b2; --line: #24343f; --accent: #3cc5bc; --code-bg: #070d11; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #0d151b; --surface: #142029; --sunken: #0a1116; --fg: #e3ecf1; --muted: #93a6b2; --line: #24343f; --accent: #3cc5bc; --code-bg: #070d11; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.6 var(--f-body); }
.wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
.top { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; font-size: 14px; margin-bottom: 22px; }
.top a, .top span { color: var(--muted); text-decoration: none; }
.top a:hover { color: var(--accent); }
.top span[aria-current] { color: var(--fg); font-weight: 600; }
.top .home { margin-right: auto; color: var(--accent); font-weight: 600; }
h1 { font: 800 clamp(28px, 4vw, 38px)/1.1 var(--f-display); letter-spacing: -.02em; margin: 0 0 14px; }
.toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.toc a { font-size: 12.5px; color: var(--fg); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; }
.toc a:hover { border-color: var(--accent); color: var(--accent); }
article h2 { font: 700 21px/1.25 var(--f-display); margin: 32px 0 8px; padding-top: 18px; border-top: 1px solid var(--line); scroll-margin-top: 12px; }
article h3 { font: 700 16px var(--f-display); margin: 22px 0 6px; scroll-margin-top: 12px; }
article p, article li { max-width: 75ch; }
article a { color: var(--accent); }
article code { font: 12.5px var(--f-mono); background: var(--sunken); padding: 1px 5px; border-radius: 5px; overflow-wrap: anywhere; }
article pre { background: var(--code-bg); color: var(--code-fg); border-radius: 10px; padding: 14px; overflow-x: auto; }
article pre code { background: none; padding: 0; color: inherit; overflow-wrap: normal; }
article table { border-collapse: collapse; width: 100%; font-size: 13.5px; display: block; overflow-x: auto; }
article th, article td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
article th { background: var(--sunken); }
article input[type="checkbox"] { margin-right: 6px; }
.foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.foot a { color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <nav class="top"><a class="home" href="../">← Connector Marketplace</a>${nav}</nav>
  <h1>${esc(guide.title)}</h1>
  <nav class="toc" aria-label="On this page">${toc.map((t) => `<a href="#${t.id}">${t.html}</a>`).join('')}</nav>
  <article>
${body}
  </article>
  <div class="foot">${source}</div>
</div>
</body>
</html>
`;
}

/** Writes every guide into <outDir>/guides/. Returns the published paths. */
function buildGuides(outDir, repoUrl) {
  const dir = path.join(outDir, 'guides');
  fs.mkdirSync(dir, { recursive: true });
  return GUIDES.map((g) => {
    fs.writeFileSync(path.join(dir, g.out), page(g, renderGuide(g, repoUrl), repoUrl));
    return `guides/${g.out}`;
  });
}

module.exports = { buildGuides, renderGuide, GUIDES };
