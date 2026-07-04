import { useState } from 'react';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { CircleNotch } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { useAuth } from '@/ui/components/auth';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { OtpCodeInput } from '@/ui/components/primitives/OtpCodeInput';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 8px' });
const lede = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', margin: '0 0 20px', lineHeight: '1.5' });
const card = css({ bg: 'ws.card', borderRadius: '20px', padding: '22px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 12px 26px rgba(33,75,64,0.09)' });
const fieldLabel = css({ display: 'block', fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'black', letterSpacing: '0.02em', color: 'ws.jadeInk', margin: '0 0 8px' });
const emailInput = css({ width: '100%', height: '50px', borderRadius: '14px', border: '1.5px solid rgba(33,75,64,0.16)', bg: 'ws.card', paddingInline: '16px', fontFamily: 'wsUi', fontSize: '16px', fontWeight: 'semibold', color: 'ws.jadeInk', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const submitBtn = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', height: '50px', marginTop: '16px', borderRadius: '14px', border: 'none', bg: 'ws.jadeInk', color: 'ws.onJadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', cursor: 'pointer', transition: 'opacity 120ms', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' }, _disabled: { opacity: 0.55, cursor: 'not-allowed' } });
const errText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: '12px 0 0' });
const linkRow = css({ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px', alignItems: 'flex-start' });
const linkBtn = css({ border: 'none', bg: 'transparent', padding: 0, fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.jadeInk', textDecoration: 'underline', cursor: 'pointer', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '2px' }, _disabled: { opacity: 0.5, cursor: 'not-allowed' } });
const spin = css({ animation: 'wsSpin 0.7s linear infinite' });

const COOLDOWN_COPY = 'Trop de tentatives, réessaie dans une minute.';
const INVALID_EMAIL_COPY = 'Cette adresse e-mail n’est pas valide.';
const SEND_FAILED_COPY = 'L’envoi a échoué, réessaie.';
const CODE_INVALID_COPY = 'Code incorrect ou expiré.';

export interface ConnexionScreenProps {
  // `?returnTo=` destination once authenticated; defaults to home at the route boundary.
  readonly returnTo: string;
}

type Step = 'email' | 'code';

export function ConnexionScreen({ returnTo }: ConnexionScreenProps) {
  const { authClient } = useRouteContext({ from: '__root__' });
  const { refresh } = useAuth();
  const { say } = useAnnouncer();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const sendCode = async () => {
    if (!authClient || sending || email.trim().length === 0) return;
    setSending(true);
    setEmailError(null);
    try {
      const result = await authClient.startEmailOtp(email.trim());
      if (result === 'sent') {
        setStep('code');
        setCode('');
        setCodeError(null);
        say('Code envoyé par e-mail.');
      } else if (result === 'rate_limited') {
        setEmailError(COOLDOWN_COPY);
        say(COOLDOWN_COPY, { assertive: true });
      } else {
        setEmailError(INVALID_EMAIL_COPY);
        say(INVALID_EMAIL_COPY, { assertive: true });
      }
    } catch {
      setEmailError(SEND_FAILED_COPY);
      say(SEND_FAILED_COPY, { assertive: true });
    } finally {
      setSending(false);
    }
  };

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    void sendCode();
  };

  const verify = async (fullCode: string) => {
    if (!authClient || verifying) return;
    setVerifying(true);
    setCodeError(null);
    try {
      const result = await authClient.verifyEmailOtp(email.trim(), fullCode);
      if (result === 'ok') {
        await refresh();
        say('Connexion réussie.');
        void navigate({ to: returnTo });
      } else {
        setCodeError(CODE_INVALID_COPY);
        setCode('');
        say(CODE_INVALID_COPY, { assertive: true });
      }
    } catch {
      setCodeError(SEND_FAILED_COPY);
      say(SEND_FAILED_COPY, { assertive: true });
    } finally {
      setVerifying(false);
    }
  };

  const onCodeChange = (next: string) => {
    setCode(next);
    if (codeError) setCodeError(null);
    if (next.length === 6) void verify(next);
  };

  return (
    <PhoneShell header={<BackHeader to="/" />} backTo="/">
      {step === 'email' ? (
        <>
          <h1 className={title}>Connexion</h1>
          <p className={lede}>
            Entre ton adresse e-mail : on t’envoie un code à six chiffres pour te connecter, sans mot de passe.
          </p>
          <div className={card}>
            <form onSubmit={submitEmail} noValidate>
              <label className={fieldLabel} htmlFor="connexion-email">Adresse e-mail</label>
              <input
                id="connexion-email"
                className={emailInput}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.fr"
                disabled={sending}
              />
              <button type="submit" className={submitBtn} disabled={sending || email.trim().length === 0} aria-busy={sending || undefined}>
                {sending ? (
                  <>
                    <CircleNotch size={20} weight="bold" aria-hidden="true" className={spin} />
                    Envoi…
                  </>
                ) : (
                  'Recevoir le code'
                )}
              </button>
              {emailError ? <p className={errText} role="alert">{emailError}</p> : null}
            </form>
          </div>
        </>
      ) : (
        <>
          <h1 className={title}>Ton code</h1>
          <p className={lede}>
            On a envoyé un code à <strong>{email.trim()}</strong>. Saisis-le ci-dessous pour te connecter.
          </p>
          <div className={card}>
            <OtpCodeInput
              label="Code de connexion"
              value={code}
              onValueChange={onCodeChange}
              disabled={verifying}
              invalid={codeError != null}
              errorText={codeError ?? undefined}
            />
            <div className={linkRow}>
              <button type="button" className={linkBtn} onClick={() => void sendCode()} disabled={sending}>
                Renvoyer le code
              </button>
              <button type="button" className={linkBtn} onClick={() => { setStep('email'); setCode(''); setCodeError(null); }} disabled={verifying}>
                Modifier l’adresse e-mail
              </button>
            </div>
          </div>
        </>
      )}
    </PhoneShell>
  );
}
