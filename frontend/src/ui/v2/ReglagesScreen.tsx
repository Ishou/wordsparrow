import { useState } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Lock, FileText, Envelope, CaretRight, DownloadSimple, Question, User } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import type { ThemePreference, ThemeStore } from '@/application/session/ThemeStore';
import { useAuth } from '@/ui/components/auth';
import { useInstallPrompt } from '@/ui/lib/useInstallPrompt';
import { Skeleton } from '@/design-system';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsRow';

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '26px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  // title sits inside the 16px-gap stack; the gap alone provides spacing
  margin: 0,
});

const stack = css({ display: 'flex', flexDirection: 'column', gap: '16px' });

const profile = css({
  display: 'flex',
  alignItems: 'center',
  gap: '13px',
  bg: 'ws.card',
  borderRadius: '18px',
  padding: '14px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
});
const avatar = css({
  flex: 'none',
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  bg: 'ws.sakuraDark',
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '20px',
});
const profileLink = css({ textDecoration: 'none', cursor: 'pointer', transition: 'background-color 120ms', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const profileName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const profileMeta = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, marginTop: '2px' });

const groupLabel = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'ws.eyebrow',
  margin: '0 6px 7px',
});
const listCard = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  bg: 'ws.card',
  borderRadius: '18px',
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05)',
});

const chevron = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.5, display: 'flex' });

const themeCard = css({ bg: 'ws.card', borderRadius: '18px', padding: '8px', boxShadow: '0 1px 2px rgba(33,75,64,0.05)' });

const THEME_OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: 'clair', label: 'Clair' },
  { id: 'sombre', label: 'Sombre' },
  { id: 'auto', label: 'Auto' },
];

function ThemeGroup({ themeStore }: { readonly themeStore: ThemeStore }) {
  const [pref, setPref] = useState<ThemePreference>(() => themeStore.load());
  return (
    <section aria-label="Apparence">
      <div className={groupLabel}>Apparence</div>
      <div className={themeCard}>
        <SegmentedControl
          mode="group"
          ariaLabel="Thème"
          options={THEME_OPTIONS}
          value={pref}
          onChange={(id) => {
            themeStore.set(id);
            setPref(id);
          }}
        />
      </div>
    </section>
  );
}

const foot = css({ fontFamily: 'wsMono', fontSize: '11px', color: 'ws.khaki', opacity: 0.85, textAlign: 'center', paddingTop: '10px' });

function initialFor(displayName: string): string {
  return ([...displayName][0] ?? '?').toLocaleUpperCase('fr-FR');
}

function ProfileCard() {
  const { state } = useAuth();

  // Skeleton while whoami resolves so the subtext never flips guest→name on first paint.
  if (state.status === 'loading') {
    return (
      <div className={cx(profile)} role="status" aria-busy="true" aria-label="Chargement du compte">
        <span className={avatar} aria-hidden="true">
          <User size={24} weight="bold" />
        </span>
        <div>
          <Skeleton tone="onCard" width={120} height={16} radius={6} />
          <Skeleton tone="onCard" width={80} height={11} radius={6} style={{ marginTop: '5px' }} />
        </div>
      </div>
    );
  }

  if (state.status === 'authed') {
    return (
      <Link to="/compte" className={cx(profile, profileLink)}>
        <span className={avatar} aria-hidden="true">{initialFor(state.whoami.displayName)}</span>
        <div>
          <div className={profileName}>{state.whoami.displayName}</div>
          <div className={profileMeta}>Voir mon compte</div>
        </div>
        <span className={chevron}>
          <CaretRight size={18} weight="bold" aria-hidden="true" />
        </span>
      </Link>
    );
  }

  return (
    <Link to="/compte" className={cx(profile, profileLink)}>
      <span className={avatar} aria-hidden="true">
        <User size={24} weight="bold" />
      </span>
      <div>
        <div className={profileName}>Invité</div>
        <div className={profileMeta}>Sans compte</div>
      </div>
      <span className={chevron}>
        <CaretRight size={18} weight="bold" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function ReglagesScreen() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const { themeStore } = useRouteContext({ from: '__root__' });
  return (
    <PhoneShell header={<BackHeader to="/" />} backTo="/">
      <div className={stack}>
        <h1 className={title}>Réglages</h1>

        <ProfileCard />

        {themeStore ? <ThemeGroup themeStore={themeStore} /> : null}

        {canInstall ? (
          <nav aria-label="Application">
            <div className={groupLabel}>Application</div>
            <ul className={listCard}>
              <SettingsRow
                icon={DownloadSimple}
                label="Installer l'application"
                sub="Sur ton écran d'accueil"
                onClick={promptInstall}
                last
              />
            </ul>
          </nav>
        ) : null}

        <nav aria-label="Confidentialité &amp; légal">
          <div className={groupLabel}>Confidentialité &amp; légal</div>
          <ul className={listCard}>
            <SettingsRow icon={Lock} tone="soft" to="/confidentialite" label="Confidentialité" />
            <SettingsRow icon={FileText} tone="soft" to="/mentions-legales" label="Mentions légales" />
            <SettingsRow
              icon={FileText}
              tone="soft"
              to="/conditions-abonnement"
              label="Conditions de vente"
              last
            />
          </ul>
        </nav>

        <nav aria-label="Aide">
          <div className={groupLabel}>Aide</div>
          <ul className={listCard}>
            <SettingsRow icon={Question} tone="soft" to="/aide" label="Aide & raccourcis" />
            <SettingsRow icon={Envelope} href="mailto:contact@wordsparrow.io" label="Nous écrire" last />
          </ul>
        </nav>

        <p className={foot}>WordSparrow · fait avec soin 🐦</p>
      </div>
    </PhoneShell>
  );
}
