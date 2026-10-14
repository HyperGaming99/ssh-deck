// Betriebssystem-Icon aus der Ausgabe von `cat /etc/os-release || uname -s`. Rückgabe: Icon-Slug oder ''.
const MAP = {
  ubuntu: 'ubuntu-linux', debian: 'debian-linux', raspbian: 'raspberry-pi', fedora: 'fedora',
  arch: 'arch-linux', archarm: 'arch-linux', manjaro: 'arch-linux', centos: 'centos', rocky: 'rocky-linux',
  almalinux: 'alma-linux', alpine: 'alpine-linux', nixos: 'nixos', openwrt: 'openwrt', linuxmint: 'linux-mint',
  opensuse: 'opensuse', 'opensuse-leap': 'opensuse', 'opensuse-tumbleweed': 'opensuse', sles: 'opensuse',
};

function osIcon(text) {
  const kv = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(ID|ID_LIKE)=(["']?)(.*)\2$/);
    if (m) kv[m[1]] = m[3].toLowerCase();
  }
  if (kv.ID) {
    // ID zuerst, dann ID_LIKE (Derivate, z. B. Pop!_OS -> ubuntu -> debian)
    for (const id of [kv.ID, ...(kv.ID_LIKE || '').split(' ')]) if (MAP[id]) return MAP[id];
    return 'linux';
  }
  return /^darwin/i.test(text.trim()) ? 'apple' : '';
}

module.exports = { osIcon };
