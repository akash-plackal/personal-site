import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
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
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://akashplackal.com';
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
    path.join(ROOT_DIR, 'topics'),
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

// Convert YYYY-MM-DD into an ISO 8601 timestamp at noon UTC. Article schema
// and OG `article:published_time` both expect ISO 8601 — bare dates work but
// the explicit form maps cleanly to dateModified comparisons in Search Console.
function toIso(date) {
  if (!date) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00+00:00` : String(date);
}

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const VIDEO_MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function urlExt(url) {
  return path.extname((url || '').split('?')[0]).toLowerCase();
}

function isRasterImage(url) {
  if (!url) return false;
  return RASTER_EXT.has(urlExt(url));
}

function isVideo(url) {
  if (!url) return false;
  return VIDEO_EXT.has(urlExt(url));
}

function imageMime(url) {
  return IMAGE_MIME[urlExt(url)] || 'image/png';
}

function videoMime(url) {
  return VIDEO_MIME[urlExt(url)] || 'video/mp4';
}

function assetMime(url) {
  return isVideo(url) ? videoMime(url) : imageMime(url);
}

function preloadAs(url) {
  return isVideo(url) ? 'video' : 'image';
}

function absoluteUrl(pathname) {
  if (!pathname) return '';
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${SITE_ORIGIN}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
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

  if (isVideo(article.hero)) {
    // Silent UI loop: muted+autoplay+loop+playsinline. preload=metadata so the
    // browser starts fetching headers/keyframes immediately but doesn't burn
    // bandwidth eagerly downloading the whole file before <video> commits.
    const poster = article.heroPoster ? ` poster="${escapeHtml(article.heroPoster)}"` : '';
    return `<video class="hero-image" width="${escapeHtml(width)}" height="${escapeHtml(height)}" autoplay loop muted playsinline preload="auto" aria-label="${escapeHtml(alt)}"${poster}><source src="${escapeHtml(article.hero)}" type="${escapeHtml(videoMime(article.hero))}" /></video>`;
  }

  return `<img class="hero-image" src="${escapeHtml(article.hero)}" width="${escapeHtml(width)}" height="${escapeHtml(height)}" alt="${escapeHtml(alt)}" fetchpriority="high" />`;
}

// Hero <link rel="preload"> for the article head. Pairs with the 103
// Early Hints `Link` header so the browser can start fetching the LCP asset
// before the body is parsed. fetchpriority=high promotes it past other
// resources discovered later in the page.
function renderHeroPreload(article) {
  if (!article.hero) {
    return '';
  }
  const type = assetMime(article.hero);
  const as = preloadAs(article.hero);
  return `<link rel="preload" as="${as}" type="${escapeHtml(type)}" href="${escapeHtml(article.hero)}" fetchpriority="high" />`;
}

// Open Graph image meta block — emitted as a contiguous group so social card
// validators (FB, Twitter, LinkedIn) parse all hints together.
function renderOgImageMeta(article) {
  const img = article.ogImage;
  return [
    `<meta property="og:image" content="${escapeHtml(img.absoluteUrl)}" />`,
    `<meta property="og:image:type" content="${escapeHtml(img.type)}" />`,
    `<meta property="og:image:width" content="${escapeHtml(img.width)}" />`,
    `<meta property="og:image:height" content="${escapeHtml(img.height)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(img.alt)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(img.absoluteUrl)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(img.alt)}" />`,
  ].join('\n  ');
}

// Article-specific OG meta + per-tag <meta property="article:tag">. Google
// uses these signals for News/Discover and Lighthouse's structured-data
// manual audit. Author URL points at the about page so E-E-A-T is verifiable.
function renderArticleMeta(article) {
  const lines = [
    `<meta property="article:published_time" content="${escapeHtml(article.publishedTime)}" />`,
    `<meta property="article:modified_time" content="${escapeHtml(article.modifiedTime)}" />`,
    `<meta property="article:author" content="${escapeHtml(`${SITE_ORIGIN}/about/`)}" />`,
  ];
  if (article.tags && article.tags.length > 0) {
    lines.push(`<meta name="keywords" content="${escapeHtml(article.tags.join(', '))}" />`);
    for (const tag of article.tags) {
      lines.push(`<meta property="article:tag" content="${escapeHtml(tag)}" />`);
    }
  }
  return lines.join('\n  ');
}

// JSON-LD: BlogPosting (the article itself) plus a BreadcrumbList so Google
// shows Home › Writing › Article in search results. Output is single-line so
// the HTML minifier doesn't have to think about it.
function renderArticleJsonLd(article) {
  const blogPosting = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${article.canonical}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': article.canonical },
    headline: article.title,
    description: article.description,
    image: [article.ogImage.absoluteUrl],
    datePublished: article.publishedTime,
    dateModified: article.modifiedTime,
    inLanguage: 'en',
    url: article.canonical,
    author: {
      '@type': 'Person',
      '@id': `${SITE_ORIGIN}/#person`,
      name: article.author,
      url: `${SITE_ORIGIN}/about/`,
    },
    publisher: {
      '@type': 'Person',
      '@id': `${SITE_ORIGIN}/#person`,
      name: 'Akash Plackal',
      url: SITE_ORIGIN + '/',
    },
    isPartOf: {
      '@type': 'Blog',
      '@id': `${SITE_ORIGIN}/writing/#blog`,
      name: 'Akash Plackal — Writing',
      url: `${SITE_ORIGIN}/writing/`,
    },
  };

  if (article.tags && article.tags.length > 0) {
    blogPosting.keywords = article.tags.join(', ');
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Writing', item: `${SITE_ORIGIN}/writing/` },
      { '@type': 'ListItem', position: 3, name: article.title, item: article.canonical },
    ],
  };

  // Single combined script keeps total bytes lower than two separate blocks
  // and is equally valid per the JSON-LD spec (an array of root nodes).
  const payload = JSON.stringify([blogPosting, breadcrumbs]);
  return `<script type="application/ld+json">${payload}</script>`;
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
          <a class="writing-card" href="/articles/${escapeHtml(article.slug)}/">
            <time class="writing-date" datetime="${escapeHtml(article.date)}">${escapeHtml(article.date)}</time>
            <span class="writing-copy">
              <span class="writing-title">${escapeHtml(article.title)}</span>
              <span class="writing-summary">${escapeHtml(article.description)}</span>
            </span>
            <span class="writing-arrow" aria-hidden="true">→</span>
          </a>
        </li>`
    ))
    .join('\n');
}

// Aggregate every unique tag across all articles. The relationship is many-to-
// many (one article has many tags, one tag covers many articles), so we
// invert the per-article tag lists into a tag-keyed map. Sorted by article
// count desc, then alphabetical so the most-covered topics surface first.
function collectTopics(articles) {
  const map = new Map();
  for (const article of articles) {
    for (const tag of article.tags ?? []) {
      const name = String(tag).trim();
      if (!name) continue;
      const entry = map.get(name) ?? { count: 0 };
      entry.count += 1;
      map.set(name, entry);
    }
  }
  return [...map.entries()]
    .map(([name, data]) => ({ name, count: data.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Render topic chips that open a Google site-restricted search. Display label
// is uppercased to match the home page chip style. Query lowercases the tag
// and converts hyphens to spaces so multi-word compounds like "HTML-First"
// search as "html first" — broader recall than the hyphenated form.
function renderTopicsChips(topics) {
  const host = new URL(SITE_ORIGIN).hostname;
  return topics
    .map((topic, index) => {
      const label = topic.name.toUpperCase();
      const query = topic.name.toLowerCase().replaceAll('-', ' ');
      const encoded = encodeURIComponent(`${query} site:${host}`).replaceAll('%20', '+');
      const countLabel = `${topic.count} ${topic.count === 1 ? 'article' : 'articles'}`;
      // --chip-delay drives the staggered chip-enter animation in topics/index.css
      // (animation-delay: calc(var(--chip-delay) * 18ms + 280ms)), so each pill
      // cascades in instead of all 32 fading together.
      return `        <li><a class="chip" style="--chip-delay:${index}" href="https://www.google.com/search?q=${encoded}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span class="chip-count" aria-label="${escapeHtml(countLabel)}">${topic.count}</span></a></li>`;
    })
    .join('\n');
}

