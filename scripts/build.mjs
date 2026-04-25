import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import posthtml from 'posthtml';
import include from 'posthtml-include';
import { bundle } from 'lightningcss';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(process.argv[2] || path.join(ROOT_DIR, 'dist'));
const MINIFIER_MODE = process.env.HTML_MINIFIER_MODE || 'max';
const MINIFIER_BIN = path.join(ROOT_DIR, 'node_modules', '.bin', 'html-minifier-next');
const CONTENT_DIR = path.join(ROOT_DIR, 'content', 'articles');
const ARTICLE_TEMPLATE = path.join(ROOT_DIR, 'src', 'templates', 'article.html');
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

async function gatherHtmlFiles() {
  const roots = [
    path.join(ROOT_DIR, 'index.html'),
    path.join(ROOT_DIR, 'about'),
    path.join(ROOT_DIR, 'writing'),
  ];

  const files = [];

  async function walk(target) {
    const stat = await fs.stat(target);
    if (stat.isFile()) {
      if (target.endsWith('.html')) files.push(target);
      return;
    }

    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      await walk(path.join(target, entry.name));
    }
  }

  for (const root of roots) {
    await walk(root);
  }

  return files.sort();
}

async function gatherMarkdownFiles() {
  const files = [];

  async function walk(target) {
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(CONTENT_DIR);
  return files.sort();
}

function resolveProjectPath(filePath, fromFile) {
  if (filePath.startsWith('/')) {
    return path.join(ROOT_DIR, filePath.slice(1));
  }
  return path.resolve(path.dirname(fromFile), filePath);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function uniqueSlug(base, seen) {
  const current = seen.get(base) || 0;
  seen.set(base, current + 1);
  return current === 0 ? base : `${base}-${current + 1}`;
}

function interpolate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? '');
}

function normalizeDate(value) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value);
}

function renderMarkdown(content) {
  const tokens = markdown.parse(content, {});
  const headings = [];
  const seenSlugs = new Map();
  let leadAssigned = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'paragraph_open' && !leadAssigned) {
      token.attrJoin('class', 'lead');
      leadAssigned = true;
    }

    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      const inlineToken = tokens[index + 1];
      const headingText = inlineToken?.content?.trim();

      if (!headingText) {
        continue;
      }

      const id = uniqueSlug(slugify(headingText), seenSlugs);
      token.attrSet('id', id);

      if (level === 2) {
        headings.push({ id, text: headingText });
      }
    }

    if (token.type === 'blockquote_open') {
      token.attrJoin('class', 'dialogue');
    }
  }

  return {
    body: markdown.renderer.render(tokens, markdown.options, {}),
    headings,
  };
}

function renderToc(headings) {
  if (headings.length === 0) {
    return '';
  }

  const items = headings
    .map(({ id, text }) => (
      `          <li class="toc-item"><a class="toc-link" href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`
    ))
    .join('\n');

  return `<aside class="toc" aria-label="Table of contents">
      <p class="toc-title">Table of Contents</p>
      <nav aria-label="Article sections">
        <ol class="toc-list">
${items}
        </ol>
      </nav>
    </aside>`;
}

function renderHero(article) {
  if (!article.hero) {
    return '';
  }

  const width = article.heroWidth || 960;
  const height = article.heroHeight || 420;
  const alt = article.heroAlt || '';

  return `<img class="hero-image" src="${escapeHtml(article.hero)}" width="${escapeHtml(width)}" height="${escapeHtml(height)}" alt="${escapeHtml(alt)}" />`;
}

function renderArticleList(articles) {
  return articles
    .map((article) => (
      `        <li>
          <time datetime="${escapeHtml(article.month)}">${escapeHtml(article.month)}:</time>
          <a class="article-link-${escapeHtml(slugify(article.slug))}" href="/articles/${escapeHtml(article.slug)}/">${escapeHtml(article.title)}</a>
        </li>`
    ))
    .join('\n');
}

function renderArticleIndex(articles) {
  return articles
    .map((article) => (
      `        <li class="writing-item">
          <time class="writing-date" datetime="${escapeHtml(article.date)}">${escapeHtml(article.date)}</time>
          <div>
            <h3 class="writing-title"><a href="/articles/${escapeHtml(article.slug)}/">${escapeHtml(article.title)}</a></h3>
            <p class="writing-summary">${escapeHtml(article.description)}</p>
          </div>
        </li>`
    ))
    .join('\n');
}

function markCurrentNav(html, relPath) {
  let href = '';
  if (relPath === path.join('about', 'index.html') || relPath.startsWith(`about${path.sep}`)) {
    href = '/about/';
  } else if (relPath === path.join('writing', 'index.html') || relPath.startsWith(`writing${path.sep}`)) {
    href = '/writing/';
  }

  if (!href) {
    return html;
  }

  return html.replace(
    new RegExp(`<a href="${href.replaceAll('/', '\\/')}"`, 'g'),
    `<a aria-current="page" href="${href}"`,
  );
}

