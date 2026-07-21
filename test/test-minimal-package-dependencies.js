import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const packageJson = JSON.parse(
  await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
  '@modelcontextprotocol/sdk',
  'isbinaryfile',
  'zod',
  'zod-to-json-schema',
]);

assert.deepEqual(Object.keys(packageJson.devDependencies).sort(), [
  '@types/node',
  'shx',
  'typescript',
]);

assert.equal('optionalDependencies' in packageJson, false);

const packageLock = JSON.parse(
  await fs.readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
);
assert.equal(packageLock.name, packageJson.name);
assert.equal(packageLock.version, packageJson.version);
assert.equal(packageLock.lockfileVersion, 3);
assert.deepEqual(packageLock.packages[''].dependencies, packageJson.dependencies);
assert.deepEqual(packageLock.packages[''].devDependencies, packageJson.devDependencies);

for (const removedDependency of [
  '@opendocsg/pdf2md',
  '@supabase/supabase-js',
  '@tiptap/core',
  '@vscode/ripgrep',
  'caffeinate',
  'exceljs',
  'fastest-levenshtein',
  'md-to-pdf',
  'pdf-lib',
  'sharp',
  'unpdf',
]) {
  assert.equal(
    JSON.stringify(packageJson).includes(removedDependency),
    false,
    `removed dependency remains: ${removedDependency}`,
  );
}

console.log('Minimal package dependency contract passed');
