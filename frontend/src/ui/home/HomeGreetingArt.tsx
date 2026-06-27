import { useId, useMemo, type ReactElement } from 'react';
import { css } from 'styled-system/css';

// ADR-0072: time-of-day illustration; moon phase is deterministic (synodic formula, no network).

export type DayBucket = 'matin' | 'apresMidi' | 'soir' | 'nuit';

export function bucketForHour(hour: number): DayBucket {
  if (hour >= 22 || hour < 5) return 'nuit';
  if (hour < 12) return 'matin';
  if (hour < 18) return 'apresMidi';
  return 'soir';
}

export function greetingForBucket(bucket: DayBucket): { readonly hi: string; readonly sub: string } {
  switch (bucket) {
    case 'matin':
      return { hi: 'Bonjour', sub: 'Une nouvelle grille pour bien commencer la journée.' };
    case 'apresMidi':
      return { hi: 'Bel après-midi', sub: 'Une grille pour souffler un peu.' };
    case 'soir':
      return { hi: 'Bonsoir', sub: "La grille du soir t'attend." };
    case 'nuit':
      return { hi: 'Encore debout ?', sub: 'La nuit est calme — parfaite pour quelques mots.' };
  }
}

// Apex kept low (y≈75) so sun/moon stay inside the fused banner's cropped visible band, not above it.
const ARC: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = [
  [276, 120],
  [150, 30],
  [24, 120],
];

function arcPoint(t: number): readonly [number, number] {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return [a * ARC[0][0] + b * ARC[1][0] + c * ARC[2][0], a * ARC[0][1] + b * ARC[1][1] + c * ARC[2][1]];
}

const SYNODIC = 29.530588853;
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(date: Date): number {
  const days = (date.getTime() - KNOWN_NEW) / 86400000;
  return (((days % SYNODIC) / SYNODIC) + 1) % 1;
}

// SVG path of the LIT portion of a moon of radius R at the given phase (0=new..0.5=full..1=new).
function litPath(R: number, phase: number): string {
  const f = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const rx = (R * Math.abs(2 * f - 1)).toFixed(2);
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (f > 0.5 ? 1 : 0) : f > 0.5 ? 0 : 1;
  return `M0 ${-R} A ${R} ${R} 0 0 ${limbSweep} 0 ${R} A ${rx} ${R} 0 0 ${termSweep} 0 ${-R} Z`;
}

interface Body {
  readonly t: number;
  readonly soft?: boolean;
  readonly dawn?: boolean;
}
interface BucketArt {
  readonly sky: readonly [string, string, string?];
  readonly skyMid?: string;
  readonly sun?: Body;
  readonly moon?: Body;
  readonly night?: boolean;
}

function artFor(bucket: DayBucket): BucketArt {
  switch (bucket) {
    case 'matin':
      return { sky: ['#FBE3C4', '#FCEFD8', '#DCEFE1'], skyMid: '56%', sun: { t: 0.04, dawn: true }, moon: { t: 0.96 } };
    case 'apresMidi':
      return { sky: ['#8CC1E8', '#B4D9EF', '#DDEFF2'], skyMid: '54%', sun: { t: 0.6 } };
    case 'soir':
      return { sky: ['#E79C6E', '#D98A8E', '#7E6FA0'], skyMid: '52%', sun: { t: 0.96, soft: true }, moon: { t: 0.04 } };
    case 'nuit':
      return { sky: ['#1f3550', '#2b2742'], moon: { t: 0.5 }, night: true };
  }
}

// Staggered scatter flanking the apex moon (150,75): kept off the edges and below the banner's top crop (y≳60).
const STARS: readonly (readonly [number, number, number])[] = [
  [50, 66, 1.5],
  [86, 85, 1.0],
  [116, 63, 1.1],
  [192, 64, 1.3],
  [228, 81, 1.4],
  [258, 70, 1.0],
];

function Sun({ t, soft, dawn }: Body): ReactElement {
  const [x, y] = arcPoint(t);
  if (dawn) {
    // Dawn: disc + halo, no rays; only the branch is allowed to drape onto the card.
    return (
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        <circle r="25" fill="#F7C877" opacity="0.16" />
        <circle r="18" fill="#F7C877" opacity="0.34" />
        <circle r="13" fill="#F8CE86" opacity="0.92" />
      </g>
    );
  }
  if (soft) {
    return (
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        <circle r="27" fill="#F6C98C" opacity="0.95" />
        <circle r="40" fill="#F6C98C" opacity="0.2" />
      </g>
    );
  }
  const R = 20;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return {
      x1: (Math.cos(a) * (R + 5)).toFixed(1),
      y1: (Math.sin(a) * (R + 5)).toFixed(1),
      x2: (Math.cos(a) * (R + 13)).toFixed(1),
      y2: (Math.sin(a) * (R + 13)).toFixed(1),
    };
  });
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <g stroke="#F0B65A" strokeWidth="3" strokeLinecap="round" opacity="0.6">
        {rays.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
        ))}
      </g>
      <circle r={R} fill="#F4B048" />
    </g>
  );
}

