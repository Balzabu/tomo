import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/useSettings';

export type SchemeId =
  | 'notte'
  | 'mocha'
  | 'dracula'
  | 'nord'
  | 'rosa'
  | 'foresta'
  | 'gruvbox'
  | 'giorno'
  | 'carta'
  | 'sereno'
  | 'solarized'
  | 'onedark'
  | 'monokai'
  | 'ayu'
  | 'solarizedLight'
  | 'gruvboxLight';

export type SchemeChoice = 'system' | SchemeId;

export interface ThemeColors {
  primary: string;
  primaryDim: string;
  accent: string;
  success: string;
  danger: string;
  star: string;
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  overlay: string;
}

export interface Theme {
  id: SchemeId;
  name: string;
  dark: boolean;
  colors: ThemeColors;
}

// Colour schemes
export const SCHEMES: Record<SchemeId, Theme> = {
  notte: {
    id: 'notte',
    name: 'Notte',
    dark: true,
    colors: {
      primary: '#7aa2f7', primaryDim: '#6889d6', accent: '#bb9af7',
      success: '#9ece6a', danger: '#f7768e', star: '#e0af68',
      bg: '#1a1b26', card: '#24283b', cardAlt: '#2f334d', border: '#3b4261',
      text: '#c0caf5', textMuted: '#9aa5ce', textFaint: '#565f89',
      overlay: 'rgba(0,0,0,0.6)',
    },
  },
  mocha: {
    id: 'mocha',
    name: 'Mocha',
    dark: true,
    colors: {
      primary: '#cba6f7', primaryDim: '#a98fdc', accent: '#f5c2e7',
      success: '#a6e3a1', danger: '#f38ba8', star: '#f9e2af',
      bg: '#1e1e2e', card: '#28283d', cardAlt: '#313244', border: '#45475a',
      text: '#cdd6f4', textMuted: '#a6adc8', textFaint: '#6c7086',
      overlay: 'rgba(17,17,27,0.7)',
    },
  },
  dracula: {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    colors: {
      primary: '#bd93f9', primaryDim: '#9d77da', accent: '#ff79c6',
      success: '#50fa7b', danger: '#ff5555', star: '#f1fa8c',
      bg: '#282a36', card: '#343746', cardAlt: '#44475a', border: '#4d5066',
      text: '#f8f8f2', textMuted: '#c3c4cf', textFaint: '#6272a4',
      overlay: 'rgba(0,0,0,0.6)',
    },
  },
  nord: {
    id: 'nord',
    name: 'Nord',
    dark: true,
    colors: {
      primary: '#88c0d0', primaryDim: '#6ba3b8', accent: '#81a1c1',
      success: '#a3be8c', danger: '#bf616a', star: '#ebcb8b',
      bg: '#2e3440', card: '#3b4252', cardAlt: '#434c5e', border: '#4c566a',
      text: '#eceff4', textMuted: '#d8dee9', textFaint: '#7b88a1',
      overlay: 'rgba(0,0,0,0.55)',
    },
  },
  rosa: {
    id: 'rosa',
    name: 'Rosé',
    dark: true,
    colors: {
      primary: '#ebbcba', primaryDim: '#d7827e', accent: '#c4a7e7',
      success: '#9ccfd8', danger: '#eb6f92', star: '#f6c177',
      bg: '#191724', card: '#1f1d2e', cardAlt: '#26233a', border: '#403d52',
      text: '#e0def4', textMuted: '#908caa', textFaint: '#6e6a86',
      overlay: 'rgba(0,0,0,0.6)',
    },
  },
  foresta: {
    id: 'foresta',
    name: 'Foresta',
    dark: true,
    colors: {
      primary: '#a7c080', primaryDim: '#8aa66a', accent: '#83c092',
      success: '#a7c080', danger: '#e67e80', star: '#dbbc7f',
      bg: '#2d353b', card: '#343f44', cardAlt: '#3d484d', border: '#4a555b',
      text: '#d3c6aa', textMuted: '#a6b0a0', textFaint: '#859289',
      overlay: 'rgba(0,0,0,0.5)',
    },
  },
  gruvbox: {
    id: 'gruvbox',
    name: 'Gruvbox',
    dark: true,
    colors: {
      primary: '#fabd2f', primaryDim: '#d79921', accent: '#fe8019',
      success: '#b8bb26', danger: '#fb4934', star: '#fabd2f',
      bg: '#282828', card: '#32302f', cardAlt: '#3c3836', border: '#504945',
      text: '#ebdbb2', textMuted: '#bdae93', textFaint: '#928374',
      overlay: 'rgba(0,0,0,0.55)',
    },
  },
  giorno: {
    id: 'giorno',
    name: 'Giorno',
    dark: false,
    colors: {
      primary: '#8839ef', primaryDim: '#7127d6', accent: '#ea76cb',
      success: '#40a02b', danger: '#d20f39', star: '#df8e1d',
      bg: '#eff1f5', card: '#ffffff', cardAlt: '#e6e9ef', border: '#ccd0da',
      text: '#4c4f69', textMuted: '#6c6f85', textFaint: '#9ca0b0',
      overlay: 'rgba(0,0,0,0.3)',
    },
  },
  carta: {
    id: 'carta',
    name: 'Carta',
    dark: false,
    colors: {
      primary: '#a6722c', primaryDim: '#8a5d22', accent: '#b5651d',
      success: '#6b8e23', danger: '#b22222', star: '#c79100',
      bg: '#f4ecd8', card: '#fcf8ec', cardAlt: '#eaddc2', border: '#ddcfac',
      text: '#4b3f2f', textMuted: '#7a6c56', textFaint: '#a89a80',
      overlay: 'rgba(60,40,20,0.35)',
    },
  },
  sereno: {
    id: 'sereno',
    name: 'Sereno',
    dark: false,
    colors: {
      primary: '#5e81ac', primaryDim: '#4c6f99', accent: '#b48ead',
      success: '#4a934a', danger: '#bf616a', star: '#d08770',
      bg: '#f7f9fc', card: '#ffffff', cardAlt: '#eef2f8', border: '#dbe2ec',
      text: '#2e3440', textMuted: '#5a6678', textFaint: '#97a0b0',
      overlay: 'rgba(0,0,0,0.3)',
    },
  },
  solarized: {
    id: 'solarized',
    name: 'Solarized',
    dark: true,
    colors: {
      primary: '#268bd2', primaryDim: '#1f6fa8', accent: '#6c71c4',
      success: '#859900', danger: '#dc322f', star: '#b58900',
      bg: '#002b36', card: '#073642', cardAlt: '#0d4451', border: '#1a5663',
      text: '#93a1a1', textMuted: '#839496', textFaint: '#586e75',
      overlay: 'rgba(0,0,0,0.5)',
    },
  },
  onedark: {
    id: 'onedark',
    name: 'One Dark',
    dark: true,
    colors: {
      primary: '#61afef', primaryDim: '#4d8fd6', accent: '#c678dd',
      success: '#98c379', danger: '#e06c75', star: '#e5c07b',
      bg: '#282c34', card: '#2f343f', cardAlt: '#3b414d', border: '#4b5263',
      text: '#abb2bf', textMuted: '#8b92a0', textFaint: '#5c6370',
      overlay: 'rgba(0,0,0,0.6)',
    },
  },
  monokai: {
    id: 'monokai',
    name: 'Monokai',
    dark: true,
    colors: {
      primary: '#66d9ef', primaryDim: '#46bcd8', accent: '#ae81ff',
      success: '#a6e22e', danger: '#f92672', star: '#e6db74',
      bg: '#272822', card: '#2f302a', cardAlt: '#3a3b32', border: '#4a4b40',
      text: '#f8f8f2', textMuted: '#bdbdb0', textFaint: '#75715e',
      overlay: 'rgba(0,0,0,0.6)',
    },
  },
  ayu: {
    id: 'ayu',
    name: 'Ayu',
    dark: true,
    colors: {
      primary: '#ffcc66', primaryDim: '#e0a838', accent: '#5ccfe6',
      success: '#bae67e', danger: '#ff6666', star: '#ffd580',
      bg: '#1f2430', card: '#242b38', cardAlt: '#2d3441', border: '#3d4654',
      text: '#cccac2', textMuted: '#a8aeb8', textFaint: '#707a8c',
      overlay: 'rgba(0,0,0,0.55)',
    },
  },
  solarizedLight: {
    id: 'solarizedLight',
    name: 'Solarized Light',
    dark: false,
    colors: {
      primary: '#268bd2', primaryDim: '#1f6fa8', accent: '#6c71c4',
      success: '#859900', danger: '#dc322f', star: '#b58900',
      bg: '#fdf6e3', card: '#fffbf0', cardAlt: '#eee8d5', border: '#ddd6c1',
      text: '#586e75', textMuted: '#657b83', textFaint: '#93a1a1',
      overlay: 'rgba(0,0,0,0.3)',
    },
  },
  gruvboxLight: {
    id: 'gruvboxLight',
    name: 'Gruvbox Light',
    dark: false,
    colors: {
      primary: '#d65d0e', primaryDim: '#af3a03', accent: '#b16286',
      success: '#79740e', danger: '#9d0006', star: '#b57614',
      bg: '#fbf1c7', card: '#f9f5d7', cardAlt: '#ebdbb2', border: '#d5c4a1',
      text: '#3c3836', textMuted: '#665c54', textFaint: '#928374',
      overlay: 'rgba(60,50,20,0.25)',
    },
  },
};

