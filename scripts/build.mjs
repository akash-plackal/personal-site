import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

async function gatherHtmlFiles() {
  const roots = [
    path.join(ROOT_DIR, 'index.html'),
    path.join(ROOT_DIR, 'about'),
    path.join(ROOT_DIR, 'articles'),
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

function resolveProjectPath(filePath, fromFile) {
  if (filePath.startsWith('/')) {
    return path.join(ROOT_DIR, filePath.slice(1));
  }
  return path.resolve(path.dirname(fromFile), filePath);
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

  const htmlFiles = await gatherHtmlFiles();

  for (const src of htmlFiles) {
    const rel = path.relative(ROOT_DIR, src);
    const dest = path.join(OUT_DIR, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });

    const raw = await fs.readFile(src, 'utf8');
    const included = await posthtml([
      include({ root: ROOT_DIR }),
    ]).process(raw, { sync: true });

    const inlined = inlineBundledStyles(included.html, src);
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
