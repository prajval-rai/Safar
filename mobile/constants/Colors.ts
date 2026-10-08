// Safar's mobile look: a cool, light canvas with white cards, a charcoal
// floating tab bar and one bright highlight (saffron — the app icon's colour)
// for whatever is selected: the active tab, the chosen pill, the main button.
// To try another highlight (e.g. lime '#D7F25A'), change `highlight` below;
// everything selected follows it.
const highlight = '#FFB547';

const light = {
  background: '#F2F3F5', // canvas
  card: '#FFFFFF', // surface
  raised: '#ECEEF1', // a step up from card — stat tiles, chips
  border: '#E4E6EA', // line
  text: '#17191C', // ink
  muted: '#6E737A',

  tint: '#C2570C', // brand — links, accents, text on white
  brandStrong: '#9A3F05',
  brandBright: '#F08A2C',
  brandSoft: '#FFF1DE',
  onBrand: '#FFFFFF',

  /** Selected pills, the active tab, primary buttons. */
  highlight,
  onHighlight: '#17191C',
  /** The floating tab bar and dark overlay cards. */
  nav: '#22272B',
  onNav: '#E9EBEE',

  accent: '#0F766E',
  accentSoft: '#DCF1EE',

  success: '#15803D',
  successSoft: '#DCF5E4',
  warn: '#A16207',
  warnSoft: '#FBF0D3',
  danger: '#B91C1C',
  dangerSoft: '#FCE8E8',

  tabIconDefault: '#9AA0A6',
  tabIconSelected: '#17191C',
};

const dark: typeof light = {
  background: '#101214',
  card: '#1A1D20',
  raised: '#24282C',
  border: '#2C3135',
  text: '#F3F4F6',
  muted: '#9AA1A9',

  tint: '#FFA94D',
  brandStrong: '#FFC078',
  brandBright: '#FFB547',
  brandSoft: '#3A2A16',
  onBrand: '#17191C',

  highlight,
  onHighlight: '#17191C',
  nav: '#000000',
  onNav: '#E9EBEE',

  accent: '#2DD4BF',
  accentSoft: '#123330',

  success: '#4ADE80',
  successSoft: '#12301D',
  warn: '#FBBF24',
  warnSoft: '#332612',
  danger: '#F87171',
  dangerSoft: '#3A1717',

  tabIconDefault: '#6B7178',
  tabIconSelected: '#17191C',
};

export type Palette = typeof light;

export default { light, dark };