function Moon({ t, night, phase }: Body & { readonly night?: boolean; readonly phase: number }): ReactElement {
  const [x, y] = arcPoint(t);
  const R = night ? 15 : 11;
  const fill = night ? '#F2ECD6' : '#C9C3AC';
  const op = night ? 0.95 : 0.55;
  return (
    <g opacity={op} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <path d={litPath(R, phase)} fill={fill} />
    </g>
  );
}

// `p` prefix keeps SVG symbol ids unique when multiple banners coexist in the same document.
function Defs({ p }: { readonly p: string }): ReactElement {
  return (
    <defs>
      <symbol id={`${p}bird`} viewBox="0 0 64 64">
        <path d="M9 30 L24 33 L20 44 Z" fill="#214B40" />
        <path d="M22 44 C16 41 16 30 21 24 C26 18 35 17 42 21 C46 23 49 27 49 31 L57 29 L49 34 C49 41 43 47 35 47 C30 47 25 46 22 44 Z" fill="#D45D83" />
        <path d="M28 30 C35 29 41 33 42 40 C35 41 29 38 28 30 Z" fill="#BE4970" />
        <path d="M24 42 C27 45 32 45 36 44 C33 47 27 47 24 42 Z" fill="#F6C9D7" />
        <path d="M49 30 L58 31.5 L49 33.5 Z" fill="#D8C77A" />
        <circle cx="44.5" cy="29.5" r="2.4" fill="#fff" />
        <circle cx="45" cy="29.7" r="1.3" fill="#214B40" />
      </symbol>
      <symbol id={`${p}blp`} viewBox="0 0 28 28">
        <path d="M14 13.5 C11.6 12.8 10 9.8 10.8 7 C11.3 5.2 12.6 5.8 14 6.8 C15.4 5.8 16.7 5.2 17.2 7 C18 9.8 16.4 12.8 14 13.5 Z" fill="#F9E3EA" />
      </symbol>
      <symbol id={`${p}bl`} viewBox="0 0 28 28">
        <use href={`#${p}blp`} />
        <use href={`#${p}blp`} transform="rotate(72 14 14)" />
        <use href={`#${p}blp`} transform="rotate(144 14 14)" />
        <use href={`#${p}blp`} transform="rotate(216 14 14)" />
        <use href={`#${p}blp`} transform="rotate(288 14 14)" />
        <circle cx="14" cy="14" r="4.4" fill="#F3B6CC" />
        <circle cx="14" cy="14" r="2.2" fill="#D45D83" />
        <g stroke="#B0466B" strokeWidth="0.7" strokeLinecap="round">
          <line x1="14" y1="14" x2="14" y2="10.6" />
          <line x1="14" y1="14" x2="16.7" y2="12.4" />
          <line x1="14" y1="14" x2="15.9" y2="16.4" />
          <line x1="14" y1="14" x2="12.1" y2="16.4" />
          <line x1="14" y1="14" x2="11.3" y2="12.4" />
        </g>
        <g fill="#E9C84A">
          <circle cx="14" cy="10.4" r="0.75" />
          <circle cx="16.8" cy="12.3" r="0.75" />
          <circle cx="15.9" cy="16.6" r="0.75" />
          <circle cx="12.1" cy="16.6" r="0.75" />
          <circle cx="11.2" cy="12.3" r="0.75" />
        </g>
      </symbol>
      <symbol id={`${p}bud`} viewBox="0 0 16 16">
        <ellipse cx="8" cy="6.6" rx="3.4" ry="4.4" fill="#DE6E95" />
        <path d="M8 3.4 C6.4 3.4 5.2 5 5.2 7.4 C5.2 5.6 6.4 4.2 8 4.2 C9.6 4.2 10.8 5.6 10.8 7.4 C10.8 5 9.6 3.4 8 3.4 Z" fill="#F3B9CD" opacity="0.7" />
        <path d="M5.7 8.8 C5.7 11.3 6.8 12.3 8 12.6 C9.2 12.3 10.3 11.3 10.3 8.8 Z" fill="#7C5740" />
      </symbol>
      <symbol id={`${p}pet`} viewBox="0 0 14 14">
        <path d="M7 1.4 C9.4 3.4 9.4 8.4 7 12 C4.6 8.4 4.6 3.4 7 1.4 Z" fill="#F2BBD0" />
        <path d="M7 12 C6.3 10.4 6.3 9.4 7 8.4 C7.7 9.4 7.7 10.4 7 12 Z" fill="#E193B2" />
      </symbol>
      <symbol id={`${p}leaf`} viewBox="0 0 20 20">
        <path d="M2 18 C10 15 16 9 13 1 C5 4 -1 10 2 18 Z" fill="#B7DDC8" />
        <path d="M3 16 L12 3" stroke="#8FB6A1" strokeWidth="0.8" opacity="0.7" />
      </symbol>
      <symbol id={`${p}cluster`} viewBox="0 0 64 64">
        <use href={`#${p}leaf`} x="44" y="14" width="14" height="14" />
        <use href={`#${p}bud`} x="6" y="28" width="13" height="13" />
        <use href={`#${p}bud`} x="46" y="40" width="12" height="12" />
        <use href={`#${p}bl`} x="14" y="16" width="24" height="24" />
        <use href={`#${p}bl`} x="32" y="10" width="20" height="20" />
        <use href={`#${p}bl`} x="36" y="28" width="22" height="22" />
        <use href={`#${p}bl`} x="20" y="32" width="18" height="18" />
      </symbol>
      <symbol id={`${p}fg`} viewBox="0 0 300 168">
        <g transform="translate(0,22) scale(0.7) rotate(22 0 140)">
          <path d="M-16 132 C50 126 116 110 170 96 C206 86 230 79 253 73 C260 72.5 260.5 79 253.5 79 C230 85 208 92 174 106 C118 122 50 146 -16 152 Z" fill="#5A3C2C" />
          <path d="M-8 134 C50 128 116 112 170 98 C206 88 232 80 254 72" stroke="#7C5740" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d="M224 82 C242 66 256 54 274 38" stroke="#5A3C2C" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M272 40 C282 32 288 27 298 18" stroke="#5A3C2C" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <use href={`#${p}cluster`} x="88" y="77" width="60" height="60" />
          <use href={`#${p}cluster`} x="146" y="61" width="62" height="62" />
          <use href={`#${p}cluster`} x="200" y="46" width="64" height="64" />
          <use href={`#${p}cluster`} x="226" y="36" width="56" height="56" />
          <use href={`#${p}cluster`} x="250" y="18" width="50" height="50" />
          <use href={`#${p}bird`} x="48" y="82" width="54" height="54" transform="rotate(-22 75 109)" />
          <use href={`#${p}pet`} x="120" y="150" width="11" height="11" transform="rotate(28 125 155)" />
          <use href={`#${p}pet`} x="170" y="158" width="9" height="9" transform="rotate(14 174 162)" />
          <use href={`#${p}pet`} x="214" y="150" width="11" height="11" transform="rotate(-18 219 155)" />
        </g>
      </symbol>
    </defs>
  );
}

