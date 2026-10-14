// Terminal-Farbschemata (bekannte freie Paletten). 'auto' folgt dem App-Design.
const mk = (id, name, bg, fg, sel, [black, red, green, yellow, blue, magenta, cyan, white]) =>
  ({ id, name, theme: { background: bg, foreground: fg, cursor: fg, selectionBackground: sel, black, red, green, yellow, blue, magenta, cyan, white } });
const SOL = ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'];

export const AUTO = {
  light: { background: '#ffffff', foreground: '#1f2430', cursor: '#1f2430', selectionBackground: '#cfe3ff' },
  dark: { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5', selectionBackground: '#3a3a3a' },
};
export const THEMES = [
  mk('dracula', 'Dracula', '#282a36', '#f8f8f2', '#44475a', ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2']),
  mk('nord', 'Nord', '#2e3440', '#d8dee9', '#434c5e', ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0']),
  mk('tokyo', 'Tokyo Night', '#1a1b26', '#c0caf5', '#33467c', ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6']),
  mk('onedark', 'One Dark', '#282c34', '#abb2bf', '#3e4451', ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf']),
  mk('gruvbox', 'Gruvbox Dark', '#282828', '#ebdbb2', '#504945', ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984']),
  mk('monokai', 'Monokai', '#272822', '#f8f8f2', '#49483e', ['#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2']),
  mk('solard', 'Solarized Dark', '#002b36', '#839496', '#073642', SOL),
  mk('solarl', 'Solarized Light', '#fdf6e3', '#657b83', '#eee8d5', SOL),
  mk('hackerg', 'Hacker Green', '#020b02', '#33ff33', '#0b3d0b', ['#020b02', '#ff3333', '#33ff33', '#ffff33', '#3399ff', '#ff33ff', '#33ffff', '#cccccc']),
  mk('hackerb', 'Hacker Blue', '#020b1a', '#29b6ff', '#0b2f55', ['#020b1a', '#ff5555', '#33ff99', '#ffe14d', '#29b6ff', '#c792ea', '#4df0ff', '#cccccc']),
];
export const FONTS = [['ui-monospace, monospace', 'System'], ['"JetBrains Mono", monospace', 'JetBrains Mono'], ['"Fira Code", monospace', 'Fira Code'], ['"Source Code Pro", monospace', 'Source Code Pro'], ['"IBM Plex Mono", monospace', 'IBM Plex Mono']];
export const resolveTheme = (id, dark) => THEMES.find((x) => x.id === id)?.theme ?? (dark ? AUTO.dark : AUTO.light);

// Farben des ganzen Fensters aus dem Terminal-Theme (CSS-Variablen); null bei 'auto'
export function chromeVars(th) {
  if (!th) return null;
  const mix = (p) => `color-mix(in srgb, ${th.foreground} ${p}%, ${th.background})`;
  return {
    '--background': th.background, '--foreground': th.foreground, '--card': th.background, '--card-foreground': th.foreground, '--popover': th.background, '--popover-foreground': th.foreground,
    '--sidebar': th.background, '--sidebar-foreground': th.foreground, '--border': mix(16), '--input': mix(20), '--accent': mix(10), '--accent-foreground': th.foreground,
    '--secondary': mix(10), '--secondary-foreground': th.foreground, '--muted': mix(8), '--muted-foreground': mix(62), '--primary': th.blue ?? th.foreground, '--primary-foreground': th.background,
  };
}
