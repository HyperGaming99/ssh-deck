// Reine Helfer: ssh-Befehl und ~/.ssh/config-Einträge aus Hosts (nie Passwörter).
const bare = (h) => String(h).replace(/^\[(.*)\]$/, '$1'); // [::1] -> ::1
const q = (s) => (/^[\w@%+=:,./~-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`); // Shell-Quoting nur wenn nötig

export function sshCommand(h) {
  const port = +h.port || 22;
  return ['ssh', port !== 22 && `-p ${port}`, h.keyPath && `-i ${q(h.keyPath)}`, `${h.user ? h.user + '@' : ''}${bare(h.host)}`].filter(Boolean).join(' ');
}

export const configAlias = (h) => String(h.name || h.host).replace(/\s+/g, '').replace(/[*?!,]/g, '') || bare(h.host);

export function sshConfig(list) {
  return list.map((h) => {
    const port = +h.port || 22;
    return [`Host ${configAlias(h)}`, `  HostName ${bare(h.host)}`, h.user && `  User ${h.user}`, port !== 22 && `  Port ${port}`, h.keyPath && `  IdentityFile ${h.keyPath}`].filter(Boolean).join('\n');
  }).join('\n\n') + '\n';
}
