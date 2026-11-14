// Keep the app's full SemVer while respecting each installer's version rules.
function releaseConfig(version, packageVersion, runNumber, platform) {
  if (!/^\d+\.\d+\.\d+$/.test(packageVersion) ||
      !(version === packageVersion || version.startsWith(`${packageVersion}-dev.`))) {
    throw new Error('Invalid release version');
  }
  const targets = {
    linux: ['deb', 'appimage'], // RPM is not distributed and rejects SemVer's '-'.
    windows: ['msi', 'nsis'],
    macos: ['app', 'dmg'],
  }[platform];
  if (!targets) throw new Error(`Unsupported release platform: ${platform}`);
  const config = { version, bundle: { targets } };
  if (platform === 'windows') {
    const [major, minor, patch] = packageVersion.split('.').map(Number);
    const build = version === packageVersion ? 0 : Number(runNumber);
    if (major > 255 || minor > 255 || patch > 65535 ||
        !Number.isInteger(build) || build < 0 || build > 65535) {
      throw new Error('Version exceeds MSI numeric version limits');
    }
    config.bundle.windows = { wix: { version: `${packageVersion}.${build}` } };
  }
  return config;
}

module.exports = { releaseConfig };
if (require.main === module) {
  const [version, packageVersion, runNumber, platform] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(releaseConfig(version, packageVersion, runNumber, platform)));
}
