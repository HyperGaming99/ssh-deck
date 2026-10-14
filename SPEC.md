# Clean-Room-Spec (nur Verhalten, kein Fremdcode)

Quelle: Feature-Namen aus der REA-Strukturanalyse einer installierten SSH-Client-App.

Layout: linke Icon-Leiste (Hosts, Keychain, Port-Forwarding, Snippets, Known Hosts, Logs),
oben Tab-Leiste (erster Tab = Übersicht, danach Terminal-Tabs), Hauptfläche dunkel.
Hosts: Karten-Raster, Gruppen, Suche, Klick = verbinden.
Port-Forwarding: Regeln local / remote / dynamic, an Host gebunden, start/stop.
Snippets: benannte Befehle, per Klick ins aktive Terminal.
Später: SFTP, Keychain, Known Hosts, Session-Logs, Command-Palette.

Umsetzung in dieser Runde: Hosts+Gruppen+Suche, Snippets, Local-Port-Forwarding.