async function loadArticles() {
  const files = await gatherMarkdownFiles();
  const template = await fs.readFile(ARTICLE_TEMPLATE, 'utf8');
  const articles = [];

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const { data, content } = matter(source);
    const slug = data.slug || path.basename(file, '.md');

    if (!data.title || !data.description || !data.date) {
      throw new Error(`Missing required front matter in ${path.relative(ROOT_DIR, file)}`);
    }

    const { body, headings } = renderMarkdown(content);
    const date = normalizeDate(data.date);
    const article = {
      title: String(data.title),
      description: String(data.description),
      date,
      month: date.slice(0, 7),
      slug,
      hero: data.hero ? String(data.hero) : '',
      heroAlt: data.heroAlt ? String(data.heroAlt) : '',
      heroWidth: data.heroWidth ? Number(data.heroWidth) : 960,
      heroHeight: data.heroHeight ? Number(data.heroHeight) : 420,
      body,
      headings,
      template,
    };

    articles.push(article);
  }

  articles.sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title));
  return articles;
}

function inlineBundledStyles(html, fromFile) {
  return html.replace(/<link\b([^>]*?)data-inline(?:=(?:"[^"]*"|'[^']*'))?([^>]*)>/gi, (full, before, after) => {
    const attrs = `${before} ${after}`;
    const hrefMatch = attrs.match(/href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (!hrefMatch) {
      throw new Error(`Missing href on data-inline stylesheet in ${fromFile}`);
    }

    const href = hrefMatch[1] || hrefMatch[2] || hrefMatch[3];
    const filename = resolveProjectPath(href, fromFile);
    const { code } = bundle({
      filename,
      minify: true,
      sourceMap: false,
      targets: {
        safari: 16 << 16,
        chrome: 111 << 16,
        firefox: 128 << 16,
      },
    });

    return `<style>${code.toString()}</style>`;
  });
}

async function minifyHtml(html) {
  const tmpIn = path.join(OUT_DIR, '.tmp-minify-input.html');
  const tmpOut = path.join(OUT_DIR, '.tmp-minify-output.html');

  const flags = [
    '--collapse-whitespace',
    '--remove-comments',
    '--remove-redundant-attributes',
    '--remove-script-type-attributes',
    '--remove-style-link-type-attributes',
    '--use-short-doctype',
    '--minify-css', 'true',
    '--minify-js', 'true',
  ];

  if (MINIFIER_MODE === 'safe') {
    flags.push('--conservative-collapse');
  } else {
    flags.push(
      '--collapse-boolean-attributes',
      '--remove-empty-attributes',
      '--remove-attribute-quotes',
      '--remove-optional-tags',
      '--collapse-inline-tag-whitespace',
    );
  }

  await fs.writeFile(tmpIn, html);
  await execFileAsync(MINIFIER_BIN, [...flags, tmpIn, '-o', tmpOut], {
    cwd: ROOT_DIR,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = await fs.readFile(tmpOut, 'utf8');
  await fs.rm(tmpIn, { force: true });
  await fs.rm(tmpOut, { force: true });
  return result;
}

async function copyStaticAsset(relPath) {
  const src = path.join(ROOT_DIR, relPath);
  const dest = path.join(OUT_DIR, relPath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function main() {
  try {
    await fs.access(MINIFIER_BIN);
  } catch {
    throw new Error('Missing local dependencies. Run `npm install` first.');
  }

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  await Promise.all([
    copyStaticAsset('_headers'),
    copyStaticAsset('assets'),
    copyStaticAsset('favicon.ico'),
    copyStaticAsset('speculationrules.json'),
  ]);

  const articles = await loadArticles();
  const htmlFiles = await gatherHtmlFiles();

  for (const src of htmlFiles) {
    const rel = path.relative(ROOT_DIR, src);
    const dest = path.join(OUT_DIR, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });

    const source = await fs.readFile(src, 'utf8');
    const raw = source
      .replace('{{ARTICLES_LIST}}', renderArticleList(articles))
      .replace('{{ARTICLES_INDEX}}', renderArticleIndex(articles));
    const included = await posthtml([
      include({ root: ROOT_DIR }),
    ]).process(raw, { sync: true });

    const marked = markCurrentNav(included.html, rel);
    const inlined = inlineBundledStyles(marked, src);
    const minified = await minifyHtml(inlined);
    await fs.writeFile(dest, minified);
  }

  for (const article of articles) {
    const dest = path.join(OUT_DIR, 'articles', article.slug, 'index.html');
    await fs.mkdir(path.dirname(dest), { recursive: true });

    const raw = interpolate(article.template, {
      TITLE: escapeHtml(article.title),
      DESCRIPTION: escapeHtml(article.description),
      DATE: escapeHtml(article.date),
      HERO: renderHero(article),
      BODY: article.body,
      TOC: renderToc(article.headings),
    });

    const included = await posthtml([
      include({ root: ROOT_DIR }),
    ]).process(raw, { sync: true });

    const inlined = inlineBundledStyles(included.html, ARTICLE_TEMPLATE);
    const minified = await minifyHtml(inlined);
    await fs.writeFile(dest, minified);
  }

  await execFileAsync(path.join(ROOT_DIR, 'scripts', 'csp-hashes.sh'), [OUT_DIR], {
    cwd: ROOT_DIR,
    maxBuffer: 10 * 1024 * 1024,
  });

  console.log(`Build completed: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
