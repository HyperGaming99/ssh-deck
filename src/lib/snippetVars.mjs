// Platzhalter in Snippets: {{name}} oder {{name:Standardwert}}
const RE = /\{\{\s*([\w.-]+)\s*(?::([^}]*))?\}\}/g;

// Liste der Platzhalter [{ name, def }] (jeder Name einmal, erste Angabe zählt)
export function vars(cmd) {
  const seen = new Map();
  for (const [, name, def] of String(cmd).matchAll(RE)) if (!seen.has(name)) seen.set(name, def ?? '');
  return [...seen].map(([name, def]) => ({ name, def }));
}

// Ersetzt alle Platzhalter durch values[name]
export const fill = (cmd, values) => String(cmd).replace(RE, (_, name) => values[name] ?? '');
