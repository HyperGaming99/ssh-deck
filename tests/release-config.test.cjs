const assert = require('node:assert/strict');
const { test } = require('node:test');
const { releaseConfig } = require('../scripts/tauri-release-config.cjs');

test('Linux dev builds retain full app version and build only published formats', () => {
  const config = releaseConfig('0.1.9-dev.86', '0.1.9', 86, 'linux');
  assert.equal(config.version, '0.1.9-dev.86');
  assert.deepEqual(config.bundle.targets, ['deb', 'appimage']);
});

test('Windows dev builds use a numeric MSI version without losing app SemVer', () => {
  const config = releaseConfig('0.1.9-dev.86', '0.1.9', 86, 'windows');
  assert.equal(config.version, '0.1.9-dev.86');
  assert.equal(config.bundle.windows.wix.version, '0.1.9.86');
  assert.deepEqual(config.bundle.targets, ['msi', 'nsis']);
  assert.equal(releaseConfig('0.1.9-dev.87', '0.1.9', 87, 'windows').bundle.windows.wix.version, '0.1.9.87');
});

test('stable Windows builds keep stable numeric installer versions', () => {
  const config = releaseConfig('0.1.9', '0.1.9', 88, 'windows');
  assert.equal(config.version, '0.1.9');
  assert.equal(config.bundle.windows.wix.version, '0.1.9.0');
});

test('macOS keeps the full app version and existing bundle formats', () => {
  const config = releaseConfig('0.1.9-dev.86', '0.1.9', 86, 'macos');
  assert.equal(config.version, '0.1.9-dev.86');
  assert.deepEqual(config.bundle.targets, ['app', 'dmg']);
});

test('unsupported platforms and out-of-range MSI versions fail explicitly', () => {
  assert.throws(() => releaseConfig('0.1.9-dev.86', '0.1.9', 86, 'unknown'));
  assert.throws(() => releaseConfig('0.1.9-dev.65536', '0.1.9', 65536, 'windows'));
});
