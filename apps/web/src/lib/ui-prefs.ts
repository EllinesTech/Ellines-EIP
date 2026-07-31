export type UiTheme = 'dark' | 'dim';
export type UiAccent = 'violet' | 'blue' | 'teal';
export type UiDensity = 'comfortable' | 'compact';

export type UiPrefs = {
  theme: UiTheme;
  accent: UiAccent;
  density: UiDensity;
  /** Show Universal Enterprise Model count strip on Overview. */
  showUemStrip: boolean;
  /** Soften chart sparklines on KPI cards. */
  showSparklines: boolean;
  /** Prefer reduced motion (respects OS when true). */
  reduceMotion: boolean;
};

const STORAGE_KEY = 'eip_ui_prefs';
export const UI_PREFS_EVENT = 'eip-ui-prefs';

export const DEFAULT_UI_PREFS: UiPrefs = {
  theme: 'dark',
  accent: 'violet',
  density: 'comfortable',
  showUemStrip: true,
  showSparklines: true,
  reduceMotion: false,
};

export function readUiPrefs(): UiPrefs {
  if (typeof window === 'undefined') return DEFAULT_UI_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      theme: parsed.theme === 'dim' ? 'dim' : 'dark',
      accent:
        parsed.accent === 'blue' || parsed.accent === 'teal' ? parsed.accent : 'violet',
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      showUemStrip: parsed.showUemStrip !== false,
      showSparklines: parsed.showSparklines !== false,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

export function writeUiPrefs(prefs: UiPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(UI_PREFS_EVENT, { detail: prefs }));
}
