import fs from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXCLUDES = new Set([
  '.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'coverage', 'archive',
]);
const markdown = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough']);
// We inspect destinations only. Nothing is rendered or executed. Retaining file:
// links lets us diagnose machine-specific paths instead of silently dropping them.
markdown.validateLink = () => true;
const slash = (value) => value.split(path.sep).join('/');
const isMarkdown = (value) => /\.(md|markdown)$/i.test(value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function textOf(tokens = []) {
  return tokens.map((token) => {
    if (token.type === 'image') return textOf(token.children);
    if (token.type === 'text' || token.type === 'code_inline') return token.content;
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    return '';
  }).join('');
}

export function parseDocument(source) {
  // GitHub does not render YAML front matter as Markdown. Preserve line offsets.
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines[0] === '---') {
    const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end > 0) for (let i = 0; i <= end; i++) lines[i] = '';
  }
  const tokens = markdown.parse(lines.join('\n'), {});
  const slugger = new GithubSlugger();
  const anchors = new Set();
  const links = [];
  let skippedHtml = 0;
  function collect(children, line) {
    for (const token of children ?? []) {
      if (token.type === 'link_open') links.push({ href: token.attrGet('href'), line });
      if (token.type === 'image') links.push({ href: token.attrGet('src'), line });
      if (token.type === 'html_inline') skippedHtml++;
      if (token.children) collect(token.children, line);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && tokens[i + 1]?.type === 'inline') {
      anchors.add(slugger.slug(textOf(tokens[i + 1].children)));
    }
    if (token.type === 'inline') collect(token.children, (token.map?.[0] ?? 0) + 1);
    if (token.type === 'html_block') skippedHtml++;
  }
  return { anchors, links, skippedHtml };
}

