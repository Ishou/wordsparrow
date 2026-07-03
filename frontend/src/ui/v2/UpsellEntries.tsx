import { Link } from '@tanstack/react-router';
import { CaretRight, Sparkle } from '@phosphor-icons/react';
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

// White card with a jade accent tile reads as intentional against the sable page; the pill CTA is the single clear affordance.
const banner = css({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', textDecoration: 'none', bg: 'white', border: '1.5px solid token(colors.ws.jade)', borderRadius: '16px', padding: '12px 13px', cursor: 'pointer', fontFamily: 'wsUi', boxShadow: '0 1px 2px rgba(33,75,64,0.06)', transition: 'background-color 120ms', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const bannerTile = css({ flex: 'none', width: '38px', height: '38px', borderRadius: '11px', bg: 'ws.jade', color: 'ws.jadeInk', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const bannerMid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' });
const bannerTitle = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '13.5px', color: 'ws.jadeInk' });
const bannerSub = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.9 });
const bannerCta = css({ flex: 'none', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '12px', color: 'white', bg: 'ws.sakuraDark', borderRadius: '999px', padding: '7px 14px' });

export function ArchiveUpsellBanner() {
  return (
    <Link to="/abonnement" className={banner}>
      <span className={bannerTile}><Sparkle size={19} weight="fill" aria-hidden="true" /></span>
      <span className={bannerMid}>
        <span className={bannerTitle}>Débloque toutes les grilles</span>
        <span className={bannerSub}>Tout l&apos;historique et les nouvelles grilles</span>
      </span>
      <span className={bannerCta}>Voir</span>
    </Link>
  );
}
