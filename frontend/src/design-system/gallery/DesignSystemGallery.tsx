import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import '../fonts.css';
import { Cell } from '../components/Cell/Cell';
import { DefCell } from '../components/DefCell/DefCell';
import { Grid } from '../components/Grid/Grid';
import { PlayGrid } from '../components/PlayGrid/PlayGrid';
import { ClueRail } from '../components/ClueRail/ClueRail';
import { Button } from '../components/Button/Button';
import { KeyboardKey } from '../components/KeyboardKey/KeyboardKey';
import { StatCard } from '../components/StatCard/StatCard';
import { StreakPill } from '../components/StreakPill/StreakPill';
import { DifficultyDots } from '../components/DifficultyDots/DifficultyDots';
import { CalendarDay } from '../components/CalendarDay/CalendarDay';
import { BottomNav } from '../components/BottomNav/BottomNav';
import { DailyCard } from '../components/DailyCard/DailyCard';
import type { GridLayout } from '../components/Grid/layout';

const BOARD: GridLayout = {
  columns: 5,
  cells: [
    { kind: 'def', clues: ['Conifère'], arrow: 'right' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Fleuve'], arrow: 'down' },
    { kind: 'letter', letter: 'S' },
    { kind: 'letter', letter: 'E' },
    { kind: 'def', clues: ['Arbre'], arrow: 'right' },
    { kind: 'letter', letter: 'P', cursor: true },
    { kind: 'letter', letter: 'A', active: true },
    { kind: 'letter', letter: 'R', active: true },
    { kind: 'letter', letter: 'I', active: true },
    { kind: 'letter', letter: 'I' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'É' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'O' },
    { kind: 'letter', letter: 'N' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Sud', 'Oui'] },
    { kind: 'letter', letter: 'N' },
    { kind: 'def', clues: ["Ville d'art"], arrow: 'right' },
  ],
};

const shell = css({ minHeight: '100vh', bg: '#E7E3D7', padding: '52px 24px 80px', fontFamily: 'wsUi', color: 'ws.jadeInk' });
const container = css({ maxWidth: '860px', marginInline: 'auto' });
const eyebrow = css({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' });
const eyebrowDot = css({ width: '11px', height: '11px', borderRadius: '999px', bg: 'ws.sakura' });
const eyebrowText = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'ws.khaki' });
const h1 = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '44px', lineHeight: '1.04', margin: 0, color: 'ws.jadeInk' });
const lead = css({ fontFamily: 'wsUi', fontSize: '16px', lineHeight: '1.5', color: 'ws.khaki', margin: '12px 0 0', maxWidth: '640px' });

const card = css({ bg: 'white', borderRadius: '18px', padding: '24px', boxShadow: '0 1px 2px rgba(33,75,64,0.04), 0 8px 22px rgba(33,75,64,0.07)', marginBottom: '20px' });
const cardName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '21px', color: 'ws.jadeInk' });
const cardDesc = css({ fontFamily: 'wsUi', fontSize: '13px', color: 'ws.khaki', opacity: 0.7, margin: '3px 0 18px' });
const jade = css({ display: 'inline-flex', gap: '20px', bg: 'ws.jade', borderRadius: '13px', padding: '18px', flexWrap: 'wrap', alignItems: 'flex-start' });
const varCol = css({ display: 'flex', flexDirection: 'column', alignItems: 'center' });
const varLabel = css({ fontFamily: 'wsUi', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'ws.jadeInk', opacity: 0.7, marginTop: '9px' });

function Card({ name, desc, children }: { name: string; desc: string; children: ReactNode }) {
  return (
    <section className={card}>
      <div className={cardName}>{name}</div>
      <div className={cardDesc}>{desc}</div>
      {children}
    </section>
  );
}

function Var({ label, w, children }: { label: string; w?: number; children: ReactNode }) {
  return (
    <div className={varCol}>
      <div style={w ? { width: w, height: w } : undefined}>{children}</div>
      <span className={varLabel}>{label}</span>
    </div>
  );
}