/** Check a filesystem tree without following symlinks or making network requests. */
export async function check({ root = process.cwd(), inputs = ['.'], exclude = [], anchors = true } = {}) {
  root = path.resolve(root);
  const rootStat = await fs.lstat(root).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Root must be an existing directory, not a symlink.');
  }
  const excluded = exclude.map((value) => {
    const resolved = path.resolve(root, value);
    if (!inside(root, resolved)) throw new Error('Excluded paths must stay inside --root.');
    return resolved;
  });
  const files = new Set();
  let skippedSymlinks = 0;
  const ignored = (file) => excluded.some((entry) => file === entry || inside(entry, file));

  async function noSymlink(file) {
    const parts = path.relative(root, file).split(path.sep).filter(Boolean);
    let cursor = root;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      if ((await fs.lstat(cursor)).isSymbolicLink()) return false;
    }
    return true;
  }

  async function walk(file, explicit = false) {
    if (!inside(root, file)) throw new Error('Inputs must stay inside --root.');
    if (ignored(file)) return;
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) {
      if (explicit) throw new Error('A symlink cannot be an explicit input.');
      skippedSymlinks++;
      return;
    }
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort(compare)) {
        if (!DEFAULT_EXCLUDES.has(name)) await walk(path.join(file, name));
      }
    } else if (stat.isFile() && isMarkdown(file)) {
      files.add(file);
    } else if (explicit) {
      throw new Error('Explicit files must have a .md or .markdown extension.');
    }
  }

  for (const input of inputs) {
    const file = path.resolve(root, input);
    if (!inside(root, file)) throw new Error('Inputs must stay inside --root.');
    if (!await noSymlink(file)) throw new Error('Input paths must not pass through symlinks.');
    await walk(file, true);
  }
  if (files.size === 0) throw new Error('No Markdown files found. Check your inputs and exclusions.');

  const documents = new Map();
  const directories = new Map();
  async function document(file) {
    if (!documents.has(file)) {
      const stat = await fs.stat(file);
      if (stat.size > MAX_BYTES) throw new Error('Markdown file exceeds the 2 MiB limit.');
      const buffer = await fs.readFile(file);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      documents.set(file, parseDocument(text));
    }
    return documents.get(file);
  }
  async function names(directory) {
    if (!directories.has(directory)) directories.set(directory, await fs.readdir(directory));
    return directories.get(directory);
  }
  async function resolveExact(target) {
    let cursor = root;
    let changed = false;
    for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
      let entries;
      try { entries = await names(cursor); } catch { return { code: 'MISSING_PATH' }; }
      let name = part;
      if (!entries.includes(part)) {
        const candidates = entries.filter((entry) =>
          entry.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
        if (candidates.length === 0) return { code: 'MISSING_PATH' };
        if (candidates.length > 1) return { code: 'AMBIGUOUS_PATH' };
        [name] = candidates;
        changed = true;
      }
      cursor = path.join(cursor, name);
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) return { code: 'SYMLINK_PATH' };
    }
    return { path: cursor, changed };
  }

  const result = {
    version: 1,
    files: files.size,
    checkedLinks: 0,
    skippedExternal: 0,
    skippedHtml: 0,
    skippedSymlinks,
    skippedFragments: 0,
    issues: [],
  };
  for (const file of [...files].sort(compare)) {
    const sourceName = slash(path.relative(root, file));
    let doc;
    try { doc = await document(file); } catch (error) {
      throw new Error(`Cannot read ${sourceName}: ${error.message}`);
    }
    result.skippedHtml += doc.skippedHtml;
    for (const { href, line } of doc.links) {
      const issue = (code, message, suggestion) => result.issues.push({
        file: sourceName, line, code, href, message, ...(suggestion ? { suggestion } : {}),
      });
      if (/^(?:[a-z]:(?:[\\/]|%5c|%2f)|file:)/i.test(href)) {
        result.checkedLinks++;
        issue('ABSOLUTE_PATH', 'Use a repository-relative path, not a machine-specific path.');
        continue;
      }
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
        result.skippedExternal++;
        continue;
      }
      result.checkedLinks++;
      const hashIndex = href.indexOf('#');
      const beforeHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
      const suffix = hashIndex < 0 ? '' : href.slice(hashIndex);
      const queryIndex = beforeHash.indexOf('?');
      const query = queryIndex < 0 ? '' : beforeHash.slice(queryIndex);
      const rawPath = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex);
      let decoded, fragment;
      try {
        decoded = decodeURIComponent(rawPath);
        fragment = decodeURIComponent(suffix.slice(1));
      } catch {
        issue('INVALID_URL', 'Invalid percent encoding in the local destination.');
        continue;
      }
      if (decoded.includes('\0')) {
        issue('INVALID_URL', 'Local destinations cannot contain null bytes.');
        continue;
      }
      if (/^[a-z]:[\\/]/i.test(decoded)) {
        issue('ABSOLUTE_PATH', 'Use a repository-relative path, not a Windows drive path.');
        continue;
      }
      if (decoded.includes('\\')) {
        issue('BACKSLASH_PATH', 'Markdown paths use forward slashes (/).', decoded.replaceAll('\\', '/') + query + suffix);
        continue;
      }
      const target = decoded === '' ? file : decoded.startsWith('/')
        ? path.resolve(root, `.${decoded}`) : path.resolve(path.dirname(file), decoded);
      if (!inside(root, target)) {
        issue('OUTSIDE_ROOT', 'Destination escapes the selected repository root.');
        continue;
      }
      let resolved;
      try { resolved = await resolveExact(target); } catch {
        issue('READ_ERROR', 'Unable to inspect the destination. Check file permissions.');
        continue;
      }
      if (resolved.code) {
        const messages = {
          MISSING_PATH: 'Destination does not exist (or a parent is not a readable directory).',
          AMBIGUOUS_PATH: 'More than one filename matches after case/Unicode normalization. Use an exact path.',
          SYMLINK_PATH: 'Destination passes through a symlink. Symlink targets are not inspected.',
        };
        issue(resolved.code, messages[resolved.code]);
        continue;
      }
      if (resolved.changed) {
        const relative = decoded.startsWith('/')
          ? `/${slash(path.relative(root, resolved.path))}`
          : slash(path.relative(path.dirname(file), resolved.path));
        const encoded = relative.split('/').map(encodeURIComponent).join('/');
        issue('PATH_CASE', 'Path spelling differs from the filesystem (case or Unicode normalization).', encoded + query + suffix);
      }
      if (!fragment) continue;
      if (!anchors || !isMarkdown(resolved.path)) {
        result.skippedFragments++;
        continue;
      }
      try {
        const targetDoc = await document(resolved.path);
        if (!targetDoc.anchors.has(fragment)) {
          issue('MISSING_ANCHOR', 'Heading anchor not found. Raw HTML/custom anchors are not supported.');
        }
      } catch {
        issue('READ_ERROR', 'Unable to read the target Markdown file as UTF-8 (limit: 2 MiB).');
      }
    }
  }
  return result;
}
