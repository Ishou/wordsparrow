import { css } from 'styled-system/css';
import { Lockup, SparrowMark, Wordmark } from '@/design-system';

// App Lockup design screen: sparrow-tile mark + bichrome wordmark, horizontal / vertical.

const page = css({ minHeight: '100vh', bg: '#E7E3D7', padding: '52px 28px 90px', fontFamily: 'wsUi', color: 'ws.jadeInk' });
const inner = css({ maxWidth: '1120px', marginInline: 'auto' });

const mono = css({ fontFamily: 'wsMono' });
const kicker = css({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' });
const dot = css({ width: '11px', height: '11px', borderRadius: '50%', bg: 'ws.sakura' });
const kickerText = css({ fontFamily: 'wsMono', fontSize: '12px', letterSpacing: '0.26em', textTransform: 'uppercase', color: 'ws.khaki' });
const h1 = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '46px', lineHeight: '1.02', margin: 0, color: 'ws.jadeInk', letterSpacing: '-0.01em' });
const lede = css({ fontFamily: 'wsUi', fontSize: '16px', lineHeight: '1.55', color: 'ws.khaki', margin: '13px 0 0', maxWidth: '640px' });

const sectionHead = css({ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '0 0 16px' });
const h2 = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '22px', margin: 0, color: 'ws.jadeInk' });
const sub = css({ fontFamily: 'wsMono', fontSize: '11px', color: 'ws.khaki', opacity: 0.6 });