// Order shown in the picker (dark first, then light).
export const SCHEME_LIST: SchemeId[] = [
  'notte', 'mocha', 'dracula', 'nord', 'rosa', 'foresta', 'gruvbox',
  'solarized', 'onedark', 'monokai', 'ayu',
  'giorno', 'sereno', 'carta', 'solarizedLight', 'gruvboxLight',
];

const DEFAULT_DARK: SchemeId = 'notte';
const DEFAULT_LIGHT: SchemeId = 'giorno';

export function resolveScheme(choice: SchemeChoice, system: 'light' | 'dark'): Theme {
  if (choice === 'system') {
    return SCHEMES[system === 'light' ? DEFAULT_LIGHT : DEFAULT_DARK];
  }
  return SCHEMES[choice] ?? SCHEMES[DEFAULT_DARK];
}

export function useTheme(): Theme {
  const system = useColorScheme();
  const choice = useSettings((s) => s.scheme);
  return resolveScheme(choice, system === 'light' ? 'light' : 'dark');
}

/** Best-contrast text/icon colour to place ON TOP of a given fill colour. */
export function onColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#15151f' : '#ffffff';
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

export const SHELF_COLORS = [
  '#7c5cff',
  '#748ffc',
  '#4dabf7',
  '#22b8cf',
  '#63e6be',
  '#3ecf8e',
  '#a9e34b',
  '#ffd43b',
  '#ffb454',
  '#ff922b',
  '#ff6b6b',
  '#f783ac',
  '#e599f7',
  '#adb5bd',
];
