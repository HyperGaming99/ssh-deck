// Läuft vor dem Bundle: Dark-Klasse sofort setzen, damit kein heller Blitz entsteht.
try { if (localStorage.getItem('dark') === '1') document.documentElement.classList.add('dark'); } catch (e) { /* egal */ }
