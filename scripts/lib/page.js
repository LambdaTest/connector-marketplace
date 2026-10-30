'use strict';

// The HTML shell shared by generated pages (connector pages and guides):
// head, shared stylesheet, breadcrumb and optional step navigation.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** crumbs: [{ label, href? }]; the last one is the current page. */
function breadcrumb(crumbs) {
  const items = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<li><span aria-current="page">${esc(c.label)}</span></li>` : `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`,
  );
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.join('')}</ol></nav>`;
}

/**
 * root: relative path back to the site root ("../" or "../../").
 * pager: optional HTML shown opposite the breadcrumb.
 */
function shell({ title, description, root, crumbs, pager = '', body, css = '', script = '', narrow = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · TestMu AI Connector Marketplace</title>
${description ? `<meta name="description" content="${esc(description)}">\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@500;600;700&family=Geist+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${root}assets/base.css">
${css ? `<style>\n${css}\n</style>\n` : ''}</head>
<body>
<div class="wrap${narrow ? ' narrow' : ''}">
  <div class="topbar">${breadcrumb(crumbs)}${pager}</div>
${body}
</div>
${script ? `<script>\n${script}\n</script>\n` : ''}</body>
</html>
`;
}

module.exports = { esc, breadcrumb, shell };
