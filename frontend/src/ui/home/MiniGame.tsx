import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { Cell, DefCell, Skeleton } from '@/design-system';
import { GRID_INPUT_GUARDS } from '@/ui/components/grid/gridInputGuards';
import { useTouchPrimary } from '@/ui/components/keyboard/useTouchPrimary';
import { Keyboard } from '@/ui/play/Keyboard';
import { useBackDismiss } from '@/ui/lib/useBackDismiss';
import type { SampleWord, WordsRepository } from '@/application';


const BATCH_OPTS = { minLen: 3, maxLen: 6, count: 24 } as const;
// Refetch this many words before the pool runs dry so the next word is already in hand.
const REFETCH_AHEAD = 3;
// Only reveal the "checking…" pulse once a server validation has been slow this long, so fast checks never flash it.
const VALIDATING_DELAY_MS = 200;

const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' });
const row = css({ display: 'flex', alignItems: 'center', gap: '4px' });
// 42px wide + font-size 13px → Cell/DefCell renders at minigame size.
const box = css({ position: 'relative', width: '42px', fontSize: '13px' });
// The clue is a standalone word (not a uniform grid), so the def cell reads at 1.5× the letters.
const defBox = css({ position: 'relative', width: '63px', fontSize: '19.5px' });
const glow = css({ borderRadius: '9px', zIndex: 1, animation: 'wsSolveGlow 0.5s ease-out both' });
const shake = css({ animation: 'wsShake 0.4s ease-in-out both' });
const validatingPulse = css({ borderRadius: '9px', outline: '2px solid', outlineOffset: '-2px', animation: 'wsValidating 1.1s ease-in-out infinite' });
const input = css({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  borderRadius: '9px',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'transparent',
  caretColor: 'transparent',
  textAlign: 'center',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  // Match the play cell: no text selection / iOS magnifier on the capture input.
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  '&::-webkit-search-cancel-button': { display: 'none' },
  '&::-webkit-search-decoration': { display: 'none' },
});
// Reserved row below the word so the skip button appears without a layout shift.
const skipRow = css({ height: '20px', display: 'flex', alignItems: 'center' });
const skipBtn = css({
  border: 'none',
  background: 'transparent',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  cursor: 'pointer',
  fontFamily: 'wsUi',
  fontSize: '12px',
  fontWeight: 'semibold',
  color: 'ws.khaki',
  opacity: 0.6,
  padding: '2px 8px',
  borderRadius: '999px',
  transition: 'opacity 120ms',
  _hover: { opacity: 1 },
  _active: { opacity: 1 },
});
// Docks our on-screen keyboard at the bottom (touch only) so the native soft keyboard never has to open.
const kbDock = css({ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '6px 14px calc(8px + env(safe-area-inset-bottom))' });
const kbInner = css({ width: '100%', maxWidth: '440px' });
// Dismiss handle sits on the dock, above the keys (where a keyboard's collapse affordance belongs).
const kbCollapse = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '46px', height: '24px', border: 'none', borderRadius: '999px', background: 'rgba(255,255,255,0.62)', backdropFilter: 'blur(10px)', boxShadow: '0 2px 12px rgba(33,75,64,0.14)', color: 'ws.jadeInk', cursor: 'pointer', _active: { opacity: 0.85 }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

