import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { check } from '../src/check.js';

// Generate a deliberately broken, disposable example outside the user's repo.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'readme-pathcheck-demo-'));
try {
  await fs.mkdir(path.join(root, 'docs'));
  await fs.writeFile(path.join(root, 'README.md'), '# Example\n\n[Install](docs/guide.md#install)\n\n![Screenshot](images/demo.png)\n\n[Old heading](docs/Guide.md#old-heading)\n');
  await fs.writeFile(path.join(root, 'docs', 'Guide.md'), '# Guide\n\n## Install\n');
  const result = await check({ root });
  for (const issue of result.issues) {
    console.log(`${issue.file}:${issue.line} ${issue.code} ${issue.href}`);
    if (issue.suggestion) console.log(`  Try: ${issue.suggestion}`);
  }
  if (result.issues.length !== 3) throw new Error('Demo did not find the expected three issues.');
  console.log('\nDemo complete: found the three intentional problems. Your files were not changed.');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
