#!/usr/bin/env bash
# Spielt den Sync-Server im Kubernetes-Cluster ein (oder aktualisiert ihn). Läuft dort, wo kubectl funktioniert (z. B. auf dem Master).
# Start: bash deploy.sh   (im Ordner server/k8s; server.js liegt eine Ebene höher)
set -euo pipefail
cd "$(dirname "$0")"
kubectl apply -f ssh-deck-server.yaml
if [ -f .google-oauth.env ]; then
  kubectl -n ssh-deck create secret generic ssh-deck-google-oauth --from-env-file=.google-oauth.env --dry-run=client -o yaml | kubectl apply -f -
elif [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
  kubectl -n ssh-deck create secret generic ssh-deck-google-oauth --from-literal=GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" --dry-run=client -o yaml | kubectl apply -f -
fi
kubectl -n ssh-deck create configmap ssh-deck-server-code \
  --from-file=server.js=../server.js \
  --from-file=db.js=../db.js \
  --from-file=lib__crypto.js=../lib/crypto.js \
  --from-file=lib__http.js=../lib/http.js \
  --from-file=routes__auth.js=../routes/auth.js \
  --from-file=routes__google.js=../routes/google.js \
  --from-file=routes__vault.js=../routes/vault.js \
  --from-file=routes__teams.js=../routes/teams.js \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n ssh-deck rollout restart deployment/ssh-deck-server
kubectl -n ssh-deck rollout status deployment/ssh-deck-server --timeout=180s
