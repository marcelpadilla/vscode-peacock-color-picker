import { defineConfig } from '@vscode/test-cli';

// macOS caps unix socket paths at 103 characters and VS Code puts its main
// socket inside the user-data directory, so a deep checkout can overflow it.
// Keeping the throwaway profile short avoids that wherever this is cloned.
const TEST_PROFILE = '/tmp/pcp-vt';

const shared = {
  files: 'out/test/**/*.test.js',
  workspaceFolder: './test-fixtures/workspace',
  // Peacock is a runtime requirement rather than an extensionDependency, so the
  // test host has to install it explicitly.
  installExtensions: ['johnpapa.vscode-peacock'],
  mocha: { ui: 'tdd', timeout: 60_000 },
};

export default defineConfig([
  {
    ...shared,
    label: 'stable',
    version: 'stable',
    launchArgs: [`--user-data-dir=${TEST_PROFILE}/stable`],
  },
  {
    // The floor declared in engines.vscode. Running the suite here is what
    // makes that number a claim we have checked rather than a guess.
    ...shared,
    label: 'oldest-supported',
    version: '1.84.0',
    launchArgs: [`--user-data-dir=${TEST_PROFILE}/oldest`],
  },
]);