const banner = css({
  flex: 'none',
  borderRadius: '20px',
  overflow: 'hidden',
  height: '160px',
  position: 'relative',
  boxShadow: '0 10px 26px rgba(33,75,64,0.18)',
  marginBottom: '16px',
});

export function HomeGreetingArt({
  bucket,
  now,
  className,
  drape,
}: {
  readonly bucket: DayBucket;
  readonly now?: Date;
  readonly className?: string;
  // parent must not set overflow: hidden, or the drape is clipped.
  readonly drape?: number;
}): ReactElement {
  const rawId = useId();
  const p = `${rawId.replace(/:/g, '')}-`;
  const phase = useMemo(() => moonPhase(now ?? new Date()), [now]);
  const art = artFor(bucket);
  const stops = art.sky;
  const gradient =
    stops.length === 3
      ? `linear-gradient(180deg, ${stops[0]}, ${stops[1]} ${art.skyMid}, ${stops[2]})`
      : `linear-gradient(180deg, ${stops[0]}, ${stops[1]})`;

  return (
    <div className={className ?? banner} style={{ backgroundImage: gradient }} aria-hidden="true">
      <svg
        viewBox="0 0 300 168"
        preserveAspectRatio="xMidYMax slice"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: drape ? `calc(100% + ${drape}px)` : '100%', overflow: 'visible' }}
      >
        <Defs p={p} />
        {art.night
          ? STARS.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill="#E9E2BD" />)
          : null}
        {art.sun ? <Sun t={art.sun.t} soft={art.sun.soft} dawn={art.sun.dawn} /> : null}
        {art.moon ? <Moon t={art.moon.t} night={art.night} phase={phase} /> : null}
        <use href={`#${p}fg`} x="0" y="0" width="300" height="168" />
      </svg>
    </div>
  );
}
