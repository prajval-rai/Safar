import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { CoverKey } from '@/lib/types';

/** Ported directly from frontend/src/components/art/TripCover.tsx — the same
 *  illustrated destination scenes, same palettes, same SVG paths. Every trip
 *  and track gets one of these instead of a stock photo: loads instantly,
 *  never 404s, costs no bandwidth. */

interface Palette {
  sky: [string, string];
  far: string;
  near: string;
  detail: string;
}

const PALETTES: Record<CoverKey, Palette> = {
  beach: { sky: ['#ffd9a0', '#ff9e64'], far: '#0e7490', near: '#0c4a6e', detail: '#fde68a' },
  mountain: { sky: ['#c7d9f2', '#8aa7d4'], far: '#5b7aa8', near: '#33496e', detail: '#f8fafc' },
  snow: { sky: ['#dceaf8', '#a9c6e8'], far: '#7d9bc4', near: '#42597e', detail: '#ffffff' },
  fort: { sky: ['#ffd7a8', '#f0904f'], far: '#b4552c', near: '#7c2d12', detail: '#fbbf24' },
  palace: { sky: ['#fcd9e4', '#e9899f'], far: '#b45374', near: '#7a2f4c', detail: '#fde68a' },
  desert: { sky: ['#ffe6b0', '#f4a261'], far: '#d98d49', near: '#a35d2a', detail: '#fff2cc' },
  backwater: { sky: ['#d6f0d9', '#8fc79a'], far: '#2f7d4f', near: '#14532d', detail: '#fef3c7' },
  tea: { sky: ['#dff0d2', '#a7cf88'], far: '#4d8b3c', near: '#2c5220', detail: '#f0fdf4' },
  river: { sky: ['#ffe2b8', '#f0a868'], far: '#3f7a8c', near: '#1e4b5a', detail: '#fde68a' },
  temple: { sky: ['#ffddb0', '#ef9b5a'], far: '#a94f2c', near: '#6b2d16', detail: '#fbbf24' },
  forest: { sky: ['#d9ecd2', '#93c48a'], far: '#3f7d45', near: '#1f4d2a', detail: '#ecfdf5' },
  valley: { sky: ['#d6e6f5', '#9dbbdd'], far: '#4f7f6a', near: '#2c5244', detail: '#f8fafc' },
  city: { sky: ['#ffd8b5', '#e98a6b'], far: '#5c5470', near: '#302a40', detail: '#fde68a' },
  road: { sky: ['#ffe0b3', '#f09a5e'], far: '#8c6249', near: '#4a3226', detail: '#fef3c7' },
};