const card = css({ bg: 'white', borderRadius: '18px', padding: '30px', boxShadow: '0 1px 2px rgba(33,75,64,0.04), 0 8px 22px rgba(33,75,64,0.07)', marginBottom: '24px' });
const two = css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' });
const jadePanel = css({ borderRadius: '14px', bgImage: 'linear-gradient(160deg,#CDE9DA,#BBE0CD)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const darkPanel = css({ borderRadius: '14px', bgImage: 'linear-gradient(160deg,#2A5A4C,#1C4338)', display: 'flex', alignItems: 'center', justifyContent: 'center' });

const contextCard = css({ bg: 'white', borderRadius: '18px', padding: '24px', boxShadow: '0 1px 2px rgba(33,75,64,0.04), 0 8px 22px rgba(33,75,64,0.07)' });
const contextLabel = css({ fontFamily: 'wsMono', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'ws.khaki', opacity: 0.55, marginBottom: '16px' });

function Stars() {
  const star = (filled: boolean) => (
    <div style={{ width: 11, height: 11, background: filled ? '#D45D83' : '#E8E2C6', clipPath: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' }} />
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <div style={{ display: 'flex', gap: 2 }}>{star(true)}{star(true)}{star(true)}{star(true)}{star(false)}</div>
      <span className={mono} style={{ fontSize: 10, color: '#4C4824', opacity: 0.6 }}>4.8</span>
    </div>
  );
}

export function LockupScreen() {
  return (
    <div className={page}>
      <div className={inner}>
        {/* MASTHEAD */}
        <div style={{ marginBottom: 36 }}>
          <div className={kicker}>
            <span aria-hidden="true" className={dot} />
            <span className={kickerText}>WordSparrow · Identité · Lockup</span>
          </div>
          <h1 className={h1}>Icône + titre</h1>
          <p className={lede}>
            La tuile-oiseau inclinée associée au mot-symbole bichrome — <Wordmark size={16} tone="jade" />. Horizontal, vertical, puis les trois contextes d&apos;usage.
          </p>
        </div>

        {/* HORIZONTAL */}
        <div className={sectionHead}>
          <h2 className={h2}>Horizontal</h2>
          <span className={sub}>icône + nom · côte à côte</span>
        </div>
        <div className={card}>
          <div className={two} style={{ marginBottom: 22 }}>
            <div className={jadePanel} style={{ padding: '44px 32px' }}>
              <Lockup orientation="horizontal" tone="jade" iconSize={64} textSize={46} />
            </div>
            <div className={darkPanel} style={{ padding: '44px 32px' }}>
              <Lockup orientation="horizontal" tone="dark" iconSize={64} textSize={46} />
            </div>
          </div>
          <div className={jadePanel} style={{ borderRadius: 12, padding: '14px 20px', justifyContent: 'space-between' }}>
            <Lockup orientation="horizontal" tone="jade" iconSize={34} textSize={22} gap={10} />
            <span className={mono} style={{ fontSize: 10, color: '#214B40', opacity: 0.5 }}>≈ en-tête app</span>
          </div>
          <div className={mono} style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4C4824', opacity: 0.55, marginTop: 16 }}>
            Fredoka 500 jade · 600 sakura · lettre-espacement −0.015em
          </div>
        </div>

        {/* VERTICAL */}
        <div className={sectionHead}>
          <h2 className={h2}>Vertical</h2>
          <span className={sub}>icône au-dessus du nom · empilé</span>
        </div>
        <div className={card}>
          <div className={two}>
            <div className={jadePanel} style={{ padding: '52px 24px' }}>
              <Lockup orientation="vertical" tone="jade" iconSize={82} textSize={40} />
            </div>
            <div className={darkPanel} style={{ padding: '52px 24px' }}>
              <Lockup orientation="vertical" tone="dark" iconSize={82} textSize={40} />
            </div>
          </div>
        </div>

        {/* CONTEXTES */}
        <div className={sectionHead}>
          <h2 className={h2}>Contextes</h2>
          <span className={sub}>barre d&apos;app · splash · App Store</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr 1fr', gap: 18 }}>
          {/* App bar */}
          <div className={contextCard}>
            <div className={contextLabel}>Barre d&apos;application</div>
            <div style={{ borderRadius: 13, overflow: 'hidden', boxShadow: '0 3px 12px rgba(33,75,64,0.14)' }}>
              <div style={{ background: 'linear-gradient(160deg,#2A5A4C,#1C4338)', padding: '10px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={mono} style={{ fontSize: 10, color: '#CDE9DA', opacity: 0.8 }}>9:41</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 10 }}>
                    <div style={{ width: 3, height: 5, background: '#CDE9DA', borderRadius: 1, opacity: 0.6 }} />
                    <div style={{ width: 3, height: 7, background: '#CDE9DA', borderRadius: 1, opacity: 0.8 }} />
                    <div style={{ width: 3, height: 9, background: '#CDE9DA', borderRadius: 1 }} />
                  </div>
                  <div style={{ width: 18, height: 9, borderRadius: 2, border: '1.5px solid rgba(205,233,218,0.7)', position: 'relative' }}>
                    <div style={{ margin: 1.5, width: '60%', height: '100%', background: '#CDE9DA', borderRadius: 1 }} />
                  </div>
                </div>
              </div>
              <div style={{ background: 'linear-gradient(160deg,#2A5A4C,#1C4338)', padding: '12px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Lockup orientation="horizontal" tone="dark" iconSize={34} textSize={21} gap={10} />
                <div style={{ width: 20, height: 2, background: 'rgba(205,233,218,0.55)', borderRadius: 2, boxShadow: '0 4px 0 rgba(205,233,218,0.55),0 8px 0 rgba(205,233,218,0.55)' }} />
              </div>
              <div style={{ background: 'linear-gradient(180deg,#C4E5D3 0%,#BBE0CD 100%)', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 10, background: 'rgba(33,75,64,0.12)', borderRadius: 5, width: '60%' }} />
                <div style={{ height: 8, background: 'rgba(33,75,64,0.08)', borderRadius: 4, width: '80%' }} />
                <div style={{ height: 8, background: 'rgba(33,75,64,0.08)', borderRadius: 4, width: '45%' }} />
                <div style={{ height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.5)', marginTop: 6 }} />
              </div>
            </div>
          </div>

          {/* Splash */}
          <div className={contextCard}>
            <div className={contextLabel}>Écran de lancement</div>
            <div style={{ borderRadius: 20, background: 'linear-gradient(165deg,#2A5A4C,#1C4338)', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, boxShadow: '0 4px 18px rgba(33,75,64,0.22)' }}>
              <SparrowMark size={110} colorway="sakura" variant="strong" tilt />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Wordmark size={36} tone="dark" />
                <span style={{ fontFamily: "'Nunito Variable', system-ui, sans-serif", fontSize: 13, color: '#CDE9DA', opacity: 0.75, letterSpacing: '0.04em' }}>Mots fléchés · chaque jour</span>
              </div>
            </div>
          </div>

          {/* App Store */}
          <div className={contextCard}>
            <div className={contextLabel}>Fiche App Store</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, paddingBottom: 18, borderBottom: '1px solid rgba(33,75,64,0.10)' }}>
              <SparrowMark size={54} colorway="sakura" variant="strong" tilt tile="jade" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                <Wordmark size={20} tone="jade" />
                <span style={{ fontFamily: "'Nunito Variable', system-ui, sans-serif", fontSize: 12, color: '#4C4824', opacity: 0.7 }}>Mots fléchés quotidiens</span>
                <Stars />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: "'Nunito Variable', system-ui, sans-serif", fontSize: 11, fontWeight: 700, color: '#214B40' }}>Gratuit</span>
                <span className={mono} style={{ fontSize: 9, color: '#4C4824', opacity: 0.55 }}>Jeux de mots · 4+</span>
              </div>
              <div style={{ background: '#D45D83', color: '#fff', fontFamily: "'Nunito Variable', system-ui, sans-serif", fontWeight: 800, fontSize: 13, padding: '8px 22px', borderRadius: 999, boxShadow: '0 2px 8px rgba(212,93,131,0.30)' }}>Obtenir</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ flex: 1, height: 72, borderRadius: 8, background: 'linear-gradient(160deg,#CDE9DA,#BBE0CD)' }} />
              <div style={{ flex: 1, height: 72, borderRadius: 8, background: 'linear-gradient(160deg,#C4E5D3,#B8DDCB)' }} />
              <div style={{ flex: 1, height: 72, borderRadius: 8, background: 'linear-gradient(160deg,#CDE9DA,#BBE0CD)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
