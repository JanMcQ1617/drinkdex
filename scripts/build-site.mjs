#!/usr/bin/env node
/**
 * Builds site-dist/, the public site for Netlify, from docs/: the same
 * pages GitHub Pages builds from main / docs, served from the domain root
 * instead of /drinkdex/.
 *
 *   node scripts/build-site.mjs            # docs/ -> site-dist/
 *   node scripts/build-site.mjs --check    # rebuild into a temp dir, check its pages and links, compare it with site-dist/; exit 1 on any problem
 *   node scripts/build-site.mjs --out DIR --baseurl /drinkdex
 *                                          # as Pages builds it (baseurl /drinkdex), for comparing with the live site
 *
 * WHY NOT JEKYLL. Pages runs Jekyll 3 with kramdown and a fixed set of
 * plugins; there is no Ruby toolchain for it here, and docs/ uses a small,
 * fixed part of it. This script does that part, and refuses anything else
 * rather than guessing, so a new tag or filter in docs/ stops the build
 * until it is taught here:
 *
 * - FILES. Like Jekyll: every file under docs/ except names starting with
 *   _ . or # (or ending in ~), and _config.yml's `exclude` (appstore.md,
 *   testflight.md). Files without front matter are copied byte for byte
 *   (index.html, c/, wine/*.csv, assets/, img/), as Pages copies them.
 * - MARKDOWN PAGES. Pages' jekyll-optional-front-matter makes every .md a
 *   page even without front matter, and also publishes the .md itself
 *   (Pages serves /privacy.md as text/markdown), so both are written here.
 *   jekyll-default-layout wraps each in _layouts/default.html, and
 *   jekyll-titles-from-headings takes page.title from the first # heading.
 * - LIQUID. Only what docs/ uses: {{ content }}, {{ page.x }}, {{ site.x }},
 *   string literals, the filters relative_url and default, and
 *   {% if %}/{% else %}/{% endif %} with and, or, == and !=. Anything else
 *   throws.
 * - KRAMDOWN, as Pages configures it (input GFM, auto_ids, smart quotes,
 *   typographic symbols, hard_wrap off), on top of marked:
 *   - heading ids by kramdown-parser-gfm's rule (lower case, everything
 *     but letters, digits, _, - and spaces dropped, spaces to -, repeats
 *     numbered), so the "On this page" list's #links are the same;
 *   - "straight" quotes curled and --, ---, ... turned into – — …, by a
 *     port of kramdown's own smart-quote rules (parser/kramdown/
 *     smart_quotes.rb), including where it curls the wrong way: Pages
 *     renders **Profile → "..."** with “…“, and so does this;
 *   - no bare-URL or bare-email autolinks (marked's GFM makes them,
 *     kramdown does not), <hr /> and <br /> as kramdown writes them.
 *   Checked against the live Pages site on 3 Nov 2026: every page's
 *   article matched once whitespace was normalised.
 * - THE BASE URL. relative_url prefixes site.baseurl, which Pages sets to
 *   /drinkdex for this project site. Here it is "" unless --baseurl says
 *   otherwise, so the layout's links are /support.html, /privacy.html and
 *   so on. index.html and c/index.html use relative links already.
 *
 * NETLIFY'S OWN FILES, written into site-dist/ (they are not in docs/,
 * because Pages has no use for them):
 * - _headers: security headers for every path. The Content-Security-Policy
 *   allows scripts from this site and, inline, only the exact scripts the
 *   pages carry, by their SHA-256 (computed from the output, so a script
 *   edited in docs/ is allowed by the next build and an injected one never
 *   is); connections to this site and to every https origin a page's own
 *   policy already allows (c/index.html's Supabase project). Inline styles
 *   stay allowed: the pages use style attributes and <style> blocks.
 * - _redirects: /privacy, /terms, /support, /data-deletion and every other
 *   page answer without .html, as they do on Pages (and as the App Store
 *   and Meta URLs are written), whatever Netlify's pretty-URL setting.
 *
 * The publish settings are in netlify.toml at the repo root. site-dist/ is
 * build output and is not committed (.gitignore).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Lexer, Marked, Parser } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs');
const DEFAULT_OUT = path.join(ROOT, 'site-dist');

/* ------------------------------------------------------------------ */
/* Arguments                                                            */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = { check: false, out: DEFAULT_OUT, baseurl: '', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const eq = a.indexOf('=');
      if (eq !== -1) return a.slice(eq + 1);
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--check') opts.check = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--out' || a.startsWith('--out=')) opts.out = path.resolve(value());
    else if (a === '--baseurl' || a.startsWith('--baseurl=')) opts.baseurl = value();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (opts.baseurl && !/^\/[^/]/.test(opts.baseurl)) throw new Error('--baseurl must start with / (e.g. /drinkdex), or be left out');
  opts.baseurl = opts.baseurl.replace(/\/+$/, '');
  return opts;
}

