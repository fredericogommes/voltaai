'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => /^test_.*\.js$/.test(name))
  .sort();

let failed = false;
for (const name of tests) {
  process.stdout.write(`\n=== ${name}\n`);
  const result = spawnSync(process.execPath, [path.join(root, 'tests', name), root], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error || result.status !== 0 || /(^|\n)FALHOU\s/m.test(result.stdout || '')) failed = true;
}

if (failed) {
  process.stderr.write('\nUm ou mais testes falharam.\n');
  process.exit(1);
}
process.stdout.write(`\n${tests.length} arquivos de teste passaram.\n`);
