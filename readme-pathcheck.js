#!/usr/bin/env node
import { check } from '../src/check.js';

const HELP = `readme-pathcheck 0.1.0
Offline Markdown links with exact filename casing, even on Windows.

Usage: readme-pathcheck [paths...] [options]

  --root PATH       Repository root (default: current directory).
                    Input and exclude paths are relative to this root.
  --exclude PATH    Exclude a file or directory subtree. Repeatable, no globs.
  --format FORMAT   text (default), json, or github (Actions annotations).
  --no-anchors      Only check paths, not Markdown heading fragments.
  --help, -h        Show help.
  --version, -v     Show version.
  --               Treat all remaining arguments as input paths.

Defaults: scan . recursively. Ignore .git, node_modules, .venv, venv,
dist, build, coverage, archive. Symlinks are never followed.
Exit codes: 0 clean, 1 findings, 2 invalid arguments or unreadable inputs.
No network requests. Raw HTML links and non-Markdown fragments are not checked.
`;

function args(argv) {
  const options = { inputs: [], exclude: [], format: 'text' };
  let positional = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (positional) { options.inputs.push(arg); continue; }
    if (arg === '--') { positional = true; continue; }
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--version' || arg === '-v') return { version: true };
    if (arg === '--no-anchors') { options.anchors = false; continue; }
    if (['--root', '--exclude', '--format'].includes(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      if (arg === '--exclude') options.exclude.push(value);
      else options[arg.slice(2)] = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else options.inputs.push(arg);
  }
  if (!['text', 'json', 'github'].includes(options.format)) throw new Error('Format must be text, json, or github.');
  if (options.inputs.length === 0) options.inputs = ['.'];
  return options;
}

const clean = (text) => String(text).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const escapeData = (text) => String(text).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (text) => escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');

try {
  const options = args(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP);
  else if (options.version) console.log('0.1.0');
  else {
    const result = await check(options);
    if (options.format === 'json') console.log(JSON.stringify(result, null, 2));
    else {
      for (const issue of result.issues) {
        const message = `${issue.message} [${issue.href}]${issue.suggestion ? ` Try: ${issue.suggestion}` : ''}`;
        if (options.format === 'github') {
          console.log(`::error file=${escapeProperty(issue.file)},line=${issue.line},title=${issue.code}::${escapeData(message)}`);
        } else console.log(`${clean(issue.file)}:${issue.line} ${issue.code} ${clean(message)}`);
      }
      console.log(`${result.files} Markdown file(s), ${result.checkedLinks} local link(s), ${result.issues.length} issue(s).`);
      console.log(`Skipped: ${result.skippedExternal} external link(s), ${result.skippedHtml} HTML token(s), ${result.skippedSymlinks} symlink(s), ${result.skippedFragments} fragment(s).`);
    }
    process.exitCode = result.issues.length ? 1 : 0;
  }
} catch (error) {
  console.error(`readme-pathcheck: ${clean(error.message)}`);
  process.exitCode = 2;
}
