// Mirrors the web app's default "Saffron Sunrise" theme exactly — same values
// as the [data-theme="saffron"] CSS custom properties in
// frontend/src/app/globals.css — so the two apps read as one product. The
// web app now has nine themes that switch automatically based on a
// traveller's live/upcoming trip destination (see useAmbientTheme on the
// frontend); mobile doesn't have that dynamic system yet and just opens on
// the same default everyone starts from on web.
export default {
  light: {
    background: '#fbf9f6', // canvas
    card: '#ffffff', // surface
    raised: '#f4f0ea', // a step up from card — stat tiles, chips
    border: '#e9e3da', // line
    text: '#1c1917', // ink
    muted: '#6b625a',

    tint: '#8a3204', // brand
    brandStrong: '#6b2503',
    brandBright: '#d9772b',
    brandSoft: '#f6ebe1',
    onBrand: '#ffffff',

    accent: '#0f766e',
    accentSoft: '#dcf1ee',

    success: '#15803d',
    successSoft: '#dcf5e4',
    warn: '#a16207',
    warnSoft: '#fbf0d3',
    danger: '#b91c1c',
    dangerSoft: '#fce8e8',

    tabIconDefault: '#a89c8d',
    tabIconSelected: '#8a3204',
  },
  dark: {
    background: '#1a1410',
    card: '#241c16',
    raised: '#2f251d',
    border: '#3d3128',
    text: '#f7ede2',
    muted: '#b7a494',

    tint: '#f97316',
    brandStrong: '#fb923c',
    brandBright: '#fdba74',
    brandSoft: '#3a2415',
    onBrand: '#1a1008',

    accent: '#2dd4bf',
    accentSoft: '#123330',

    success: '#4ade80',
    successSoft: '#12301d',
    warn: '#fbbf24',
    warnSoft: '#332612',
    danger: '#f87171',
    dangerSoft: '#3a1717',

    tabIconDefault: '#6b5d4f',
    tabIconSelected: '#f97316',
  },
};