/* ------------------------------------------------------------------ */
/* YAML: the subset _config.yml and front matter use                   */
/* ------------------------------------------------------------------ */

/** `key: scalar` and `key:` followed by `- item` lines; comments and blank lines. Anything else throws. */
function parseYamlSubset(text, where) {
  const out = {};
  let listKey = null;
  const scalar = (raw) => {
    const v = raw.trim();
    if (v === '') return null;
    if (/^".*"$/.test(v)) return JSON.parse(v);
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (/^[[{&*!|>%@`]/.test(v)) throw new Error(`${where}: YAML value not supported here: ${v}`);
    return v;
  };
  for (const [n, line] of text.split('\n').entries()) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const item = /^\s+-\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      out[listKey].push(scalar(item[1].replace(/\s+#.*$/, '')));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!kv) throw new Error(`${where}:${n + 1}: YAML line not supported here: ${line}`);
    const rest = (kv[2] ?? '').replace(/\s+#.*$/, '');
    if (rest.trim() === '') {
      out[kv[1]] = [];
      listKey = kv[1];
    } else {
      out[kv[1]] = scalar(rest);
      listKey = null;
    }
  }
  // A key with nothing under it is null, not an empty list.
  for (const [k, v] of Object.entries(out)) if (Array.isArray(v) && v.length === 0) out[k] = null;
  return out;
}

/** Jekyll's front matter: --- at the very start, then YAML, then --- or ... on a line of its own. */
const FRONT_MATTER = /^(---\s*\n[\s\S]*?\n?)^((---|\.\.\.)\s*$\n?)/m;

function splitFrontMatter(text, where) {
  if (!text.startsWith('---')) return null;
  const m = FRONT_MATTER.exec(text);
  if (!m || m.index !== 0) return null;
  const yaml = m[1].replace(/^---\s*\n/, '');
  return { data: parseYamlSubset(yaml, where), body: text.slice(m[0].length) };
}

/* ------------------------------------------------------------------ */
/* Liquid: exactly the part docs/ uses                                  */
/* ------------------------------------------------------------------ */

function relativeUrl(input, baseurl) {
  if (input == null) return input;
  const s = String(input);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s; // absolute URL: as is
  const lead = (p) => (p === '' || p.startsWith('/') ? p : '/' + p);
  return lead(baseurl) + lead(s);
}

function makeLiquid(ctx, where) {
  const lookup = (expr) => {
    expr = expr.trim();
    if (/^'[^']*'$|^"[^"]*"$/.test(expr)) return expr.slice(1, -1);
    if (expr === 'nil' || expr === 'null') return null;
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (/^-?\d+$/.test(expr)) return Number(expr);
    const parts = expr.split('.');
    if (!/^[A-Za-z_]\w*(\.[A-Za-z_][\w-]*)*$/.test(expr)) throw new Error(`${where}: Liquid expression not supported: ${expr}`);
    if (!(parts[0] in ctx)) throw new Error(`${where}: unknown Liquid variable: ${expr}`);
    let v = ctx[parts[0]];
    for (const p of parts.slice(1)) v = v == null ? null : v[p];
    return v === undefined ? null : v;
  };
  const isEmpty = (v) => v == null || v === false || v === '';
  const applyFilters = (raw) => {
    // Split on | outside quotes.
    const segs = raw.match(/(?:'[^']*'|"[^"]*"|[^|])+/g).map((s) => s.trim());
    let v = lookup(segs[0]);
    for (const f of segs.slice(1)) {
      const m = /^([a-z_]+)(?:\s*:\s*(.*))?$/.exec(f);
      if (!m) throw new Error(`${where}: Liquid filter not supported: ${f}`);
      if (m[1] === 'relative_url' && m[2] === undefined) v = relativeUrl(v, ctx.site.baseurl ?? '');
      else if (m[1] === 'default' && m[2] !== undefined) v = isEmpty(v) ? lookup(m[2]) : v;
      else throw new Error(`${where}: Liquid filter not supported: ${f}`);
    }
    return v;
  };
  const truthy = (v) => v !== null && v !== undefined && v !== false; // Liquid: only nil and false are false
  const evalCond = (cond) => {
    const ors = cond.split(/\s+or\s+/);
    // Liquid evaluates and/or right to left without precedence; docs/ never mixes them, so refuse a mix.
    if (ors.length > 1 && /\s+and\s+/.test(cond)) throw new Error(`${where}: Liquid condition mixes and/or: ${cond}`);
    const one = (c) => {
      const m = /^(.+?)\s*(==|!=)\s*(.+)$/.exec(c.trim());
      if (m) {
        const a = lookup(m[1]);
        const b = lookup(m[3]);
        return m[2] === '==' ? a === b : a !== b;
      }
      return truthy(lookup(c));
    };
    if (ors.length > 1) return ors.some(one);
    return cond.split(/\s+and\s+/).every(one);
  };
  const toS = (v) => (v == null ? '' : Array.isArray(v) ? v.join('') : String(v));

  return function render(template) {
    // Tokenise into text, {{ output }} and {% tag %}.
    const re = /\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g;
    const tokens = [];
    let last = 0;
    let m;
    while ((m = re.exec(template))) {
      if (m.index > last) tokens.push({ t: 'text', v: template.slice(last, m.index) });
      if (m[1] !== undefined) tokens.push({ t: 'out', v: m[1].trim() });
      else tokens.push({ t: 'tag', v: m[2].trim() });
      last = re.lastIndex;
    }
    if (last < template.length) tokens.push({ t: 'text', v: template.slice(last) });
    if (/\{\{|\{%/.test(tokens.filter((x) => x.t === 'text').map((x) => x.v).join(''))) {
      throw new Error(`${where}: an unclosed {{ or {% in the template`);
    }

    // if / else / endif, nested.
    let i = 0;
    const block = (stopAt) => {
      let s = '';
      while (i < tokens.length) {
        const tok = tokens[i];
        if (tok.t === 'tag') {
          const name = tok.v.split(/\s+/)[0];
          if (stopAt.includes(name)) return { s, stop: name };
          if (name === 'if') {
            i++;
            const cond = tok.v.slice(2).trim();
            const yes = block(['else', 'endif']);
            let no = { s: '' };
            if (yes.stop === 'else') {
              i++;
              no = block(['endif']);
            }
            if (tokens[i]?.v !== 'endif') throw new Error(`${where}: {% if %} without {% endif %}`);
            i++;
            s += evalCond(cond) ? yes.s : no.s;
            continue;
          }
          throw new Error(`${where}: Liquid tag not supported: {% ${tok.v} %}`);
        }
        s += tok.t === 'text' ? tok.v : toS(applyFilters(tok.v));
        i++;
      }
      if (stopAt.length) throw new Error(`${where}: missing {% ${stopAt.at(-1)} %}`);
      return { s, stop: null };
    };
    return block([]).s;
  };
}

/* ------------------------------------------------------------------ */
/* kramdown's typography: smart quotes and symbols                      */
/* ------------------------------------------------------------------ */

/*
 * kramdown scans a paragraph's text left to right; at the first place any
 * span parser can start, the text before it is plain, and that parser takes
 * over. The smart-quote parser's start pattern is /[^\\]?["']/, so it
 * starts ON the character before a quote when that character is still
 * plain text, and its rules (SQ_RULES, tried in order, anchored there) see
 * it; when that character was already taken by another parser (the * of
 * **, a [, a backtick, an entity, the … of ...), the rules start on the
 * quote itself. The rules look ahead into the raw source, past ** and ],
 * which is where kramdown's odd curls come from. This port walks the raw
 * inline source the same way and writes the curled characters into it,
 * before marked tokenises it.
 */
const WS = ' \\t\\r\\n\\f\\v'; // Ruby's \s
const SQ_PUNCT = "[!\"#$%'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~]";
const SQ_CLOSE = `[^ \\\\\\t\\r\\n\\[{(\\-]`;
const SQ_RULES = [
  [new RegExp(`^("|')(?=[_*]{1,2}[^${WS}])`), ['lquote1']],
  [new RegExp(`^("|')(?=${SQ_PUNCT}(?!\\.\\.)\\B)`), ['rquote1']],
  [new RegExp(`^([${WS}]?)"'(?=\\w)`), [1, 'ldquo', 'lsquo']],
  [new RegExp(`^([${WS}]?)'"(?=\\w)`), [1, 'lsquo', 'ldquo']],
  [new RegExp(`^([${WS}]?)'(?=\\d\\ds)`), [1, 'rsquo']],
  [new RegExp(`^([${WS}])('|")(?=\\w)`), [1, 'lquote2']],
  [new RegExp(`^(${SQ_CLOSE}[${WS}]*)('|")`), [1, 'rquote2']],
  [new RegExp(`^("|')(?=[${WS}]|s\\b|$)`, 'm'), ['rquote1']],
  [/^([\s\S]?)'/, [1, 'lsquo']],
  [/^([\s\S]?)"/, [1, 'ldquo']],
];
const QUOTE_CHAR = { ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
const QUOTE_SUBST = { rquote: { '"': 'rdquo', "'": 'rsquo' }, lquote: { '"': 'ldquo', "'": 'lsquo' } };
const TYPO = [
  ['---', '—'],
  ['--', '–'],
  ['...', '…'],
  ['\\<<', '&lt;&lt;'],
  ['\\>>', '&gt;&gt;'],
  ['<< ', '« '],
  [' >>', ' »'],
  ['<<', '«'],
  ['>>', '»'],
];

/** Apply one smart quote at `s` (the rule's view: the plain character before, if any, then the quote onward). */
function smartQuote(s) {
  for (const [re, substs] of SQ_RULES) {
    const m = re.exec(s);
    if (!m) continue;
    let out = '';
    for (const sub of substs) {
      if (typeof sub === 'number') out += m[sub];
      else if (QUOTE_CHAR[sub]) out += QUOTE_CHAR[sub];
      else {
        const kind = sub.slice(0, -1); // lquote / rquote
        const group = Number(sub.slice(-1));
        out += QUOTE_CHAR[QUOTE_SUBST[kind][m[group]]];
      }
    }
    return { out, used: m[0].length };
  }
  throw new Error('smart quote: no rule matched'); // the last two rules match any quote
}

/** The inline source with kramdown's typography applied; code, HTML, entities, escapes and link targets untouched. */
function kramdownTypography(src) {
  let out = '';
  let i = 0;
  let prevPlain = false; // was src[i-1] plain text, still visible to the smart-quote rules?
  let bracketDepth = 0;
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    // Escapes: \x is taken whole by escaped_chars.
    if (c === '\\' && i + 1 < src.length) {
      // kramdown's own \<< and \>> are typographic symbols, not escapes.
      const t = TYPO.find(([k]) => k.startsWith('\\') && rest.startsWith(k));
      if (t) {
        out += t[0];
        i += t[0].length;
      } else {
        out += src.slice(i, i + 2);
        i += 2;
      }
      prevPlain = false;
      continue;
    }
    // Code spans: a run of backticks to the next run of the same length.
    if (c === '`') {
      const run = /^`+/.exec(rest)[0];
      const close = src.indexOf(run, i + run.length);
      const end = close === -1 ? i + run.length : close + run.length;
      out += src.slice(i, end);
      i = end;
      prevPlain = false;
      continue;
    }
    // Autolinks and inline HTML: <http…>, <a@b>, <tag …>, </tag>, <!-- -->.
    if (c === '<') {
      const tag = /^<(?:[a-z][a-z0-9+.-]*:[^\s<>]*|[^\s<>@]+@[^\s<>]+|\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?|!--[\s\S]*?--)>/.exec(rest);
      if (tag) {
        out += tag[0];
        i += tag[0].length;
        prevPlain = false;
        continue;
      }
    }
    // Entities.
    if (c === '&') {
      const ent = /^&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.exec(rest);
      if (ent) {
        out += ent[0];
        i += ent[0].length;
        prevPlain = false;
        continue;
      }
    }
    // Emphasis and strikethrough delimiters: always taken by their parsers, valid or not.
    if (c === '*' || c === '_' || (c === '~' && src[i + 1] === '~')) {
      const run = c === '~' ? '~~' : /^[*_]+/.exec(rest)[0];
      out += run;
      i += run.length;
      prevPlain = false;
      continue;
    }
    // Links: [ and ![ are taken by the link parser; inside one, ] ends the text and the target is skipped.
    if (c === '[' || (c === '!' && src[i + 1] === '[')) {
      const open = c === '!' ? '![' : '[';
      out += open;
      i += open.length;
      bracketDepth++;
      prevPlain = false;
      continue;
    }
    if (c === ']' && bracketDepth > 0) {
      bracketDepth--;
      out += ']';
      i++;
      const target = /^\((?:<[^>]*>|[^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|^\[[^\]]*\]/.exec(src.slice(i));
      if (target) {
        out += target[0];
        i += target[0].length;
      }
      prevPlain = false;
      continue;
    }
    // A quote, with the plain character before it if there is one.
    if (c === '"' || c === "'") {
      let view = rest;
      let back = 0;
      if (prevPlain) {
        // One character, as Ruby counts them: a surrogate pair is one.
        back = i >= 2 && /[\uDC00-\uDFFF]/.test(src[i - 1]) && /[\uD800-\uDBFF]/.test(src[i - 2]) ? 2 : 1;
        view = src.slice(i - back);
        out = out.slice(0, -back);
      }
      const { out: q, used } = smartQuote(view);
      out += q;
      i += used - back;
      prevPlain = false;
      continue;
    }
    // Typographic symbols.
    const t = TYPO.find(([k]) => !k.startsWith('\\') && rest.startsWith(k));
    if (t) {
      out += t[1];
      i += t[0].length;
      prevPlain = false;
      continue;
    }
    out += c;
    i++;
    prevPlain = true;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Markdown, as kramdown renders it                                     */
/* ------------------------------------------------------------------ */

/** kramdown-parser-gfm's generate_gfm_header_id. */
function gfmHeaderId(raw, seen) {
  let id = raw.toLowerCase().replace(/[^\p{L}\p{M}\p{Nd}\p{Pc}\- \t]/gu, '').replace(/[ \t]/g, '-');
  const n = (seen.get(id) ?? 0) + 1;
  seen.set(id, n);
  if (n > 1) id += `-${n - 1}`;
  return id;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function makeMarkdown() {
  let seen = new Map();
  const marked = new Marked({
    gfm: true,
    breaks: false,
    tokenizer: {
      // kramdown does not turn a bare URL or email address into a link.
      url() {
        return undefined;
      },
    },
    renderer: {
      heading(token) {
        const id = gfmHeaderId(token.text, seen);
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      hr() {
        return '<hr />\n';
      },
      list(token) {
        // kramdown numbers every ordered list from 1: it writes no start attribute, whatever the first number.
        if (token.ordered) token.start = 1;
        return false;
      },
      br() {
        return '<br />';
      },
      codespan(token) {
        return `<code class="language-plaintext highlighter-rouge">${escapeHtml(token.text)}</code>`;
      },
      code(token) {
        const lang = (token.lang || 'plaintext').split(/\s+/)[0];
        return `<div class="language-${lang} highlighter-rouge"><div class="highlight"><pre class="highlight"><code>${escapeHtml(token.text)}\n</code></pre></div></div>\n`;
      },
    },
  });
  const options = marked.defaults;

  class KramdownLexer extends Lexer {
    #depth = 0;
    inlineTokens(src, tokens = []) {
      // Typography once per block, on its whole inline source; the nested calls (inside ** or a link) see it done.
      if (this.#depth === 0) src = kramdownTypography(src);
      this.#depth++;
      try {
        return super.inlineTokens(src, tokens);
      } finally {
        this.#depth--;
      }
    }
  }

  return {
    toHtml(md) {
      seen = new Map();
      const tokens = new KramdownLexer(options).lex(md);
      return Parser.parse(tokens, options);
    },
    /** jekyll-titles-from-headings: markdownify, strip_html, normalize_whitespace. */
    titleFrom(md) {
      const m = /^\s*(?:#{1,3}\s+(.*)|(.*)\r?\n[-=]+\s*)$/m.exec(md);
      if (!m || md.slice(0, m.index).trim() !== '') return null;
      const text = (m[1] ?? m[2]).replace(/\s+#+\s*$/, '');
      const html = this.toHtml(text);
      return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    },
  };
}

/* ------------------------------------------------------------------ */
/* The site                                                             */
/* ------------------------------------------------------------------ */

const JEKYLL_DEFAULT_EXCLUDE = ['.sass-cache', '.jekyll-cache', 'gemfiles', 'Gemfile', 'Gemfile.lock', 'node_modules', 'vendor/bundle', 'vendor/cache', 'vendor/gems', 'vendor/ruby'];
const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mkdown', '.mkdn', '.mkd']);

function walk(dir, rel = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push({ rel: r, abs, dir: true }, ...walk(abs, r));
    else out.push({ rel: r, abs, dir: false });
  }
  return out;
}

function build(outDir, { baseurl }) {
  const configPath = path.join(SRC, '_config.yml');
  const config = fs.existsSync(configPath) ? parseYamlSubset(fs.readFileSync(configPath, 'utf8'), 'docs/_config.yml') : {};
  const site = { ...config, baseurl };
  const exclude = [...JEKYLL_DEFAULT_EXCLUDE, ...(config.exclude ?? [])].map((e) => String(e).replace(/\/+$/, ''));
  const include = (config.include ?? ['.htaccess']).map(String);
  for (const e of exclude) if (/[*?[]/.test(e)) throw new Error(`docs/_config.yml: exclude pattern with a glob is not supported here: ${e}`);

  const layouts = new Map();
  const layoutsDir = path.join(SRC, '_layouts');
  if (fs.existsSync(layoutsDir)) {
    for (const f of fs.readdirSync(layoutsDir)) {
      if (!f.endsWith('.html')) continue;
      const text = fs.readFileSync(path.join(layoutsDir, f), 'utf8');
      const fm = splitFrontMatter(text, `docs/_layouts/${f}`);
      if (fm?.data?.layout) throw new Error(`docs/_layouts/${f}: nested layouts are not supported here`);
      layouts.set(f.replace(/\.html$/, ''), fm ? fm.body : text);
    }
  }

  const md = makeMarkdown();
  const skipped = (rel) => {
    const parts = rel.split('/');
    if (include.some((inc) => rel === inc || rel.startsWith(inc + '/'))) return false;
    if (parts.some((p) => /^[_.#]/.test(p) || p.endsWith('~'))) return true;
    return exclude.some((e) => rel === e || rel.startsWith(e + '/'));
  };

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  const write = (rel, data) => {
    const abs = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
    written.push(rel);
  };

  for (const entry of walk(SRC)) {
    if (entry.dir || skipped(entry.rel)) continue;
    const ext = path.extname(entry.rel).toLowerCase();
    const isMd = MARKDOWN_EXT.has(ext);
    const buf = fs.readFileSync(entry.abs);
    const text = isMd || ext === '.html' || ext === '.htm' ? buf.toString('utf8') : null;
    const fm = text != null ? splitFrontMatter(text, `docs/${entry.rel}`) : null;

    if (!isMd && !fm) {
      write(entry.rel, buf); // a static file, byte for byte
      continue;
    }

    const where = `docs/${entry.rel}`;
    const data = fm?.data ?? {};
    let body = fm ? fm.body : text;
    const outRel = isMd ? entry.rel.slice(0, -ext.length) + '.html' : entry.rel;
    const page = { ...data, url: '/' + outRel, path: entry.rel };
    if (isMd && page.title == null) {
      const t = md.titleFrom(body);
      if (t) page.title = t;
    }
    body = makeLiquid({ page, site }, where)(body);
    let html = isMd ? md.toHtml(body) : body;
    const layoutName = data.layout === undefined ? 'default' : data.layout;
    if (layoutName != null && layoutName !== false) {
      const layout = layouts.get(String(layoutName));
      if (layout === undefined) {
        // Jekyll only warns; for a page this site serves, a missing layout is a mistake.
        if (data.layout !== undefined) throw new Error(`${where}: layout "${layoutName}" not found in docs/_layouts`);
      } else {
        html = makeLiquid({ page, site, content: html }, `docs/_layouts/${layoutName}.html`)(layout);
      }
    }
    write(outRel, html);
    // Pages publishes a markdown page's source beside it, as a static file.
    if (isMd && !fm) write(entry.rel, buf);
  }

  writeNetlifyFiles(outDir, written, write);
  return written.sort();
}

/* ------------------------------------------------------------------ */
/* Netlify: _headers and _redirects                                     */
/* ------------------------------------------------------------------ */

function writeNetlifyFiles(outDir, written, write) {
  const htmlFiles = written.filter((r) => r.endsWith('.html'));
  const scriptHashes = new Set();
  const connect = new Set(["'self'"]);
  for (const rel of htmlFiles) {
    const html = fs.readFileSync(path.join(outDir, rel), 'utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(m[1])) continue;
      if (/\btype\s*=\s*["']?(?!text\/javascript|module)/i.test(m[1])) continue; // data blocks are not run
      scriptHashes.add(`'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
    }
    if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, ''))) {
      throw new Error(`${rel}: an inline event handler (on…=) would be blocked by the policy; move it into a script`);
    }
    // Origins a page's own policy lets it connect to: the site's policy must allow them too, or the two together block them.
    for (const m of html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi)) {
      const directive = m[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src '));
      for (const src of directive?.split(/\s+/).slice(1) ?? []) if (/^https:\/\//.test(src)) connect.add(src);
    }
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${[...scriptHashes].sort().join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "media-src 'self'",
    `connect-src ${[...connect].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  const headers = [
    '# Written by scripts/build-site.mjs; edit the script, not this file.',
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Strict-Transport-Security: max-age=31536000',
    '',
  ].join('\n');
  write('_headers', headers);

  // Every page answers without .html, as on Pages. 200: a rewrite, the address stays as typed.
  const redirects = ['# Written by scripts/build-site.mjs; edit the script, not this file.'];
  for (const rel of htmlFiles.sort()) {
    if (rel === 'index.html' || rel.endsWith('/index.html')) continue;
    redirects.push(`/${rel.slice(0, -'.html'.length)}  /${rel}  200`);
  }
  write('_redirects', redirects.join('\n') + '\n');
}

/* ------------------------------------------------------------------ */
/* --check: the site itself                                             */
/* ------------------------------------------------------------------ */

/*
 * What a visitor would hit: every page wrapped in its layout with no
 * Liquid left in it, and every link, image, script, stylesheet, font and
 * #fragment on this site resolving the way Netlify resolves it (a file;
 * a folder's index.html; /x as x.html; a _redirects rewrite). Links off
 * the site are not fetched.
 */
function checkSite(dir, baseurl) {
  const problems = [];
  const files = new Set(listFiles(dir));
  const rewrites = new Map();
  if (files.has('_redirects')) {
    for (const line of fs.readFileSync(path.join(dir, '_redirects'), 'utf8').split('\n')) {
      const m = /^(\/\S*)\s+(\/\S*)\s+200!?$/.exec(line.trim());
      if (m) rewrites.set(m[1], m[2]);
    }
  }
  /** A site path (no base, no query) to the file Netlify would serve, or null. */
  const resolve = (p) => {
    let rel = decodeURIComponent(p).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) return files.has(rel + 'index.html') ? rel + 'index.html' : null;
    if (files.has(rel)) return rel;
    if (files.has(rel + '.html')) return rel + '.html';
    if (files.has(rel + '/index.html')) return rel + '/index.html';
    const to = rewrites.get('/' + rel) ?? rewrites.get('/' + rel.replace(/\/$/, ''));
    return to && files.has(to.slice(1)) ? to.slice(1) : null;
  };
  const idsCache = new Map();
  const idsOf = (rel) => {
    if (!idsCache.has(rel)) {
      const html = fs.readFileSync(path.join(dir, rel), 'utf8');
      idsCache.set(rel, new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
    }
    return idsCache.get(rel);
  };
  const decodeAttr = (v) => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  let checked = 0;

  const checkRef = (fromRel, raw, what) => {
    const ref = decodeAttr(raw.trim());
    if (ref === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) return; // off the site, or a scheme (mailto:, data:)
    checked++;
    const fromUrl = new URL(`https://site.invalid${baseurl}/` + fromRel.replace(/(^|\/)index\.html$/, '$1'));
    const url = new URL(ref, fromUrl);
    let sitePath = url.pathname;
    if (baseurl) {
      if (!sitePath.startsWith(baseurl + '/') && sitePath !== baseurl) {
        problems.push(`${fromRel}: ${what} ${ref} is outside ${baseurl}/`);
        return;
      }
      sitePath = sitePath.slice(baseurl.length) || '/';
    }
    const target = resolve(sitePath);
    if (!target) {
      problems.push(`${fromRel}: ${what} ${ref} does not resolve`);
      return;
    }
    const frag = decodeURIComponent(url.hash.slice(1));
    if (frag && target.endsWith('.html') && !idsOf(target).has(frag)) problems.push(`${fromRel}: ${what} ${ref}: no #${frag} in ${target}`);
  };

  for (const rel of files) {
    if (rel.endsWith('.html')) {
      const html = fs.readFileSync(path.join(dir, rel), 'utf8');
      const body = html.replace(/<!--[\s\S]*?-->/g, '');
      if (/\{\{|\{%/.test(body)) problems.push(`${rel}: Liquid left in the page ({{ or {%)`);
      if (!/<html[\s>]/i.test(body) || !/<\/html>\s*$/i.test(body)) problems.push(`${rel}: not a whole document (<html> … </html>)`);
      const source = rel.replace(/\.html$/, '.md');
      if (files.has(source) && !/<article class="prose" id="prose">/.test(body)) problems.push(`${rel}: not wrapped in _layouts/default.html`);
      for (const m of body.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
        for (const a of m[2].matchAll(/\s(href|src|poster|srcset|action)\s*=\s*"([^"]*)"/gi)) {
          const name = a[1].toLowerCase();
          if (name === 'srcset') for (const part of a[2].split(',')) checkRef(rel, part.trim().split(/\s+/)[0], `<${m[1]} srcset>`);
          else checkRef(rel, a[2], `<${m[1]} ${name}>`);
        }
      }
      // Paths the pages' scripts load: a quoted relative path to a file type this site serves.
      for (const s of body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        for (const q of s[1].matchAll(/['"]((?:\.\.\/|\.\/)?[\w./-]+\.(?:mp4|webp|png|svg|json|js|css|woff2))['"]/g)) checkRef(rel, q[1], 'script path');
      }
    } else if (rel.endsWith('.css')) {
      const css = fs.readFileSync(path.join(dir, rel), 'utf8');
      for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) checkRef(rel, m[1], 'url()');
    }
  }
  return { problems, checked };
}

/* ------------------------------------------------------------------ */
/* --check: against site-dist/                                          */
/* ------------------------------------------------------------------ */

function listFiles(dir) {
  if (!fs.existsSync(dir)) return null;
  return walk(dir)
    .filter((e) => !e.dir)
    .map((e) => e.rel)
    .sort();
}

function compareDirs(expectedDir, actualDir) {
  const want = listFiles(expectedDir);
  const have = listFiles(actualDir);
  if (have == null) return [`${shown(actualDir)}/ does not exist: run node scripts/build-site.mjs`];
  const problems = [];
  const haveSet = new Set(have);
  const wantSet = new Set(want);
  for (const f of want) if (!haveSet.has(f)) problems.push(`missing: ${f}`);
  for (const f of have) if (!wantSet.has(f)) problems.push(`not from docs/ any more: ${f}`);
  for (const f of want) {
    if (!haveSet.has(f)) continue;
    const a = fs.readFileSync(path.join(expectedDir, f));
    const b = fs.readFileSync(path.join(actualDir, f));
    if (!a.equals(b)) problems.push(`differs: ${f}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */

/** A directory as the messages name it: from the repo root when it is inside it. */
const shown = (dir) => {
  const r = path.relative(ROOT, dir);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : dir;
};

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.check) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sipply-site-'));
    let failed = false;
    const report = (title, problems) => {
      console.error(`${title} (${problems.length}):`);
      for (const p of problems.slice(0, 50)) console.error(`  ${p}`);
      if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`);
      failed = true;
    };
    try {
      build(tmp, opts);
      const site = checkSite(tmp, opts.baseurl);
      if (site.problems.length) report('The site built from docs/ has problems', site.problems);
      else if (!opts.quiet) console.log(`Pages, layouts and links: ${site.checked} links on this site, all resolve.`);
      const drift = compareDirs(tmp, opts.out);
      if (drift.length) {
        report(`${shown(opts.out)}/ is out of date with docs/`, drift);
        console.error('Run: node scripts/build-site.mjs');
      } else if (!opts.quiet) console.log(`${shown(opts.out)}/ matches docs/ (${listFiles(tmp).length} files).`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (failed) process.exit(1);
    return;
  }
  const files = build(opts.out, opts);
  if (!opts.quiet) {
    const pages = files.filter((f) => f.endsWith('.html'));
    console.log(`Built ${shown(opts.out)}/: ${files.length} files, ${pages.length} pages${opts.baseurl ? `, baseurl ${opts.baseurl}` : ''}.`);
  }
}

export { build, checkSite, kramdownTypography };

// Run when called as a script; importing it (to test a piece) runs nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
