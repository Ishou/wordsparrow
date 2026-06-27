// Keeps a crossword letter <input> "pure": no soft keyboard, no autofill,
// no autocomplete/autocorrect/spellcheck, no password-manager or writing-
// assistant overlays. Spread into every grid cell input (solo + co-op) so
// the two grids can't drift. inputMode 'none' suppresses the OS keyboard —
// letters arrive via the on-screen keyboard / physical keys, uppercased in
// useGridNavigation. The macOS caps-lock glyph is an OS indicator and is
// not something a web page can suppress.
export const GRID_INPUT_GUARDS = {
  type: 'search',
  role: 'textbox',
  inputMode: 'none',
  autoComplete: 'off',
  autoCapitalize: 'characters',
  autoCorrect: 'off',
  spellCheck: false,
  enterKeyHint: 'next',
  'aria-autocomplete': 'none',
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-gramm': 'false',
  'data-gramm_editor': 'false',
  'data-enable-grammarly': 'false',
  'data-lt-active': 'false',
} as const;
