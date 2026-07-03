import { Link } from '@tanstack/react-router';
import { CaretRight, Sparkle } from '@phosphor-icons/react';
import { css } from 'styled-system/css';

// Ambient nudges shown only to free players (ADR-0080 W5a) — discreet, never a hard paywall. Both link to the offer.

const card = css({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', textDecoration: 'none', bg: 'white', border: '1.5px solid token(colors.ws.sakuraBlush)', borderRadius: '16px', padding: '13px 14px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.06)', fontFamily: 'wsUi', transition: 'background-color 120ms', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const tile = css({ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', bg: 'ws.sakuraBlush', color: 'ws.sakuraDark', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const mid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' });
const title = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk' });
const sub = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '12px', color: 'ws.khaki', opacity: 0.9 });
const chevron = css({ flex: 'none', color: 'ws.sakuraDark', opacity: 0.6, display: 'flex' });

function UpsellCard({ subline }: { readonly subline: string }) {
  return (
    <Link to="/abonnement" className={card}>
      <span className={tile}><Sparkle size={20} weight="fill" aria-hidden="true" /></span>
      <span className={mid}>
        <span className={title}>Débloque toutes les grilles</span>
        <span className={sub}>{subline}</span>
      </span>
      <span className={chevron}><CaretRight size={18} weight="bold" aria-hidden="true" /></span>
    </Link>
  );
}

export function HomeTeaser() {
  return <UpsellCard subline="Abonne-toi et joue sans limite" />;
}

export function ArchiveUpsellBanner() {
  return <UpsellCard subline="Tout l'historique et les nouvelles grilles" />;
}
