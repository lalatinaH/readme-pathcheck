import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { check, parseDocument } from '../src/check.js';

const cli = fileURLToPath(new URL('../bin/readme-pathcheck.js', import.meta.url));
async function tree(t, entries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'readme-pathcheck-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(entries)) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return root;
}
const codes = (result) => result.issues.map((issue) => issue.code);
const run = (root, ...args) => spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' });

test('valid relative, root-relative, directory and same-file links', async (t) => {
  const root = await tree(t, {
    'README.md': '# Home\n[Guide](docs/Guide.md#start)\n\n[Top](#home)\n\n[Docs](docs/)\n',
    'docs/Guide.md': '# Start\n[Home](/README.md#home)\n',
  });
  const result = await check({ root });
  assert.deepEqual(codes(result), []);
  assert.equal(result.files, 2);
  assert.equal(result.checkedLinks, 4);
});

test('checks every path component with exact casing on every host', async (t) => {
  const root = await tree(t, { 'README.md': '[Guide](DOCS/guide.md#start)', 'docs/Guide.md': '# Start' });
  const result = await check({ root });
  assert.deepEqual(codes(result), ['PATH_CASE']);
  assert.equal(result.issues[0].suggestion, 'docs/Guide.md#start');
});

test('root-relative casing suggestions retain leading slash, query and fragment', async (t) => {
  const root = await tree(t, { 'README.md': '[Guide](/DOCS/a%20b.md?raw=1#hi)', 'docs/A B.md': '# Hi' });
  const result = await check({ root });
  assert.equal(result.issues[0].suggestion, '/docs/A%20B.md?raw=1#hi');
});

test('reports missing files and images with source locations', async (t) => {
  const root = await tree(t, { 'README.md': '# Home\n\n[Guide](gone.md)\n\n![Image](gone.png)' });
  const result = await check({ root });
  assert.deepEqual(codes(result), ['MISSING_PATH', 'MISSING_PATH']);
  assert.deepEqual(result.issues.map((i) => i.line), [3, 5]);
});

test('ignores fenced code, indented code, inline code and HTML comments', () => {
  const source = '```md\n[not a link](missing.md)\n```\n\n    [also code](missing.md)\n\n`[code](missing.md)`\n\n<!-- [comment](missing.md) -->';
  assert.deepEqual(parseDocument(source).links, []);
});

test('supports reference, collapsed reference, shortcut and image reference links', () => {
  const doc = parseDocument('[label][ref]\n\n[ref][]\n\n[ref]\n\n![pic][ref]\n\n[ref]: guide.md "title"');
  assert.equal(doc.links.length, 4);
  assert.ok(doc.links.every((link) => link.href === 'guide.md'));
});

test('supports table links, nested image links, parentheses and angle destinations', () => {
  const doc = parseDocument('| a |\n| - |\n| [x](a.md) |\n\n[![x](img.png)](guide.md)\n\n[x](docs/a(b).md)\n\n[x](<a b.md>)');
  assert.deepEqual(doc.links.map((link) => link.href), ['a.md', 'guide.md', 'img.png', 'docs/a(b).md', 'a%20b.md']);
});

test('Unicode, duplicate, formatted and setext headings use GitHub-style anchors', async (t) => {
  const root = await tree(t, {
    'README.md': '# 安裝方法\n# Hello *world* `code`\n# Repeat\n# Repeat\nSetext\n------\n\n[a](#安裝方法) [b](#hello-world-code) [c](#repeat-1) [d](#setext)',
  });
  assert.deepEqual(codes(await check({ root })), []);
});

test('slugger handles collisions between duplicate and explicitly numbered headings', () => {
  const doc = parseDocument('# A\n# A\n# A-1\n# A');
  assert.deepEqual([...doc.anchors], ['a', 'a-1', 'a-1-1', 'a-2']);
});

test('missing or wrong-case fragments are reported, empty fragments are allowed', async (t) => {
  const root = await tree(t, { 'README.md': '# Start\n[x](#Start) [y](#gone) [z](#)' });
  assert.deepEqual(codes(await check({ root })), ['MISSING_ANCHOR', 'MISSING_ANCHOR']);
});

test('--no-anchors skips fragments but still checks missing paths', async (t) => {
  const root = await tree(t, { 'README.md': '[x](#gone) [y](gone.md#gone)' });
  const result = await check({ root, anchors: false });
  assert.deepEqual(codes(result), ['MISSING_PATH']);
  assert.equal(result.skippedFragments, 1);
});

