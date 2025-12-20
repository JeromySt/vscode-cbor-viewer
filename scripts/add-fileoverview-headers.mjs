import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Adds a file-level `@fileoverview` docblock to source files that don't already have one.
 *
 * This is intentionally a small, dependency-free codemod so it can run in CI or locally
 * without adding new packages.
 */

const ROOT = process.cwd();
const INCLUDE_DIRS = ['src', 'media'];
const INCLUDE_EXTS = new Set(['.ts', '.js']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'coverage',
  'tmp'
]);

function detectNewline(text) {
  // Preserve existing newline style to avoid noisy diffs.
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function toTitleCaseFromBasename(basename) {
  // e.g. "cborEditorProvider" -> "Cbor Editor Provider"
  const noExt = basename.replace(/\.[^.]+$/, '');
  const spaced = noExt
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function describeFile(relPath) {
  const p = relPath.replace(/\\/g, '/');
  const base = path.posix.basename(p);
  const title = toTitleCaseFromBasename(base);

  // Keep these descriptions helpful but not overly specific—deep intent docs live in the code.
  if (p.startsWith('src/test/')) {
    return {
      summary: `${title} (tests)` ,
      bullets: [
        'Test coverage for CBOR Viewer behaviors.',
        'Prefer intent-revealing fixtures and assertions over duplicating implementation details.',
        'Keep failures actionable: assert on user-visible output shapes when possible.'
      ]
    };
  }

  if (p.startsWith('src/preview/extenders/')) {
    return {
      summary: `${title} (preview extender)` ,
      bullets: [
        'Registers webview actions and/or commands related to preview links.',
        'Validates webview messages before performing privileged extension-host work.',
        'Uses the in-memory filesystem to open derived artifacts without touching disk.'
      ]
    };
  }

  if (p.startsWith('src/pretty/extenders/')) {
    return {
      summary: `${title} (pretty extender)` ,
      bullets: [
        'Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).',
        'Registers formatters, labels, and preview generators with the core pipeline.',
        'Ordering matters: prefer specific formatters over generic ones.'
      ]
    };
  }

  if (p.startsWith('src/pretty/core/')) {
    return {
      summary: `${title} (pretty core)` ,
      bullets: [
        'Shared primitives used across pretty formatting and extenders.',
        'Focus on small, well-tested helpers and types.'
      ]
    };
  }

  if (p.startsWith('src/pretty/')) {
    return {
      summary: `${title} (pretty pipeline)` ,
      bullets: [
        'Core pretty-formatting pipeline and infrastructure.',
        'Wires registries/extenders into a bounded, JSON-safe output shape.'
      ]
    };
  }

  if (p.startsWith('src/preview/')) {
    return {
      summary: `${title} (preview pipeline)` ,
      bullets: [
        'Preview pipeline infrastructure (webview actions, derived artifacts, selection decoding).',
        'Designed to keep the webview unprivileged and the extension host in control.'
      ]
    };
  }

  if (p.startsWith('media/')) {
    return {
      summary: `${title} (webview script)` ,
      bullets: [
        'Runs inside the VS Code webview sandbox.',
        'Handles UI behaviors and posts messages to the extension host for privileged actions.'
      ]
    };
  }

  return {
    summary: title,
    bullets: [
      'CBOR Viewer source module.',
      'See inline JSDoc and local comments for intent and tradeoffs.'
    ]
  };
}

function buildHeader(relPath, newline) {
  const { summary, bullets } = describeFile(relPath);
  const lines = [
    '/**',
    ` * @fileoverview ${summary}.`,
    ' *',
    ...bullets.map((b) => ` * - ${b}`),
    ' */',
    ''
  ];
  return lines.join(newline);
}

function hasFileOverview(text) {
  const head = text.split(/\r?\n/).slice(0, 80).join('\n');
  return head.includes('@fileoverview') || head.includes('@packageDocumentation');
}

async function walk(dirAbs, relBase = '') {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const nextAbs = path.join(dirAbs, entry.name);
      const nextRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      out.push(...(await walk(nextAbs, nextRel)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name);
    if (!INCLUDE_EXTS.has(ext)) {
      continue;
    }

    const fileRel = relBase ? `${relBase}/${entry.name}` : entry.name;
    out.push(fileRel);
  }

  return out;
}

async function main() {
  let files = [];
  for (const dir of INCLUDE_DIRS) {
    const abs = path.join(ROOT, dir);
    files.push(...(await walk(abs, dir)));
  }

  // Deterministic ordering helps with debugging and makes output predictable.
  files = files.sort((a, b) => a.localeCompare(b));

  let changed = 0;
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const text = await fs.readFile(abs, 'utf8');

    if (hasFileOverview(text)) {
      continue;
    }

    const newline = detectNewline(text);

    // Preserve shebang if present.
    if (text.startsWith('#!')) {
      const idx = text.indexOf('\n');
      const firstLine = idx >= 0 ? text.slice(0, idx).replace(/\r$/, '') : text;
      const rest = idx >= 0 ? text.slice(idx + 1) : '';
      const header = buildHeader(rel, newline);
      const next = `${firstLine}${newline}${header}${rest}`;
      await fs.writeFile(abs, next, 'utf8');
      changed++;
      continue;
    }

    const header = buildHeader(rel, newline);
    await fs.writeFile(abs, header + text, 'utf8');
    changed++;
  }

  process.stdout.write(`add-fileoverview-headers: updated ${changed} files\n`);
}

await main();