// Asset fingerprinting. Source HTML references assets without `?v=...`;
// the build computes a content hash for each fingerprinted asset and rewrites
// every reference to include `?v=<hash>`. Same bytes → same hash → cache stays
// valid; changed bytes → new hash → automatic cache bust.
const FINGERPRINTED_ASSETS = ['/assets/nav-audio.js'];

async function buildAssetFingerprints() {
  const map = new Map();
  for (const url of FINGERPRINTED_ASSETS) {
    const filePath = path.join(ROOT_DIR, url.replace(/^\//, ''));
    const content = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
    map.set(url, hash);
  }
  return map;
}

function fingerprintAssets(html, fingerprints) {
  let result = html;
  for (const [url, hash] of fingerprints) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the URL with or without an existing `?v=...` query so this is
    // idempotent and tolerates legacy version strings during the transition.
    const pattern = new RegExp(`${escaped}(\\?v=[^"'\\s>]+)?`, 'g');
    result = result.replace(pattern, `${url}?v=${hash}`);
  }
  return result;
}

function markCurrentNav(html, relPath) {
  let href = '';
  if (relPath === path.join('about', 'index.html') || relPath.startsWith(`about${path.sep}`)) {
    href = '/about/';
  } else if (relPath === path.join('writing', 'index.html') || relPath.startsWith(`writing${path.sep}`)) {
    href = '/writing/';
  } else if (relPath === path.join('topics', 'index.html') || relPath.startsWith(`topics${path.sep}`)) {
    href = '/topics/';
  }

  if (!href) {
    return html;
  }

  return html.replace(
    new RegExp(`<a href="${href.replaceAll('/', '\\/')}"`, 'g'),
    `<a aria-current="page" href="${href}"`,
  );
}

// Default OG image for articles that don't have a raster hero. Square 640
// avatar works in all major social card validators and is already on-disk.
const DEFAULT_OG_IMAGE = {
  url: '/assets/hero-avatar-640.avif',
  width: 640,
  height: 640,
  type: 'image/avif',
  alt: 'Akash Plackal',
};

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
    const lastmod = data.lastmod ? normalizeDate(data.lastmod) : date;

    // Tags: accept `tags` (preferred) or `keywords`. Always normalise to a
    // string array so downstream code is uniform.
    const rawTags = data.tags || data.keywords || [];
    const tags = (Array.isArray(rawTags) ? rawTags : [rawTags])
      .map((t) => String(t).trim())
      .filter(Boolean);

    // OG image. Prefer an explicit `ogImage` override, otherwise use the hero
    // if it's a raster format crawlers will accept, otherwise fall back to the
    // site avatar so the social card never breaks.
    const heroPath = data.hero ? String(data.hero) : '';
    const explicitOg = data.ogImage ? String(data.ogImage) : '';
    let ogImage;
    if (explicitOg) {
      ogImage = {
        url: explicitOg,
        width: data.ogImageWidth ? Number(data.ogImageWidth) : 1200,
        height: data.ogImageHeight ? Number(data.ogImageHeight) : 630,
        type: imageMime(explicitOg),
        alt: data.ogImageAlt ? String(data.ogImageAlt) : (data.heroAlt ? String(data.heroAlt) : String(data.title)),
      };
    } else if (heroPath && isRasterImage(heroPath)) {
      ogImage = {
        url: heroPath,
        width: data.heroWidth ? Number(data.heroWidth) : 1200,
        height: data.heroHeight ? Number(data.heroHeight) : 630,
        type: imageMime(heroPath),
        alt: data.heroAlt ? String(data.heroAlt) : String(data.title),
      };
    } else {
      ogImage = { ...DEFAULT_OG_IMAGE };
    }

    const article = {
      title: String(data.title),
      description: String(data.description),
      date,
      lastmod,
      publishedTime: toIso(date),
      modifiedTime: toIso(lastmod),
      month: date.slice(0, 7),
      slug,
      url: `/articles/${slug}/`,
      canonical: `${SITE_ORIGIN}/articles/${slug}/`,
      hero: heroPath,
      heroPoster: data.heroPoster ? String(data.heroPoster) : '',
      heroAlt: data.heroAlt ? String(data.heroAlt) : '',
      heroWidth: data.heroWidth ? Number(data.heroWidth) : 960,
      heroHeight: data.heroHeight ? Number(data.heroHeight) : 420,
      ogImage: { ...ogImage, absoluteUrl: absoluteUrl(ogImage.url) },
      tags,
      author: data.author ? String(data.author) : 'Akash Plackal',
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

// Generate per-article `Link:` headers for 103 Early Hints. Cloudflare Pages
// promotes any `Link: <url>; rel=preload` header to a 103 response, so the
// browser starts fetching the hero image before the HTML body even arrives.
// Each article path also re-emits the giscus preconnect because per-path
// header blocks in `_headers` override (not merge with) the wildcard rule.
function renderArticleHeaders(articles) {
  return articles
    .filter((a) => a.hero)
    .map((a) => {
      const type = assetMime(a.hero);
      const as = preloadAs(a.hero);
      return [
        `/articles/${a.slug}/`,
        `  Link: <${a.hero}>; rel=preload; as=${as}; type=${type}`,
        `  Link: <https://giscus.app>; rel=preconnect; crossorigin`,
      ].join('\n');
    })
    .join('\n\n');
}

async function buildHeadersFile(articles) {
  const src = path.join(ROOT_DIR, '_headers');
  const dest = path.join(OUT_DIR, '_headers');
  const base = await fs.readFile(src, 'utf8');
  const articleHeaders = renderArticleHeaders(articles);
  const combined = articleHeaders ? `${base.trimEnd()}\n\n${articleHeaders}\n` : base;
  await fs.writeFile(dest, combined);
}

// Build a sitemap.xml from all generated HTML pages plus articles. Pages are
// emitted with absolute URLs at SITE_ORIGIN; lastmod is the latest article
// date for the homepage and the article date for each article.
async function writeSitemap(htmlFiles, articles) {
  const today = new Date().toISOString().slice(0, 10);
  const latestArticleDate = articles.length > 0 ? articles[0].date : today;

  const staticEntries = [];
  for (const file of htmlFiles) {
    const rel = path.relative(ROOT_DIR, file);
    const dir = path.dirname(rel);
    let urlPath;
    if (rel === 'index.html') {
      urlPath = '/';
    } else if (path.basename(rel) === 'index.html') {
      urlPath = `/${dir.split(path.sep).join('/')}/`;
    } else {
      // Non-index .html — unusual in this codebase; serve as-is.
      urlPath = `/${rel.split(path.sep).join('/')}`;
    }

    let priority = '0.6';
    let changefreq = 'monthly';
    if (urlPath === '/') {
      priority = '1.0';
      changefreq = 'weekly';
    } else if (urlPath === '/about/') {
      priority = '0.8';
      changefreq = 'monthly';
    } else if (urlPath === '/writing/') {
      priority = '0.9';
      changefreq = 'weekly';
    } else if (urlPath === '/topics/') {
      priority = '0.7';
      changefreq = 'weekly';
    }

    staticEntries.push({
      loc: urlPath,
      lastmod: urlPath === '/' || urlPath === '/writing/' || urlPath === '/topics/' ? latestArticleDate : today,
      changefreq,
      priority,
    });
  }

  const articleEntries = articles.map((article) => ({
    loc: `/articles/${article.slug}/`,
    lastmod: article.date,
    changefreq: 'yearly',
    priority: '0.7',
  }));

  const all = [...staticEntries, ...articleEntries];

  const body = all
    .map((entry) => (
      `  <url>\n    <loc>${SITE_ORIGIN}${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`
    ))
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  await fs.writeFile(path.join(OUT_DIR, 'sitemap.xml'), xml);
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
    copyStaticAsset('assets'),
    copyStaticAsset('favicon.ico'),
    copyStaticAsset('speculationrules.json'),
    copyStaticAsset('robots.txt'),
  ]);

  const articles = await loadArticles();
  await buildHeadersFile(articles);
  const topics = collectTopics(articles);
  const htmlFiles = await gatherHtmlFiles();
  const assetFingerprints = await buildAssetFingerprints();

  for (const src of htmlFiles) {
    const rel = path.relative(ROOT_DIR, src);
    const dest = path.join(OUT_DIR, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });

    const source = await fs.readFile(src, 'utf8');
    const raw = source
      .replace('{{ARTICLES_LIST}}', renderArticleList(articles))
      .replace('{{ARTICLES_INDEX}}', renderArticleIndex(articles))
      .replace('{{TOPICS_CHIPS}}', renderTopicsChips(topics));
    const included = await posthtml([
      include({ root: ROOT_DIR }),
    ]).process(raw, { sync: true });

    const marked = markCurrentNav(included.html, rel);
    const fingerprinted = fingerprintAssets(marked, assetFingerprints);
    const inlined = inlineBundledStyles(fingerprinted, src);
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
      DATE_DISPLAY: escapeHtml(article.date),
      DATETIME: escapeHtml(article.publishedTime),
      CANONICAL: escapeHtml(article.canonical),
      OG_IMAGE_META: renderOgImageMeta(article),
      ARTICLE_META: renderArticleMeta(article),
      JSON_LD: renderArticleJsonLd(article),
      HERO_PRELOAD: renderHeroPreload(article),
      HERO: renderHero(article),
      BODY: article.body,
      TOC: renderToc(article.headings),
    });

    const included = await posthtml([
      include({ root: ROOT_DIR }),
    ]).process(raw, { sync: true });

    const fingerprinted = fingerprintAssets(included.html, assetFingerprints);
    const inlined = inlineBundledStyles(fingerprinted, ARTICLE_TEMPLATE);
    const minified = await minifyHtml(inlined);
    await fs.writeFile(dest, minified);
  }

  await writeSitemap(htmlFiles, articles);

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