function shapes(cover: CoverKey, p: Palette) {
  switch (cover) {
    case 'beach':
    case 'backwater':
      return (
        <>
          <Path d="M0 132 Q100 118 200 132 T400 130 V200 H0Z" fill={p.far} />
          <Path d="M0 158 Q120 146 240 158 T400 154 V200 H0Z" fill={p.near} />
          <Path d="M58 200 L64 138" stroke={p.near} strokeWidth={5} strokeLinecap="round" />
          <Path
            d="M64 138 Q40 124 26 134 M64 138 Q88 122 104 132 M64 138 Q54 116 40 110 M64 138 Q78 116 94 112"
            stroke="#166534"
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
          />
          {cover === 'backwater' ? <Path d="M212 168 h72 l-10 14 h-52Z" fill="#78350f" /> : null}
        </>
      );
    case 'mountain':
    case 'snow':
    case 'valley':
      return (
        <>
          <Path d="M0 200 L92 96 L168 200Z" fill={p.far} />
          <Path d="M120 200 L214 74 L312 200Z" fill={p.near} />
          <Path d="M186 110 L214 74 L242 110 L220 102 L206 112Z" fill={p.detail} />
          <Path d="M270 200 L342 116 L400 176 V200Z" fill={p.far} opacity={0.85} />
          <Rect y={188} width={400} height={12} fill={p.near} />
        </>
      );
    case 'fort':
    case 'palace':
      return (
        <>
          <Rect y={150} width={400} height={50} fill={p.near} />
          <Rect x={70} y={96} width={180} height={60} fill={p.far} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Rect key={i} x={70 + i * 20} y={86} width={12} height={12} fill={p.far} />
          ))}
          <Path d="M132 156 v-32 a28 28 0 0 1 56 0 v32Z" fill={p.near} />
          {cover === 'palace' ? (
            <>
              <Path d="M160 96 a22 22 0 0 1 22-22 a22 22 0 0 1 22 22Z" fill={p.detail} />
              <Circle cx={182} cy={66} r={5} fill={p.detail} />
            </>
          ) : null}
          <Rect x={262} y={118} width={58} height={38} fill={p.far} opacity={0.9} />
          <Rect x={262} y={110} width={58} height={10} fill={p.far} />
        </>
      );
    case 'desert':
      return (
        <>
          <Path d="M0 146 Q86 116 176 148 T400 138 V200 H0Z" fill={p.far} />
          <Path d="M0 176 Q120 152 236 178 T400 172 V200 H0Z" fill={p.near} />
        </>
      );
    case 'tea':
    case 'forest':
      return (
        <>
          <Path d="M0 134 Q90 108 180 134 T400 128 V200 H0Z" fill={p.far} />
          <Path d="M0 164 Q110 140 220 166 T400 158 V200 H0Z" fill={p.near} />
          {cover === 'forest'
            ? [70, 120, 300, 344].map((x, i) => (
                <G key={x}>
                  <Path d={`M${x} 176 l14 -40 l14 40Z`} fill="#14532d" opacity={0.9 - i * 0.05} />
                  <Rect x={x + 12} y={174} width={4} height={12} fill="#3f2d1d" />
                </G>
              ))
            : ['M20 152 Q70 142 120 152', 'M140 162 Q196 150 252 162', 'M262 148 Q318 138 374 148'].map((d) => (
                <Path key={d} d={d} stroke={p.detail} strokeWidth={3} fill="none" opacity={0.55} />
              ))}
        </>
      );
    case 'river':
      return (
        <>
          <Path d="M0 200 L96 104 L186 200Z" fill={p.far} />
          <Path d="M150 200 L246 92 L340 200Z" fill={p.near} opacity={0.9} />
          <Path d="M0 168 Q100 152 200 170 T400 162 V200 H0Z" fill={p.far} />
          <Path d="M0 186 Q120 174 240 188 T400 182 V200 H0Z" fill={p.near} />
        </>
      );
    case 'temple':
      return (
        <>
          <Rect y={158} width={400} height={42} fill={p.near} />
          <Path d="M168 158 L200 52 L232 158Z" fill={p.far} />
          <Path d="M190 52 h20 v-12 h-20Z" fill={p.detail} />
          <Circle cx={200} cy={34} r={7} fill={p.detail} />
          <Rect x={120} y={126} width={40} height={32} fill={p.far} opacity={0.9} />
          <Rect x={240} y={126} width={40} height={32} fill={p.far} opacity={0.9} />
          <Path d="M186 158 v-26 a14 14 0 0 1 28 0 v26Z" fill={p.near} />
          <Rect x={158} y={176} width={84} height={6} fill={p.far} opacity={0.7} />
        </>
      );
    case 'city':
      return (
        <>
          <Rect y={168} width={400} height={32} fill={p.near} />
          {(
            [
              [40, 108, 42],
              [92, 84, 34],
              [136, 126, 30],
              [178, 70, 40],
              [228, 112, 36],
              [274, 92, 32],
              [318, 130, 44],
            ] as const
          ).map(([x, y, w]) => (
            <Rect key={x} x={x} y={y} width={w} height={168 - y} fill={p.far} />
          ))}
          {(
            [
              [50, 120],
              [102, 96],
              [188, 84],
              [238, 124],
              [284, 106],
              [330, 142],
            ] as const
          ).map(([x, y]) => (
            <Rect key={`${x}-${y}`} x={x} y={y} width={7} height={9} fill={p.detail} opacity={0.8} />
          ))}
        </>
      );
    case 'road':
    default:
      return (
        <>
          <Path d="M0 128 Q96 98 192 128 T400 120 V200 H0Z" fill={p.far} />
          <Path
            d="M138 200 Q184 152 172 118 Q166 96 200 84 Q238 72 250 96"
            stroke={p.near}
            strokeWidth={26}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M148 196 Q190 152 180 118 Q174 100 202 90"
            stroke={p.detail}
            strokeWidth={3}
            strokeDasharray="10 12"
            fill="none"
          />
        </>
      );
  }
}

export function TripCover({
  cover,
  style,
  radius = 16,
  children,
}: {
  cover: CoverKey;
  style?: object;
  radius?: number;
  /** Overlay content, e.g. the trip title on a hero banner. */
  children?: React.ReactNode;
}) {
  const p = PALETTES[cover] ?? PALETTES.mountain;
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: p.sky[1] }, styles.wrap, style]}>
      <Svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={p.sky[0]} />
            <Stop offset="100%" stopColor={p.sky[1]} />
          </LinearGradient>
        </Defs>
        <Rect width={400} height={200} fill="url(#sky)" />
        <Circle cx={312} cy={54} r={26} fill={p.detail} opacity={0.85} />
        {shapes(cover, p)}
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', position: 'relative' },
});
