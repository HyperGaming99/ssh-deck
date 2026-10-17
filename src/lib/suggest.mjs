// Befehlsvorschläge beim Tippen: Treffer sind Befehle, die mit der getippten Zeile beginnen.
// Reihenfolge: Verlauf dieser Sitzung (neueste zuerst), Snippets, häufige Befehle. Reine Funktion, ohne Oberfläche.
export const COMMON = [
  'ls -la', 'ls -lh', 'cd ..', 'cd ~', 'pwd', 'clear', 'cat /etc/os-release', 'uname -a', 'whoami', 'history',
  'df -h', 'du -sh *', 'free -h', 'top', 'htop', 'ps aux', 'ps aux | grep ', 'uptime', 'ip a', 'ip route', 'ss -tulpn',
  'systemctl status ', 'systemctl restart ', 'systemctl enable --now ', 'systemctl list-units --failed', 'journalctl -u ', 'journalctl -f', 'journalctl -xe',
  'tail -f ', 'tail -n 100 ', 'less ', 'grep -r ', 'grep -rn ', 'find . -name ', 'chmod +x ', 'chmod 600 ', 'chown -R ', 'mkdir -p ', 'rm -rf ', 'cp -r ', 'mv ', 'ln -s ',
  'tar -czf ', 'tar -xzf ', 'unzip ', 'curl -I ', 'curl -fsSL ', 'wget ', 'ping -c 4 ', 'ssh-keygen -t ed25519', 'scp ', 'rsync -avz ',
  'sudo apt update', 'sudo apt upgrade', 'sudo apt install ', 'sudo apt autoremove', 'sudo reboot', 'sudo systemctl ', 'sudo nano ', 'sudo su', 'sudo journalctl ',
  'git status', 'git pull', 'git push', 'git add .', 'git commit -m ""', 'git log --oneline', 'git diff', 'git checkout ', 'git branch', 'git stash', 'git clone ',
  'docker ps', 'docker ps -a', 'docker images', 'docker logs -f ', 'docker exec -it ', 'docker compose up -d', 'docker compose down', 'docker compose logs -f', 'docker system prune',
  'kubectl get pods', 'kubectl get pods -A', 'kubectl get nodes', 'kubectl get svc', 'kubectl logs -f ', 'kubectl describe pod ', 'kubectl exec -it ', 'kubectl apply -f ',
  'nano ', 'vim ', 'tmux', 'tmux attach', 'screen -r', 'crontab -e', 'env', 'export ', 'which ', 'man ', 'exit',
];

export function suggest(line, { history = [], snippets = [], common = COMMON } = {}, max = 5) {
  if (line.trim().length < 2) return [];
  const out = [], seen = new Set([line]);
  const add = (list, src) => { for (const text of list) { if (out.length >= max) return; if (text.startsWith(line) && !seen.has(text)) { seen.add(text); out.push({ text, src }); } } };
  add([...history].reverse(), 'hist');
  add(snippets, 'snip');
  add(common, 'common');
  return out;
}
