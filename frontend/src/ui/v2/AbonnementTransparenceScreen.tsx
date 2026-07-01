import { css, cx } from 'styled-system/css';
import { GlobeHemisphereWest, Cpu, Heart, ShieldCheck } from '@phosphor-icons/react';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { NotFoundScreen } from './NotFoundScreen';
import { GateLoadingScreen } from './GateLoadingScreen';
import { useBillingGate } from './useBillingGate';

interface CostItem {
  readonly id: string;
  readonly icon: 'globe' | 'cpu' | 'heart';
  readonly label: string;
  readonly sub: string;
}

// Factual transparency (ADR-0080): what the subscription funds, stated plainly — no donation/support pitch.
const COST_ITEMS: ReadonlyArray<CostItem> = [
  { id: 'hosting', icon: 'globe', label: 'Serveurs & hébergement', sub: 'En Europe, sans pub ni pistage' },
  { id: 'generation', icon: 'cpu', label: 'Génération des grilles', sub: 'Une grille fraîche chaque jour' },
  { id: 'development', icon: 'heart', label: 'Le temps de développement', sub: 'WordSparrow est fait par une seule personne' },
];

function CostIcon({ icon }: { readonly icon: CostItem['icon'] }) {
  if (icon === 'globe') return <GlobeHemisphereWest size={19} weight="bold" aria-hidden="true" />;
  if (icon === 'cpu') return <Cpu size={19} weight="bold" aria-hidden="true" />;
  return <Heart size={19} weight="fill" aria-hidden="true" />;
}

const content = css({ display: 'flex', flexDirection: 'column', gap: '14px' });
const heroTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '22px', color: 'ws.jadeInk', margin: 0, lineHeight: '1.15' });
const lead = css({ fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.92, lineHeight: '1.45', margin: 0 });

const card = css({ bg: 'white', borderRadius: '16px', padding: '6px 4px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)' });
const item = css({ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 13px', borderBottom: '1px solid #F2F5F0' });
const itemLast = css({ borderBottom: 'none' });
const itemTile = css({ flex: 'none', width: '36px', height: '36px', borderRadius: '11px', bg: 'ws.jade', color: 'ws.jadeInk', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const itemMid = css({ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 });
const itemLabel = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '13.5px', color: 'ws.jadeInk' });
const itemSub = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.85 });
const footNote = css({ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.jadeInk', bg: 'ws.jade', borderRadius: '12px', padding: '10px 12px', lineHeight: '1.4' });

export function TransparencePanel() {
  return (
    <div className={content}>
      <h1 className={heroTitle}>Où va ton argent&nbsp;?</h1>
      <p className={lead}>Le jeu reste entièrement gratuit. L&apos;abonnement finance ce qui coûte vraiment&nbsp;:</p>
      <div className={card}>
        {COST_ITEMS.map((cost, index) => {
          const last = index === COST_ITEMS.length - 1;
          return (
            <div key={cost.id} className={last ? cx(item, itemLast) : item}>
              <span className={itemTile}>
                <CostIcon icon={cost.icon} />
              </span>
              <span className={itemMid}>
                <span className={itemLabel}>{cost.label}</span>
                <span className={itemSub}>{cost.sub}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className={footNote}>
        <ShieldCheck size={16} weight="fill" aria-hidden="true" />
        Pas de pub, jamais. Tes données de jeu restent sur ton appareil.
      </p>
    </div>
  );
}

export function AbonnementTransparenceScreen() {
  const gate = useBillingGate();
  if (gate === 'loading') return <GateLoadingScreen />;
  if (gate === 'denied') return <NotFoundScreen />;
  return (
    <PhoneShell header={<BackHeader to="/abonnement" />} backTo="/abonnement">
      <TransparencePanel />
    </PhoneShell>
  );
}