const SWATCHES = [
  ['Jade', 'ws.jade', '--colors-ws-jade'],
  ['Jade ink', 'ws.jadeInk', '--colors-ws-jade-ink'],
  ['Sable', 'ws.sable', '--colors-ws-sable'],
  ['Khaki', 'ws.khaki', '--colors-ws-khaki'],
  ['Or', 'ws.or', '--colors-ws-or'],
  ['Sakura', 'ws.sakura', '--colors-ws-sakura'],
  ['Sakura rose', 'ws.sakuraRose', '--colors-ws-sakura-rose'],
  ['Sakura blush', 'ws.sakuraBlush', '--colors-ws-sakura-blush'],
] as const;

export function DesignSystemGallery() {
  return (
    <div className={shell}>
      <div className={container}>
        <div className={css({ marginBottom: '30px' })}>
          <div className={eyebrow}>
            <span aria-hidden="true" className={eyebrowDot} />
            <span className={eyebrowText}>WordSparrow · Système de design</span>
          </div>
          <h1 className={h1}>Composants</h1>
          <p className={lead}>
            La source unique de vérité. Extraits des écrans Jeu, Victoire et Accueil — chaque écran futur réutilise ces
            composants. Tokens et typographie verrouillés : Fredoka (display), Nunito (UI), Spline Sans Mono (lettres),
            Hanken Grotesk (indices).
          </p>
        </div>

        <Card name="Cell" desc="Lettres en Spline Sans Mono · rayon 9px. Vide/actif en relief, résolu aplati.">
          <div className={jade}>
            <Var label="Empty" w={58}><Cell state="empty" /></Var>
            <Var label="Solved" w={58}><Cell state="solved" letter="A" /></Var>
            <Var label="Active" w={58}><Cell state="active" letter="P" /></Var>
            <Var label="Active word" w={58}><Cell state="activeWord" letter="A" /></Var>
          </div>
        </Card>

        <Card name="DefCell" desc="Indice en Hanken Grotesk · jade-clair, accent jade au bord (sakura si actif), flèche or.">
          <div className={css({ display: 'inline-flex', gap: '24px', bg: 'ws.jade', borderRadius: '13px', padding: '18px 26px', flexWrap: 'wrap', alignItems: 'flex-start' })}>
            <Var label="Single →" w={58}><DefCell clues={['Oiseau']} arrow="right" /></Var>
            <Var label="Single ↓" w={58}><DefCell clues={['Arbre']} arrow="down" /></Var>
            <Var label="Coudé ↳" w={58}><DefCell clues={['Fleuve']} arrow="right-down" /></Var>
            <Var label="Active" w={58}><DefCell clues={['Capitale']} arrow="right" active /></Var>
            <Var label="Split" w={58}><DefCell clues={['Note', 'Cours']} /></Var>
          </div>
        </Card>

        <Card name="Grid" desc="Composite de Cell + DefCell. Mise en page du plateau (colonnes 60px, gouttière 5px) et fenêtrage — le plateau déborde des bords. Chaque écran affiche le puzzle via ce composant.">
          <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '26px', alignItems: 'flex-start' })}>
            <Var label="Full board — fenêtré · zoomable · déborde">
              <div style={{ position: 'relative', width: 328, height: 300, overflow: 'hidden', borderRadius: 14 }}>
                <div style={{ width: 420, transform: 'translate(-30px,-12px)' }}><Grid layout={BOARD} size="full" /></div>
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 28px 0 22px -18px #C4E5D3, inset -28px 0 22px -18px #C4E5D3, inset 0 18px 14px -12px #C4E5D3, inset 0 -18px 14px -12px #C4E5D3' }} />
              </div>
            </Var>
            <Var label="Mini / preview — teaser · mosaïque">
              <Grid layout={BOARD} size="mini" />
            </Var>
          </div>
        </Card>

        <Card name="PlayGrid" desc="Le plateau de jeu : tuiles à taille fixe, sans cadre — il déborde de sa fenêtre et se zoome d'un bloc. Mot actif PARIS (curseur sakura, reste en blush), indices auto-ajustés.">
          <div className={css({ bg: 'ws.jade', borderRadius: '13px', padding: '20px', display: 'flex', justifyContent: 'center' })}>
            <div style={{ width: 360, height: 380, overflow: 'hidden', borderRadius: 14, boxShadow: 'inset 0 0 0 1px rgba(33,75,64,0.06)' }}>
              <div style={{ transform: 'translate(-44px,-32px)' }}><PlayGrid /></div>
            </div>
          </div>
        </Card>

        <Card name="ClueRail" desc="Label · indice actif · stepper ‹ › · compteur · zoom − +.">
          <div className={css({ bg: 'ws.jade', borderRadius: '13px', padding: '18px' })}>
            <div style={{ maxWidth: 340 }}><ClueRail direction="horizontal" clue="Capitale de la France" index={4} total={18} /></div>
          </div>
        </Card>

        <Card name="Button" desc="Nunito 800 · rayon 14px.">
          <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' })}>
            <Var label="Primary"><Button variant="primary" className={css({ width: '150px', height: '52px' })}>Jouer</Button></Var>
            <Var label="Secondary"><Button variant="secondary" className={css({ width: '150px', height: '52px' })}>Partager</Button></Var>
            <Var label="Disabled"><Button variant="primary" disabled className={css({ width: '150px', height: '52px' })}>Jouer</Button></Var>
          </div>
        </Card>

        <Card name="KeyboardKey" desc="AZERTY · touches sable, lettre khaki · confirmation sakura.">
          <div className={css({ display: 'inline-flex', gap: '18px', bg: 'ws.jade', borderRadius: '13px', padding: '18px' })}>
            <Var label="Letter"><KeyboardKey type="letter" label="A" /></Var>
            <Var label="Confirm"><KeyboardKey type="confirm" /></Var>
            <Var label="Backspace"><KeyboardKey type="backspace" /></Var>
          </div>
        </Card>

        <Card name="StatCard · StreakPill" desc="Chiffres en Fredoka · pilule translucide.">
          <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '22px', alignItems: 'flex-start', bg: 'ws.jade', borderRadius: '13px', padding: '18px' })}>
            <Var label="StatCard"><StatCard temps="02:14" serie="🔥 8" /></Var>
            <Var label="StreakPill · simple / + chrono">
              <div className={css({ display: 'flex', gap: '10px' })}>
                <StreakPill streak={8} />
                <StreakPill streak={7} timer="02:14" />
              </div>
            </Var>
          </div>
        </Card>

        <Card name="DifficultyDots · CalendarStrip" desc="Niveau · pastilles. Jour de calendrier : résolu / aujourd'hui / non résolu.">
          <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '28px', alignItems: 'flex-start' })}>
            <Var label="DifficultyDots">
              <div className={css({ display: 'flex', flexDirection: 'column', gap: '9px' })}>
                <DifficultyDots level="facile" />
                <DifficultyDots level="moyen" />
                <DifficultyDots level="difficile" />
              </div>
            </Var>
            <Var label="CalendarStrip · day">
              <div className={css({ display: 'flex', gap: '14px', bg: 'ws.sable', borderRadius: '14px', padding: '13px 16px' })}>
                <CalendarDay day={18} state="solved" />
                <CalendarDay day={20} state="today" />
                <CalendarDay day={21} state="unsolved" />
              </div>
            </Var>
          </div>
        </Card>

        <Card name="DailyCard" desc="Le héros de l'accueil : aperçu · date · niveau · CTA.">
          <div className={css({ bg: 'ws.jade', borderRadius: '13px', padding: '18px', display: 'flex', justifyContent: 'center' })}>
            <div style={{ width: 330 }}><DailyCard date="Mercredi 20 juin" level="moyen" /></div>
          </div>
        </Card>

        <Card name="BottomNav · SectionHeading" desc="Navigation : onglet actif en sakura. Titre de section.">
          <div className={css({ bg: 'ws.jade', borderRadius: '13px', padding: '18px' })}>
            <div style={{ maxWidth: 360 }}><BottomNav active="accueil" /></div>
            <div className={css({ marginTop: '18px', bg: 'white', borderRadius: '12px', padding: '14px 16px' })}>
              <div className={css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.jadeInk' })}>Grilles précédentes</div>
            </div>
          </div>
        </Card>

        <Card name="Couleurs" desc="Tokens verrouillés (ADR-0072).">
          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '14px' })}>
            {SWATCHES.map(([label, token, cssVar]) => (
              <div key={token} className={css({ display: 'flex', flexDirection: 'column', gap: '6px' })}>
                <div data-token={token} style={{ background: `var(${cssVar})` }} className={css({ height: '52px', borderRadius: '10px', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' })} />
                <span className={css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'semibold', color: 'ws.khaki' })}>{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
