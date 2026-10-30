#!/usr/bin/env node
'use strict';

// Checks every file in logos/: format, size, square shape, and (for SVG) no active content.
// Usage: node scripts/check-logos.js [logos/file.svg ...]

const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/taxonomy');

const MAX_BYTES = 100 * 1024;
const MIN_PX = 128;

function pngSize(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig || buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function svgSize(text) {
  const root = (text.match(/<svg\b[^>]*>/i) || [])[0];
  if (!root) return null;
  const vb = root.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
  const w = root.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const h = root.match(/\bheight\s*=\s*["']([\d.]+)/i);
  return w && h ? { width: Number(w[1]), height: Number(h[1]) } : null;
}

const SVG_FORBIDDEN = [
  [/<script\b/i, 'contains a <script> element'],
  [/\son[a-z]+\s*=/i, 'contains an inline event handler (on...=)'],
  [/<foreignObject\b/i, 'contains <foreignObject>'],
  [/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i, 'links to an external resource (only #fragment or data:image hrefs are allowed)'],
  [/javascript:/i, 'contains a javascript: URL'],
  [/<!ENTITY/i, 'declares XML entities'],
];

function checkLogo(file) {
  const rel = path.relative(ROOT, path.resolve(file));
  const problems = [];
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);

  if (!['.svg', '.png'].includes(ext)) return [`${rel}: only .svg and .png logos are allowed`];
  if (buf.length > MAX_BYTES) problems.push(`${rel}: ${Math.round(buf.length / 1024)} KB is larger than the ${MAX_BYTES / 1024} KB limit`);

  let size;
  if (ext === '.png') {
    size = pngSize(buf);
    if (!size) return [...problems, `${rel}: not a valid PNG file`];
    if (size.width < MIN_PX) problems.push(`${rel}: ${size.width}x${size.height}px is too small (min ${MIN_PX}x${MIN_PX})`);
  } else {
    const text = buf.toString('utf8');
    size = svgSize(text);
    if (!size) return [...problems, `${rel}: not a valid SVG (needs an <svg> root with a viewBox or width/height)`];
    for (const [re, why] of SVG_FORBIDDEN) if (re.test(text)) problems.push(`${rel}: SVG ${why}`);
  }
  if (Math.abs(size.width - size.height) > 0.5) problems.push(`${rel}: must be square (got ${size.width}x${size.height})`);
  return problems;
}

function main(argv) {
  const dir = path.join(ROOT, 'logos');
  const files = argv.length
    ? argv
    : fs.readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => path.join(dir, f));
  const problems = files.flatMap(checkLogo);
  for (const p of problems) {
    console.log(`✖ ${p}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${p.split(':')[0]}::${p}`);
  }
  console.log(problems.length ? `\n${problems.length} logo problem(s)` : `All ${files.length} logo(s) OK`);
  return problems.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { checkLogo };
