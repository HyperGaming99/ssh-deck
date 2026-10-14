// Übersetzung. Die deutschen Texte im Code sind zugleich die Schlüssel: t('Neuer Host').
// Deutsch braucht deshalb keine Datei; alle anderen Sprachen liegen in locales/<code>.json (Test prüft Vollständigkeit).
import { createContext, useContext } from 'react';
import { BR, CN, DE, ES, FR, GB, IN, IT, JP, KR, NL, PL, RU, SA, TR, UA } from 'country-flag-icons/react/3x2';

export const LANGS = [
  { code: 'en', name: 'English', Flag: GB },
  { code: 'de', name: 'Deutsch', Flag: DE },
  { code: 'es', name: 'Español', Flag: ES },
  { code: 'fr', name: 'Français', Flag: FR },
  { code: 'pt', name: 'Português', Flag: BR },
  { code: 'it', name: 'Italiano', Flag: IT },
  { code: 'nl', name: 'Nederlands', Flag: NL },
  { code: 'pl', name: 'Polski', Flag: PL },
  { code: 'ru', name: 'Русский', Flag: RU },
  { code: 'uk', name: 'Українська', Flag: UA },
  { code: 'tr', name: 'Türkçe', Flag: TR },
  { code: 'ja', name: '日本語', Flag: JP },
  { code: 'ko', name: '한국어', Flag: KR },
  { code: 'zh', name: '简体中文', Flag: CN },
  { code: 'ar', name: 'العربية', Flag: SA },
  { code: 'hi', name: 'हिन्दी', Flag: IN },
];
export const RTL = new Set(['ar']);

const files = import.meta.glob('../locales/*.json', { eager: true, import: 'default' });

// vars ersetzt {name}-Platzhalter. Unbekannter Schlüssel (oder Deutsch) = Text unverändert.
export const makeT = (lang) => {
  const dict = files[`../locales/${lang}.json`] || {};
  return (key, vars) => {
    let s = dict[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
};

// Markiert Texte außerhalb von Komponenten (Tabellen); übersetzt wird erst beim Anzeigen mit t(). Der Test findet sie so.
export const T = (s) => s;

export const I18nContext = createContext({ t: (k) => k, lang: 'de' });
export const useT = () => useContext(I18nContext).t;
export const useLang = () => useContext(I18nContext).lang;