test('YAML front matter is skipped without shifting later line numbers', () => {
  const doc = parseDocument('\uFEFF---\r\nlink: [ignore](missing.md)\r\n---\r\n\r\n[x](real.md)');
  assert.deepEqual(doc.links, [{ href: 'real.md', line: 5 }]);
});

test('spaces, Unicode and percent-encoded hash filenames are resolved', async (t) => {
  const root = await tree(t, { 'README.md': '[x](<文件/指南 #1.md#安裝>)', '文件/指南 #1.md': '# 安裝' });
  // A literal # is a URL fragment separator even within angle brackets.
  const encoded = await tree(t, { 'README.md': '[x](文件/指南%20%231.md#安裝)', '文件/指南 #1.md': '# 安裝' });
  assert.deepEqual(codes(await check({ root: encoded })), []);
  assert.deepEqual(codes(await check({ root })), ['MISSING_PATH']);
});

test('Unicode normalization mismatches have an exact spelling suggestion', async (t) => {
  const root = await tree(t, { 'README.md': '[x](caf%C3%A9.md)', 'cafe\u0301.md': '# Hello' });
  const stored = (await fs.readdir(root)).find((name) => name !== 'README.md');
  const result = await check({ root, inputs: ['README.md'] });
  if (stored === 'café.md') assert.deepEqual(codes(result), []);
  else {
    assert.deepEqual(codes(result), ['PATH_CASE']);
    assert.equal(result.issues[0].suggestion, encodeURIComponent(stored));
  }
});

test('external links are counted but never fetched', async (t) => {
  const root = await tree(t, { 'README.md': '[x](https://does-not-exist.invalid/a) [y](mailto:test@example.invalid) [z](//example.invalid/x) [a](custom:thing)' });
  const result = await check({ root });
  assert.equal(result.skippedExternal, 4);
  assert.equal(result.checkedLinks, 0);
  assert.deepEqual(codes(result), []);
});

test('file URLs and Windows absolute paths are diagnosed', async (t) => {
  const root = await tree(t, { 'README.md': '[x](file:///C:/Users/me/a.md) [y](C:/Users/me/a.md) [z](C:%5CUsers%5Cme%5Ca.md)' });
  assert.deepEqual(codes(await check({ root })), ['ABSOLUTE_PATH', 'ABSOLUTE_PATH', 'ABSOLUTE_PATH']);
});

test('backslash paths produce a forward-slash suggestion', async (t) => {
  const root = await tree(t, { 'README.md': '[x](docs%5Cguide.md#start)' });
  const result = await check({ root });
  assert.deepEqual(codes(result), ['BACKSLASH_PATH']);
  assert.equal(result.issues[0].suggestion, 'docs/guide.md#start');
});

test('rejects traversal, including encoded parent segments', async (t) => {
  const root = await tree(t, { 'README.md': '[x](../outside.md) [y](%2e%2e/outside.md)' });
  assert.deepEqual(codes(await check({ root })), ['OUTSIDE_ROOT', 'OUTSIDE_ROOT']);
});

test('reports null bytes and malformed percent encoding without crashing', async (t) => {
  const root = await tree(t, { 'README.md': '[x](bad%00.md) [y](bad%E0%A4.md)' });
  assert.deepEqual(codes(await check({ root })), ['INVALID_URL', 'INVALID_URL']);
});

test('does not treat an encoded protocol or slash as a network request', async (t) => {
  const root = await tree(t, { 'README.md': '[x](https%3A%2F%2Fexample.invalid/a) [y](%2F%2Fexample.invalid/a)' });
  const result = await check({ root });
  assert.equal(result.checkedLinks, 2);
  assert.equal(result.skippedExternal, 0);
  assert.deepEqual(codes(result), ['MISSING_PATH', 'MISSING_PATH']);
});

test('raw HTML is counted as skipped and HTML/PDF fragments are not validated', async (t) => {
  const root = await tree(t, { 'README.md': '<img src="gone.png">\n\n[x](page.html#not-checked)', 'page.html': '' });
  const result = await check({ root });
  assert.deepEqual(codes(result), []);
  assert.equal(result.skippedHtml, 1);
  assert.equal(result.skippedFragments, 1);
});

test('supports subtree exclusions and skips default generated directories', async (t) => {
  const root = await tree(t, {
    'README.md': '# Home', 'node_modules/no.md': '[x](gone)',
    'dist/no.md': '[x](gone)', 'draft/no.md': '[x](gone)', '.github/CONTRIBUTING.md': '# Contribute',
  });
  const result = await check({ root, exclude: ['draft'] });
  assert.equal(result.files, 2);
  assert.deepEqual(codes(result), []);
});

