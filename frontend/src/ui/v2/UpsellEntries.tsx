import { Link } from '@tanstack/react-router';
import { CaretRight, Sparkle, Lock } from '@phosphor-icons/react';
import { css } from 'styled-system/css';

// Ambient nudges shown only to free players (ADR-0080 W5a) — discreet, never a hard paywall. Both link to the offer.

const teaser = css({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', textDecoration: 'none', bg: 'white', border: '1.5px solid token(colors.ws.sakuraBlush)', borderRadius: '16px', padding: '13px 14px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.06)', fontFamily: 'wsUi', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const teaserTile = css({ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', bg: 'ws.sakuraBlush', color: 'ws.sakuraDark', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const teaserMid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' });
const teaserTitle = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk' });
const teaserSub = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '12px', color: 'ws.khaki', opacity: 0.9 });
const teaserChevron = css({ flex: 'none', color: 'ws.sakuraDark', opacity: 0.6, display: 'flex' });

export function HomeTeaser() {
  return (
    <Link to="/abonnement" className={teaser}>
      <span className={teaserTile}><Sparkle size={20} weight="fill" aria-hidden="true" /></span>
      <span className={teaserMid}>
        <span className={teaserTitle}>Débloque toutes les grilles</span>
        <span className={teaserSub}>Abonne-toi et joue sans limite</span>
      </span>
      <span className={teaserChevron}><CaretRight size={18} weight="bold" aria-hidden="true" /></span>
    </Link>
  );
}

const banner = css({ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', textDecoration: 'none', bg: 'ws.jade', borderRadius: '14px', padding: '12px 14px', cursor: 'pointer', fontFamily: 'wsUi', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const bannerIcon = css({ flex: 'none', color: 'ws.jadeInk', display: 'flex' });
const bannerMid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' });
const bannerTitle = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '13.5px', color: 'ws.jadeInk' });
const bannerSub = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.jadeInk', opacity: 0.75 });
const bannerCta = css({ flex: 'none', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '12px', color: 'ws.sakuraDark' });

export function ArchiveUpsellBanner() {
  return (
    <Link to="/abonnement" className={banner}>
      <span className={bannerIcon}><Lock size={18} weight="fill" aria-hidden="true" /></span>
      <span className={bannerMid}>
        <span className={bannerTitle}>Débloque toutes les grilles</span>
        <span className={bannerSub}>Tout l&apos;historique, et de nouvelles grilles</span>
      </span>
      <span className={bannerCta}>Voir</span>
    </Link>
  );
}
