// Exercise the real bridge with mocked IPC; no server or credentials needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(require.resolve('../src/lib/tauri-bridge.js'), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export default .*;\n?/gm, '')
  .replace(/^export /gm, '');

function setup(key, answer) {
  const calls = [], statuses = [];
  let bridge;
  const context = vm.createContext({
    console, setTimeout: (cb) => { queueMicrotask(cb); },
    getVersion: async () => '0.1.8', packageInfo: { version: '0.1.8' },
    window: { api: {}, __TAURI_INTERNALS__: {} },
    navigator: { platform: 'Linux', userAgent: 'Linux' },
    localStorage: { getItem: () => null },
    listen: async () => () => {},
    invoke: async (name, args) => {
      calls.push({ name, args });
      if (name === 'hosts_ping') return { ok: true };
      if (name === 'ssh_host_key') {
        if (key instanceof Error) throw key;
        return key;
      }
      return null;
    },
  });
  vm.runInContext(source, context);
  bridge = vm.runInContext('createTauriBridge()', context);
  bridge.hosts.list = async () => [{ id: 'host', host: '10.0.0.7', port: 22, user: 'test' }];
  bridge.onStatus((sid, conn) => {
    statuses.push(conn);
    if (conn.state === 'ask' && conn.ask.kind === 'hostkey') {
      if (answer === null) bridge.close(sid);
      else bridge.answer(sid, answer);
    }
  });
  return { bridge, calls, statuses };
}

test('changed key shows both fingerprints before opening SSH', async () => {
  const key = { status: 'changed', host: '10.0.0.7', port: 22, type: 'ssh-ed25519', old: 'SHA256:old', fingerprint: 'SHA256:new' };
  const { bridge, calls, statuses } = setup(key, { save: true });
  await bridge.open('tab', 'host', 80, 24);
  const prompt = statuses.find((s) => s.state === 'ask');
  assert.equal(prompt.ask.old, key.old);
  assert.equal(prompt.ask.fingerprint, key.fingerprint);
  assert.equal(calls.find((c) => c.name === 'ssh_open').args.hostKeyAnswer.save, true);
  assert.equal(statuses.at(-1).state, 'ready');
});

test('continue once does not request persistence', async () => {
  const { bridge, calls } = setup({ status: 'unknown' }, { save: false });
  await bridge.open('tab', 'host', 80, 24);
  assert.equal(calls.find((c) => c.name === 'ssh_open').args.hostKeyAnswer.save, false);
});

test('known key connects without a prompt', async () => {
  const { bridge, calls, statuses } = setup({ status: 'known' });
  await bridge.open('tab', 'host', 80, 24);
  assert.equal(statuses.some((s) => s.state === 'ask'), false);
  assert.equal(calls.find((c) => c.name === 'ssh_open').args.hostKeyAnswer, null);
});

test('closing the prompt cancels without opening SSH', async () => {
  const { bridge, calls, statuses } = setup({ status: 'changed' }, null);
  await bridge.open('tab', 'host', 80, 24);
  assert.equal(calls.some((c) => c.name === 'ssh_open'), false);
  assert.equal(statuses.some((s) => s.state === 'ready'), false);
  assert(calls.some((c) => c.name === 'ssh_close'));
});

test('key scan failure is visible and cannot open SSH', async () => {
  const { bridge, calls, statuses } = setup(new Error('scan failed'));
  await bridge.open('tab', 'host', 80, 24);
  assert.equal(calls.some((c) => c.name === 'ssh_open'), false);
  assert.equal(statuses.at(-1).state, 'failed');
  assert(statuses.at(-1).log.at(-1).includes('scan failed'));
});
