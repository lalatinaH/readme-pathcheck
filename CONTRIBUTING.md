# Contributing

Small reproducible bug reports are especially useful for this first release.

## Report a problem

Open an issue with:

1. Your operating system, Node version, and readme-pathcheck version.
2. The command you ran and its output.
3. A minimal Markdown snippet and the exact filenames, preserving case.
4. What you expected and what happened.

Use dummy files. Do not post private source code, tokens, email addresses, or logs containing personal information. Raw HTML links, custom anchor IDs, MDX, site-generator routes, and external URL checks are outside the current scope.

## Make a change

Fork the repo, create a branch, then:

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run demo
```

Add a regression test that fails before your fix. Keep filesystem tests in temporary folders. Avoid adding network access to the checker or changing the scanned documents. If behavior or flags change, update both README files and the changelog.

Open a pull request explaining the problem, the change, and how you tested it. AI-assisted contributions are welcome when the author understands the code and can explain its behavior. Maintainers review contributions before merging. There is no promised response time.

## Release checklist

- Run all tests, documentation checks, and the demo.
- Confirm the hosted CI result for the exact commit being released.
- Install an `npm pack` archive into a fresh folder and run its CLI.
- Update the package version and CLI version together, then update the lockfile.
- Record changes and limitations in `CHANGELOG.md`.
- Tag the reviewed commit and publish GitHub release notes.
- Never describe a planned feature or a local-only test as a shipped or cross-platform verified result.
