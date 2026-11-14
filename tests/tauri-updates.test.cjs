const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(require.resolve('../src/lib/tauri-bridge.js'), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export default .*;\n?/gm, '').replace(/^export /gm, '');

function setup(current, latest, channel = 'stable') {
  let queries = 0;
  const prerelease = latest.includes('-');
  const context = vm.createContext({
    console, setTimeout, window: { api: {}, __TAURI_INTERNALS__: {} },
    navigator: { platform: 'Linux', userAgent: 'Linux' },
    localStorage: { getItem: () => null }, listen: async () => () => {},
    packageInfo: { version: '0.1.8' },
    getVersion: async () => { queries++; if (current instanceof Error) throw current; return current; },
    invoke: async (name) => {
      if (name === 'deck_store_read') return { updates: { channel } };
      if (name === 'exec_remote_or_local') return { stdout: JSON.stringify([{
        tag_name: `v${latest}`, prerelease, assets: [{ name: 'ssh-deck_amd64.deb', browser_download_url: 'https://example.invalid/update.deb' }],
      }]) };
      throw new Error(`Unexpected IPC: ${name}`);
    },
  });
  vm.runInContext(source, context);
  return { bridge: vm.runInContext('createTauriBridge()', context), queries: () => queries };
}

test('installed stable release is not offered again despite old web package version', async () => {
  const { bridge, queries } = setup('0.2.0', '0.2.0');
  const result = await bridge.update.check();
  assert.equal(result.current, '0.2.0');
  assert.equal(result.available, false);
  assert.equal((await bridge.update.list()).current, '0.2.0');
  assert.equal(queries(), 2);
});

test('installed dev build is not offered again', async () => {
  const { bridge } = setup('0.2.0-dev.42', '0.2.0-dev.42', 'dev');
  assert.equal((await bridge.update.check()).available, false);
});

test('newer stable and newer dev builds are still offered', async () => {
  assert.equal((await setup('0.2.0', '0.2.1').bridge.update.check()).available, true);
  assert.equal((await setup('0.2.0-dev.42', '0.2.0-dev.43', 'dev').bridge.update.check()).available, true);
});

test('failed native version query returns an error instead of claiming version 0.1.8', async () => {
  const { bridge } = setup(new Error('native version unavailable'), '0.2.0');
  const result = await bridge.update.check();
  assert.equal(result.error, 'native version unavailable');
  assert.notEqual(result.current, '0.1.8');
  assert.equal(result.available, undefined);
});