test('excluded documents can still be resolved as link destinations', async (t) => {
  const root = await tree(t, { 'README.md': '[x](docs/Guide.md#hi)', 'docs/Guide.md': '# Hi\n[x](gone)' });
  assert.deepEqual(codes(await check({ root, exclude: ['docs'] })), []);
});

test('deduplicates overlapping inputs and returns stable source order', async (t) => {
  const root = await tree(t, { 'z.md': '[z](gone)', 'a.md': '[a](gone)' });
  const result = await check({ root, inputs: ['z.md', '.', 'a.md'] });
  assert.equal(result.files, 2);
  assert.deepEqual(result.issues.map((i) => i.file), ['a.md', 'z.md']);
});

test('rejects empty input trees, outside-root inputs and invalid exclusions', async (t) => {
  const root = await tree(t, {});
  await assert.rejects(check({ root }), /No Markdown/);
  await assert.rejects(check({ root, inputs: ['..'] }), /inside/);
  await assert.rejects(check({ root, exclude: ['..'] }), /inside/);
});

test('rejects non-Markdown explicit inputs and invalid UTF-8', async (t) => {
  const root = await tree(t, { 'a.txt': '', 'bad.md': Buffer.from([0xff, 0xfe]) });
  await assert.rejects(check({ root, inputs: ['a.txt'] }), /extension/);
  await assert.rejects(check({ root, inputs: ['bad.md'] }), /Cannot read/);
});

test('rejects oversized documents instead of claiming a clean result', async (t) => {
  const root = await tree(t, { 'big.md': 'x'.repeat(2 * 1024 * 1024 + 1) });
  await assert.rejects(check({ root }), /2 MiB/);
});

test('never follows directory symlinks for traversal or link targets', async (t) => {
  const root = await tree(t, { 'README.md': '[x](linked/secret.md)' });
  const outside = await tree(t, { 'secret.md': '# Secret' });
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await check({ root });
  assert.equal(result.files, 1);
  assert.equal(result.skippedSymlinks, 1);
  assert.deepEqual(codes(result), ['SYMLINK_PATH']);
  await assert.rejects(check({ root, inputs: ['linked/secret.md'] }), /symlink/);
});

test('root itself cannot be a symlink', async (t) => {
  const container = await tree(t, {});
  const target = await tree(t, { 'README.md': '# Hello' });
  const linked = path.join(container, 'linked');
  await fs.symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(check({ root: linked }), /symlink/);
});

test('ambiguous case matches require exact spelling on case-sensitive filesystems', async (t) => {
  const root = await tree(t, { 'README.md': '[x](guide.md)', 'Guide.md': '', 'GUIDE.md': '' });
  if ((await fs.readdir(root)).length < 3) { t.skip('Filesystem cannot store these case-colliding names.'); return; }
  assert.deepEqual(codes(await check({ root, inputs: ['README.md'] })), ['AMBIGUOUS_PATH']);
});

test('CLI emits valid JSON with code 0 for a clean repo', async (t) => {
  const root = await tree(t, { 'README.md': '# Home' });
  const result = run(root, '--format', 'json');
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).issues.length, 0);
});

test('CLI findings exit 1 and input errors exit 2', async (t) => {
  const root = await tree(t, { 'README.md': '[x](missing)' });
  const result = run(root, '--format', 'json');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).issues[0].code, 'MISSING_PATH');
  assert.equal(run(root, 'does-not-exist.md').status, 2);
  assert.equal(run(root, '--format', 'wrong').status, 2);
  assert.equal(run(root, '--exclude').status, 2);
  assert.equal(run(root, '--typo').status, 2);
});

test('CLI supports help, version and paths starting with a dash', async (t) => {
  const root = await tree(t, { '-guide.md': '# Hello' });
  assert.equal(run(root, '--help').status, 0);
  assert.equal(run(root, '--version').stdout.trim(), '0.1.0');
  assert.equal(run(root, '--', '-guide.md').status, 0);
});

test('Actions output escapes command properties rather than injecting commands', async (t) => {
  const root = await tree(t, { 'a,b%.md': '[x](gone.md)' });
  const result = run(root, '--format', 'github');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error file=a%2Cb%25\.md,line=1,title=MISSING_PATH::/);
});

test('checking does not change document bytes', async (t) => {
  const content = Buffer.from('# Hi\r\n\r\n[x](missing.md)\r\n');
  const root = await tree(t, { 'README.md': content });
  await check({ root });
  assert.deepEqual(await fs.readFile(path.join(root, 'README.md')), content);
});
