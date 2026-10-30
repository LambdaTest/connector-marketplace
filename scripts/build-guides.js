'use strict';

// Renders the partner guides (CONTRIBUTING.md, docs/building-a-connector.md) into
// dist/site/guides/*.html, so the site links to readable pages instead of raw Markdown on GitHub.
// Called by build-site.js. Links between guides point at the built pages; links to other repo
// files point at GitHub when the repo URL is known, and become plain text when it isn't.

const fs = require('node:fs');
const path = require('node:path');
const { Marked } = require('marked');
const { ROOT } = require('./lib/taxonomy');
const { esc, shell } = require('./lib/page');

const GUIDES = [
  // In the order a partner follows them: build the connector, then list it.
  { src: 'docs/building-a-connector.md', out: 'building-a-connector.html', title: 'Step 1: Build your connector', nav: '1 · Build it' },
  { src: 'CONTRIBUTING.md', out: 'contributing.html', title: 'Step 2: List your connector', nav: '2 · List it' },
];

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

const GUIDE_CSS = `
h1 { font: 800 clamp(28px, 4vw, 38px)/1.1 var(--f-display); letter-spacing: -.02em; margin: 0 0 14px; }
.toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.toc a { font-size: 12.5px; color: var(--fg); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; }
.toc a:hover { border-color: var(--accent); color: var(--accent); }
article h2 { font: 700 21px/1.25 var(--f-display); margin: 32px 0 8px; padding-top: 18px; border-top: 1px solid var(--line); scroll-margin-top: 12px; }
article h3 { font: 700 16px var(--f-display); margin: 22px 0 6px; scroll-margin-top: 12px; }
article p, article li { max-width: 75ch; }
article code { font: 12.5px var(--f-mono); background: var(--sunken); padding: 1px 5px; border-radius: 5px; overflow-wrap: anywhere; }
article pre { background: var(--code-bg); color: var(--code-fg); border-radius: 10px; padding: 14px; overflow-x: auto; }
article pre code { background: none; padding: 0; color: inherit; overflow-wrap: normal; }
article table { border-collapse: collapse; width: 100%; font-size: 13.5px; display: block; overflow-x: auto; }
article th, article td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
article th { background: var(--sunken); }
article input[type="checkbox"] { margin-right: 6px; }
.foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
`;

function page(guide, { body, toc }, repoUrl) {
  const pager = `<nav class="pager" aria-label="Steps">${GUIDES.map((g) => (g === guide ? `<span aria-current="page">${esc(g.nav)}</span>` : `<a href="${g.out}">${esc(g.nav)}</a>`)).join('')}</nav>`;
  const source = repoUrl ? `<a href="${esc(`${repoUrl}/blob/main/${guide.src}`)}">Edit this page on GitHub</a>` : '';
  return shell({
    title: guide.title,
    root: '../',
    // "Add your connector" opens the steps drawer on the marketplace page.
    crumbs: [{ label: 'Connector Marketplace', href: '../' }, { label: 'Add your connector', href: '../#list-yours' }, { label: guide.title }],
    pager,
    narrow: true,
    css: GUIDE_CSS,
    body: `  <h1>${esc(guide.title)}</h1>
  <nav class="toc" aria-label="On this page">${toc.map((t) => `<a href="#${t.id}">${t.html}</a>`).join('')}</nav>
  <article>
${body}
  </article>
  <div class="foot">${source}</div>`,
  });
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
