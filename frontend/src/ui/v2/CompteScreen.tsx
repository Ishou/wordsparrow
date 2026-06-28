import { useEffect, useRef, useState } from 'react';
import { useRouteContext } from '@tanstack/react-router';
import { Check, CircleNotch, GoogleLogo, PencilSimple, SignOut, User, X } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { InvalidDisplayNameError, type GetMeResult } from '@/application/auth';
import { useAuth } from '@/ui/components/auth';
import { Skeleton } from '@/design-system';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { EraseData } from './EraseData';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 16px' });
const stack = css({ display: 'flex', flexDirection: 'column', gap: '16px' });

const hero = css({ display: 'flex', alignItems: 'center', gap: '15px', bg: 'white', borderRadius: '20px', padding: '18px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 12px 26px rgba(33,75,64,0.09)' });
const avatar = css({ flex: 'none', width: '62px', height: '62px', borderRadius: '50%', bg: 'ws.sakuraDark', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px' });
const avatarAnon = css({ bg: 'ws.jade', color: 'ws.jadeInk' });
const heroMain = css({ flex: 1, minWidth: 0 });
const heroName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '20px', color: 'ws.jadeInk', lineHeight: '1.15', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
const heroMeta = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, marginTop: '3px' });

const iconBtn = css({ flex: 'none', width: '38px', height: '38px', borderRadius: '50%', border: 'none', bg: 'ws.sable', color: 'ws.jadeInk', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', _hover: { bg: '#DED7BC' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

const editRow = css({ display: 'flex', gap: '8px', alignItems: 'center' });
const nameInput = css({ flex: 1, minWidth: 0, height: '44px', borderRadius: '12px', border: '1.5px solid rgba(33,75,64,0.16)', bg: 'white', paddingInline: '14px', fontFamily: 'wsDisplay', fontSize: '18px', fontWeight: 'semibold', color: 'ws.jadeInk', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const saveBtn = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '12px', border: 'none', bg: 'ws.sakuraDark', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', _disabled: { opacity: 0.45, cursor: 'not-allowed' } });
const cancelBtn = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '12px', border: 'none', bg: 'ws.sable', color: 'ws.jadeInk', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' });
const errText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', marginTop: '8px' });

const groupLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#543C00', margin: '0 6px 7px' });
const card = css({ bg: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(33,75,64,0.05)' });
const row = css({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '52px', padding: '12px 14px', fontFamily: 'wsUi', border: 'none', background: 'transparent', textAlign: 'left' });
const rowBtn = css({ cursor: 'pointer', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' } });
const tile = css({ flex: 'none', width: '34px', height: '34px', borderRadius: '10px', bg: 'ws.jade', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk' });
const rowLabel = css({ fontSize: '14.5px', fontWeight: 'bold', color: 'ws.jadeInk' });
const rowSub = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, marginTop: '1px' });
const dangerWrap = css({ marginTop: '6px' });

const signInCard = css({ bg: 'white', borderRadius: '20px', padding: '22px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 12px 26px rgba(33,75,64,0.09)', textAlign: 'center' });
const signInLede = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', marginTop: '8px', marginBottom: '16px' });
const googleBtn = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', height: '50px', borderRadius: '14px', bg: 'ws.jadeInk', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', textDecoration: 'none', cursor: 'pointer', transition: 'opacity 120ms', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const spin = css({ animation: 'wsSpin 0.7s linear infinite' });

function initialFor(name: string): string {
  return ([...name.trim()][0] ?? '?').toLocaleUpperCase('fr-FR');
}
function memberSince(iso: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function AuthedCompte() {
  const { state, refresh } = useAuth();
  const { authClient } = useRouteContext({ from: '__root__' });
  const [me, setMe] = useState<GetMeResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authClient) return;
    let cancelled = false;
    authClient.getMe().then((r) => { if (!cancelled) setMe(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [authClient]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  // displayName is live in auth state even before getMe resolves.
  const name = state.status === 'authed' ? state.whoami.displayName : '';
  const google = me?.providers.find((p) => p.provider === 'google');

  const startEdit = () => { setDraft(name); setNameError(null); setEditing(true); };
  const cancelEdit = () => { if (!saving) { setEditing(false); setNameError(null); } };
  const save = async () => {
    if (!authClient) return;
    const value = draft.trim();
    if (value === name) { setEditing(false); return; }
    setSaving(true);
    setNameError(null);
    try {
      await authClient.updateMe(value);
      const fresh = await authClient.getMe();
      setMe(fresh);
      await refresh();
      setEditing(false);
    } catch (cause) {
      setNameError(cause instanceof InvalidDisplayNameError ? 'Ce pseudonyme n’est pas valide.' : 'La mise à jour a échoué. Réessaie.');
    } finally {
      setSaving(false);
    }
  };
  const logout = async () => {
    if (!authClient) return;
    try {
      await authClient.logout();
      await refresh();
    } catch (cause) {
      console.warn('logout failed', cause);
    }
  };

  return (
    <div className={stack}>
      <section className={hero}>
        <span className={avatar} aria-hidden="true">{initialFor(name)}</span>
        <div className={heroMain}>
          {editing ? (
            <div className={editRow}>
              <input
                ref={inputRef}
                className={nameInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') cancelEdit(); }}
                maxLength={40}
                autoComplete="off"
                aria-label="Pseudonyme"
                disabled={saving}
              />
              <button type="button" className={saveBtn} onClick={() => void save()} disabled={saving || draft.trim().length === 0} aria-label="Enregistrer">
                <Check size={20} weight="bold" aria-hidden="true" />
              </button>
              <button type="button" className={cancelBtn} onClick={cancelEdit} disabled={saving} aria-label="Annuler">
                <X size={20} weight="bold" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className={editRow}>
              <div className={heroMain}>
                <div className={heroName}>{name}</div>
                <div className={heroMeta}>{me ? `Membre depuis ${memberSince(me.createdAt)}` : 'Connecté'}</div>
              </div>
              <button type="button" className={iconBtn} onClick={startEdit} aria-label="Modifier le pseudonyme">
                <PencilSimple size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>
      {nameError ? <p className={errText} role="alert">{nameError}</p> : null}

      <nav aria-label="Connexion">
        <div className={groupLabel}>Connexion</div>
        <div className={card}>
          <div className={row}>
            <span className={tile}><GoogleLogo size={18} weight="bold" aria-hidden="true" /></span>
            <span>
              <span className={rowLabel}>Google</span>
              <span className={rowSub} style={{ display: 'block' }}>{google ? 'Compte connecté' : 'Non connecté'}</span>
            </span>
          </div>
          <button type="button" className={cx(row, rowBtn)} onClick={() => void logout()} style={{ borderTop: '1px solid #EEF3EC' }}>
            <span className={tile}><SignOut size={18} weight="bold" aria-hidden="true" /></span>
            <span className={rowLabel}>Se déconnecter</span>
          </button>
        </div>
      </nav>

      <nav aria-label="Données" className={dangerWrap}>
        <div className={groupLabel}>Tes données</div>
        <EraseData />
      </nav>
    </div>
  );
}

function SignInPrompt() {
  const { authClient } = useRouteContext({ from: '__root__' });
  const [returnTo, setReturnTo] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => setReturnTo(window.location.href), []);
  const href = authClient && returnTo ? authClient.signInUrl('google', returnTo) : '#';
  const disabled = href === '#' || redirecting;
  return (
    <div className={stack}>
      <div className={signInCard}>
        <span className={cx(avatar, avatarAnon)} aria-hidden="true" style={{ margin: '0 auto' }}>
          <User size={28} weight="bold" />
        </span>
        <p className={signInLede}>Connecte-toi pour retrouver ta progression sur tous tes appareils.</p>
        {/* Anchor required: the browser must follow the 302 chain to accept Set-Cookie. */}
        <a
          href={href}
          aria-disabled={disabled ? true : undefined}
          aria-busy={redirecting || undefined}
          className={googleBtn}
          style={redirecting ? { pointerEvents: 'none', opacity: 0.85 } : undefined}
          // Show progress while the browser follows the OAuth redirect chain.
          onClick={() => { if (href !== '#') setRedirecting(true); }}
        >
          {redirecting ? (
            <>
              <CircleNotch size={20} weight="bold" aria-hidden="true" className={spin} />
              Connexion…
            </>
          ) : (
            <>
              <GoogleLogo size={20} weight="bold" aria-hidden="true" />
              Se connecter avec Google
            </>
          )}
        </a>
      </div>
    </div>
  );
}

export function CompteScreen() {
  const { state } = useAuth();
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <h1 className={title}>Mon compte</h1>
      {state.status === 'loading' ? (
        <div className={stack}>
          <Skeleton tone="onCard" width="100%" height={98} radius={20} />
          <Skeleton tone="onCard" width="100%" height={120} radius={16} />
        </div>
      ) : state.status === 'authed' ? (
        <AuthedCompte />
      ) : (
        <SignInPrompt />
      )}
    </PhoneShell>
  );
}
