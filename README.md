# readme-pathcheck

Catch local Markdown links that work on your laptop but break on GitHub.

[繁體中文](README.zh-Hant.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

`readme-pathcheck` is an offline command-line tool for README and documentation maintainers. It checks **exact filename casing on Windows, macOS, and Linux**, missing files and images, and GitHub-style Markdown heading anchors.

For example, a link to `docs/guide.md` can work on a Windows machine even when the actual file is `docs/Guide.md`. This tool reports the mismatch and suggests the correct destination before you push.

```text
README.md:3 PATH_CASE docs/guide.md#install
  Try: docs/Guide.md#install
README.md:5 MISSING_PATH images/demo.png
README.md:7 MISSING_ANCHOR docs/Guide.md#old-heading
```

Try this exact example with `npm run demo`. It creates a temporary example and removes it when finished. It does not edit your documentation.

## Install

Requires **Node.js 22 or newer** and Git. This first release is distributed through GitHub, not the npm registry.

```sh
git clone https://github.com/lalatinaH/readme-pathcheck.git
cd readme-pathcheck
npm ci --ignore-scripts
node bin/readme-pathcheck.js --help
npm run demo
```

To make the command available from other folders:

```sh
npm install -g . --ignore-scripts
readme-pathcheck --root /path/to/your/repo
```

On Windows:

```powershell
readme-pathcheck --root "C:\Projects\my-repo"
```

You can also call `node /path/to/readme-pathcheck/bin/readme-pathcheck.js --root /path/to/your/repo` without installing a global command. Installation downloads dependencies. **Running a check makes no network requests**, requires no account, and does not modify files.

## Usage

```sh
# Scan a repository, recursively
readme-pathcheck --root /path/to/repo

# Scan only these inputs, relative to --root
readme-pathcheck README.md docs --root /path/to/repo

# Exclude draft or generated source documents (exact paths, not globs)
readme-pathcheck --exclude docs/drafts --exclude generated

# Machine-readable output
readme-pathcheck --format json

# GitHub Actions annotations
readme-pathcheck --format github

# Skip fragment checks for documentation using custom anchor IDs
readme-pathcheck --no-anchors
```

The default root is the current directory. All input and exclusion paths are resolved against `--root`. A Markdown destination beginning with `/` is resolved against the same root. Set it to the repository root, not a nested docs folder.

| Exit code | Meaning |
| --- | --- |
| `0` | No problems found in the supported checks |
| `1` | Link or path problems found |
| `2` | Invalid options, missing/unreadable inputs, invalid UTF-8, oversized input, or no Markdown files |

JSON output includes a schema `version` (currently `1`), file/link counts, skipped-item counts, and `issues`. Each issue has `file`, `line`, `code`, `href`, `message`, and optionally `suggestion`. Fatal input errors go to stderr with exit code `2`, rather than producing a partial JSON report.

## What it checks

- Inline, reference, shortcut, collapsed reference, and image links in `.md` and `.markdown` files.
- Every directory and filename component, using actual directory entries rather than the host's case-insensitive file lookup.
- Unicode filenames and percent-encoded spaces, hashes, and fragments.
- GitHub-style heading anchors, including repeated headings and non-Latin text, using `github-slugger`.
- Missing targets, Windows drive paths, `file:` links, backslashes, and paths that leave the selected root.
- Symlink destinations, which are reported instead of followed.

Markdown parsing uses `markdown-it`, including tables and strikethrough. Links shown inside fenced/indented code, inline code, comments, or YAML front matter are not treated as live Markdown links.

## Boundaries

This is a small first release, with a deliberately limited scope:

- **External URLs are skipped**, including HTTP, HTTPS, mailto, and other schemes. There is no HTTP status check.
- **Raw HTML links/images and custom HTML anchors are not supported.** HTML token counts are included in the summary. Use `--no-anchors` when a document relies on custom IDs. HTML token counts include markup and comments, not just links.
- Fragments in non-Markdown destinations (HTML, PDF, SVG, and others) are skipped. Directory links are accepted if the directory exists. A directory's README is not used for fragment resolution.
- GitHub-style Markdown is the target. MDX, wiki links, footnotes, templating, GitHub emoji shortcodes, and static-site routes are not interpreted. A heading containing those extensions may need `--no-anchors`.
- Line numbers point to the **start of the containing Markdown block**. Several links in a multiline paragraph can share a reported line.
- `.gitignore` is not read. The scanner skips directories named `.git`, `node_modules`, `.venv`, `venv`, `dist`, `build`, `coverage`, and `archive`. Use `--exclude` for other generated trees. Explicit inputs inside a default-ignored tree can still be scanned.
- Exclusions affect which documents are scanned, not whether a link target may be resolved.
- Input and target Markdown files must be UTF-8 and at most 2 MiB each. Symlinks are not followed. Use a stable checkout, not a tree being rewritten during a check.
- Unicode case/normalization diagnostics use JavaScript's normalization and lowercase rules. They do not model every filesystem's collation behavior.

For web URL crawling or a broader set of formats, consider [lychee](https://github.com/lycheeverse/lychee) or [markdown-link-check](https://github.com/tcort/markdown-link-check). This project focuses on offline paths and precise filename spelling.

## GitHub Actions

The repository's own [CI workflow](.github/workflows/ci.yml) tests on Linux, Windows, and macOS, including Node 22 and an additional Linux/Node 24 job.

To check another repository, save this example as `.github/workflows/docs-paths.yml` in that repository:

```yaml
name: Documentation paths
on: [push, pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Install checker from GitHub
        run: npm install --prefix "$RUNNER_TEMP/pathcheck" --ignore-scripts https://github.com/lalatinaH/readme-pathcheck/archive/refs/heads/main.tar.gz
      - name: Check local documentation
        run: node "$RUNNER_TEMP/pathcheck/node_modules/readme-pathcheck/bin/readme-pathcheck.js" --format github
```

The example follows `main`. For reproducible downstream builds, replace `refs/heads/main` with a reviewed commit SHA in the archive URL (`archive/<SHA>.tar.gz`).

## Development

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run demo
```

Tests create isolated temporary repositories and exercise parsing, filesystem behavior, CLI exit codes, output escaping, symlinks, and read-only behavior. Case-collision tests skip on filesystems that cannot store both names and run on Linux CI.

See [CONTRIBUTING.md](CONTRIBUTING.md) for reporting a reproducible failure and [ROADMAP.md](ROADMAP.md) for candidate improvements. The project is new. No downstream adoption or sponsorship is claimed.

## License and credits

[MIT](LICENSE). Built with [markdown-it](https://github.com/markdown-it/markdown-it) and [github-slugger](https://github.com/Flet/github-slugger), which retain their own licenses. Initial implementation and documentation were created with Codex assistance and are maintained under the `lalatinaH` account.