// Fisher–Yates: each batch is walked in order, so every word shows once before any repeat.
function shuffle(words: ReadonlyArray<SampleWord>): SampleWord[] {
  const a = [...words];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface MiniGameProps {
  // Reports the bonus streak (consecutive correct words) + the best so far.
  readonly onStreak?: (current: number, best: number) => void;
  // Source of mini-game pairs (ADR-0073). Absent → the hero stays in its loading skeleton.
  readonly wordsRepository?: WordsRepository;
  // Signals when the on-screen keyboard is docked so the host can hide the bottom nav it would overlap.
  readonly onKeyboardToggle?: (open: boolean) => void;
}

export function MiniGame({ onStreak, wordsRepository, onKeyboardToggle }: MiniGameProps) {
  const touchPrimary = useTouchPrimary();
  const [pool, setPool] = useState<ReadonlyArray<SampleWord>>([]);
  // Always start in the skeleton; the prerender has no repository, so a hard-coded clue would flash before the real one loads.
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const current: SampleWord | undefined = pool[idx];
  // The answer never reaches the client (ADR-0076); we render `answerLength` cells and verify via the server token.
  const n = current?.answerLength ?? 0;
  // lettersRef is the sync source of truth for fast typists; `letters` mirrors it for render.
  const lettersRef = useRef<string[]>(Array(n).fill(''));
  const [letters, setLetters] = useState<string[]>(lettersRef.current);
  const [focus, setFocus] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(false);
  // Discreet "checking…" pulse while a slow server validation is in flight (gated by a short delay so fast checks never flash it).
  const [validating, setValidating] = useState(false);
  const validateTimer = useRef<number | null>(null);
  const [passerUnlocked, setPasserUnlocked] = useState(false);
  const streakRef = useRef(0);
  const bestRef = useRef(0);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focusOnNext = useRef(false); // focus cell 0 only after a rotation, not on mount
  const timer = useRef<number | null>(null);
  // Bumped on every rotate/skip so an in-flight verify result that resolves after the user moved on is ignored.
  const verifySeq = useRef(0);
  // One refetch at a time: guards against overlapping fetches when several words are consumed quickly.
  const refetching = useRef(false);

  useEffect(() => {
    if (!wordsRepository) return;
    let cancelled = false;
    wordsRepository
      .fetchSampleWords(BATCH_OPTS)
      .then((words) => {
        if (cancelled) return;
        const usable = shuffle(words.filter((w) => w.answerLength > 0));
        if (usable.length > 0) {
          setPool(usable);
          setIdx(0);
          lettersRef.current = Array(usable[0].answerLength).fill('');
          setLetters(lettersRef.current);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [wordsRepository]);

  useEffect(() => {
    if (focusOnNext.current) {
      focusOnNext.current = false;
      refs.current[0]?.focus();
    }
  }, [idx]);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (validateTimer.current) window.clearTimeout(validateTimer.current);
  }, []);

  // Our on-screen keyboard docks at the bottom on touch while a cell is focused; tell the host so it can hide the bottom nav.
  const kbOpen = touchPrimary && focus !== null && !solved;
  useEffect(() => { onKeyboardToggle?.(kbOpen); }, [kbOpen, onKeyboardToggle]);

  const commit = (next: string[]) => {
    lettersRef.current = next;
    setLetters(next);
  };

  const stopValidating = () => {
    if (validateTimer.current) {
      window.clearTimeout(validateTimer.current);
      validateTimer.current = null;
    }
    setValidating(false);
  };

  const rotate = (toIdx: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    stopValidating();
    verifySeq.current += 1; // any verify still in flight for the old word is now stale
    focusOnNext.current = true;
    commit(Array(pool[toIdx].answerLength).fill(''));
    setIdx(toIdx);
    setSolved(false);
    setWrong(false);
    // passerUnlocked is intentionally NOT reset: once a wrong guess reveals Passer, it stays for the session.
  };

  // Queue a fresh shuffled batch when the pool nears exhaustion so the game never runs out; a failure just retries later.
  const refetchAhead = (nextIdx: number) => {
    if (!wordsRepository || refetching.current) return;
    if (pool.length - nextIdx > REFETCH_AHEAD) return;
    refetching.current = true;
    wordsRepository
      .fetchSampleWords(BATCH_OPTS)
      .then((words) => {
        const usable = shuffle(words.filter((w) => w.answerLength > 0));
        if (usable.length > 0) setPool((prev) => [...prev, ...usable]);
      })
      .catch(() => {})
      .finally(() => { refetching.current = false; });
  };

  // Walk the shuffled pool in order so every word shows before any repeat; wrap only if a refetch hasn't landed yet.
  const advance = () => {
    const nextIdx = idx + 1 < pool.length ? idx + 1 : 0;
    refetchAhead(nextIdx);
    rotate(nextIdx);
  };
  // Blur the active cell to drop the native soft keyboard (touch only).
  const dismissKeyboard = () => {
    if (focus !== null) refs.current[focus]?.blur();
  };
  useBackDismiss(kbOpen, dismissKeyboard);
  // Skipping = giving up on the word, so it breaks the streak (a wrong guess alone doesn't).
  const skip = () => {
    streakRef.current = 0;
    onStreak?.(0, bestRef.current);
    advance();
  };

  // Correct → celebrate, bump streak, rotate to a fresh clue.
  const onCorrect = (i: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    streakRef.current += 1;
    bestRef.current = Math.max(bestRef.current, streakRef.current);
    onStreak?.(streakRef.current, bestRef.current);
    setSolved(true);
    setWrong(false);
    setFocus(null);
    refs.current[i]?.blur();
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(14);
    timer.current = window.setTimeout(advance, 900);
  };
  // Wrong on completion: wobble + reveal Passer. The streak breaks on skip, not on a wrong guess.
  const onWrong = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setWrong(true);
    setPasserUnlocked(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([0, 28, 38, 28]);
    timer.current = window.setTimeout(() => setWrong(false), 460);
  };

  const handleChange = (i: number, raw: string) => {
    if (solved) return; // typing stays live through the wobble (no input lock)
    const ch = (raw.replace(/[^a-zA-Z]/g, '').slice(-1) ?? '').toUpperCase();
    if (!ch) return;
    const wasFull = lettersRef.current.every((c) => c !== '');
    const next = [...lettersRef.current];
    next[i] = ch;
    commit(next);

    if (next.every((c) => c !== '')) {
      // Re-typing an already-full word (e.g. fixing letters after a wrong guess) must not re-fire verify, but the cursor should still advance.
      if (wasFull || !current) {
        if (i < n - 1) refs.current[i + 1]?.focus();
        return;
      }
      const guess = next.join('');
      const seq = verifySeq.current;
      // Arm the "checking…" pulse after a short delay; a fast result clears it before it ever shows.
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
      validateTimer.current = window.setTimeout(() => {
        if (seq === verifySeq.current && !solved) setValidating(true);
      }, VALIDATING_DELAY_MS);
      // Server-side check (ADR-0076); typing isn't blocked, and a result for a word the user already left is ignored.
      void wordsRepository
        ?.verifySample(current.token, guess)
        .then((correct) => {
          stopValidating();
          if (seq !== verifySeq.current || solved) return;
          if (correct) onCorrect(i);
          else onWrong();
        })
        .catch(() => {
          stopValidating();
          if (seq === verifySeq.current && !solved) onWrong();
        });
    } else if (i < n - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  // Backspace always steps back: a filled cell erases in place + moves left; an empty cell erases the previous.
  const backspaceAt = (i: number) => {
    if (solved) return;
    const next = [...lettersRef.current];
    if (next[i]) next[i] = '';
    else if (i > 0) next[i - 1] = '';
    commit(next);
    if (i > 0) refs.current[i - 1]?.focus();
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (solved) return;
    // Left/Right move between cells (allowed even mid-wobble so focus can move).
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (i > 0) refs.current[i - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (i < n - 1) refs.current[i + 1]?.focus();
      return;
    }
    if (e.key !== 'Backspace') return;
    e.preventDefault();
    backspaceAt(i);
  };

  if (loading || !current) {
    return (
      <div className={wrap} role="status" aria-busy="true" aria-label="Chargement du mot du jour">
        <div className={row}>
          <Skeleton tone="deep" width={63} height={63} radius={9} />
          <Skeleton tone="onCard" width={42} height={42} radius={9} />
          <Skeleton tone="onCard" width={42} height={42} radius={9} />
          <Skeleton tone="onCard" width={42} height={42} radius={9} />
        </div>
        <div className={skipRow} />
      </div>
    );
  }

  // Discreet "checking…" pulse on the word while a slow server validation is pending (suppressed once it resolves to solved/wrong).
  const showPulse = validating && !solved && !wrong;

  return (
    <>
    <div className={wrap}>
      <span role="status" aria-live="polite" className={css({ srOnly: true })}>
        {showPulse ? 'Vérification du mot…' : ''}
      </span>
      <div className={row}>
        <div className={defBox}>
          <DefCell clues={[current.clue]} arrow="right" validated={solved} />
        </div>
        {Array.from({ length: n }, (_, i) => {
          // Focus wins over filled so a re-focused cell always shows the active ring; the rest of the word lights as activeWord (matches the grid's whole-word highlight).
          const state = solved
            ? 'solved'
            : focus === i
              ? 'active'
              : focus !== null
                ? 'activeWord'
                : letters[i]
                  ? 'filled'
                  : 'empty';
          return (
            <div
              key={i}
              className={cx(box, solved && glow, wrong && shake, showPulse && validatingPulse)}
              data-validating={showPulse ? 'true' : undefined}
              style={solved ? { animationDelay: `${i * 60}ms` } : undefined}
            >
              <Cell state={state} letter={letters[i]} />
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                {...GRID_INPUT_GUARDS}
                className={input}
                // Always-empty capture input: Cell renders the letter so typing always overtypes.
                value=""
                maxLength={1}
                // Roving tabindex: word is a single Tab stop; arrows/tap move between slots.
                tabIndex={i === (focus ?? 0) ? 0 : -1}
                // Read-only on touch removes the editing caret/selection; letters come from the on-screen keyboard.
                readOnly={solved || touchPrimary}
                aria-label={`${current.clue} — lettre ${i + 1} sur ${n}`}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus((f) => (f === i ? null : f))}
              />
            </div>
          );
        })}
      </div>
      <div className={skipRow}>
        {passerUnlocked ? (
          <button type="button" className={skipBtn} onClick={skip}>
            Passer ›
          </button>
        ) : null}
      </div>
    </div>
    {kbOpen ? (
      <div className={kbDock}>
        <button
          type="button"
          className={kbCollapse}
          aria-label="Masquer le clavier"
          // preventDefault keeps the cell focused until our onClick blurs it explicitly.
          onMouseDown={(e) => e.preventDefault()}
          onClick={dismissKeyboard}
        >
          <CaretDown size={16} weight="bold" aria-hidden="true" />
        </button>
        <div className={kbInner}>
          <Keyboard
            onLetter={(l) => { if (focus !== null) handleChange(focus, l); }}
            onBackspace={() => { if (focus !== null) backspaceAt(focus); }}
          />
        </div>
      </div>
    ) : null}
    </>
  );
}
