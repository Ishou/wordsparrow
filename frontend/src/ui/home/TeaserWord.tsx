import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { css, cx } from 'styled-system/css';
import { Cell, DefCell } from '@/design-system';

// Playable single-word teaser: correct → celebrate + rotate; wrong → wobble + break streak; bonus streak surfaced upward.
const CLUES: ReadonlyArray<{ clue: string; answer: string }> = [
  { clue: 'Note', answer: 'SOL' },
  { clue: 'Roi', answer: 'LION' },
  { clue: 'Mois', answer: 'MAI' },
  { clue: 'Félin', answer: 'CHAT' },
  { clue: 'Astre', answer: 'LUNE' },
  { clue: 'Fleur', answer: 'IRIS' },
  { clue: 'Métal', answer: 'FER' },
  { clue: 'Refus', answer: 'NON' },
];

const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' });
const row = css({ display: 'flex', gap: '4px' });
// 42px wide + font-size 13px → Cell/DefCell renders at teaser size.
const box = css({ position: 'relative', width: '42px', fontSize: '13px' });
const glow = css({ borderRadius: '9px', zIndex: 1, animation: 'wsSolveGlow 0.5s ease-out both' });
const shake = css({ animation: 'wsShake 0.4s ease-in-out both' });
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
});
// Reserved row below the word so the skip button appears without a layout shift.
const skipRow = css({ height: '20px', display: 'flex', alignItems: 'center' });
const skipBtn = css({
  border: 'none',
  background: 'transparent',
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

function nextIndex(current: number): number {
  const j = Math.floor(Math.random() * CLUES.length);
  return j === current ? (j + 1) % CLUES.length : j;
}

export interface TeaserWordProps {
  // Reports the bonus streak (consecutive correct words) + the best so far.
  readonly onStreak?: (current: number, best: number) => void;
}

export function TeaserWord({ onStreak }: TeaserWordProps) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * CLUES.length));
  const { clue, answer } = CLUES[idx];
  const target = answer.toUpperCase();
  const n = target.length;
  // lettersRef is the sync source of truth for fast typists; `letters` mirrors it for render.
  const lettersRef = useRef<string[]>(Array(n).fill(''));
  const [letters, setLetters] = useState<string[]>(lettersRef.current);
  const [focus, setFocus] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [errored, setErrored] = useState(false);
  const streakRef = useRef(0);
  const bestRef = useRef(0);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focusOnNext = useRef(false); // focus cell 0 only after a rotation, not on mount
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (focusOnNext.current) {
      focusOnNext.current = false;
      refs.current[0]?.focus();
    }
  }, [idx]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const commit = (next: string[]) => {
    lettersRef.current = next;
    setLetters(next);
  };

  const rotate = (toIdx: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    focusOnNext.current = true;
    commit(Array(CLUES[toIdx].answer.length).fill(''));
    setIdx(toIdx);
    setSolved(false);
    setWrong(false);
    setErrored(false);
  };
  const skip = () => rotate(nextIndex(idx));

  const handleChange = (i: number, raw: string) => {
    if (solved) return; // typing stays live through the wobble (no input lock)
    const ch = (raw.replace(/[^a-zA-Z]/g, '').slice(-1) ?? '').toUpperCase();
    if (!ch) return;
    const wasFull = lettersRef.current.every((c) => c !== '');
    const next = [...lettersRef.current];
    next[i] = ch;
    commit(next);

    if (next.join('') === target) {
      // Correct → celebrate, bump streak, rotate to a fresh clue.
      if (timer.current) window.clearTimeout(timer.current);
      streakRef.current += 1;
      bestRef.current = Math.max(bestRef.current, streakRef.current);
      onStreak?.(streakRef.current, bestRef.current);
      setSolved(true);
      setWrong(false);
      setFocus(null);
      refs.current[i]?.blur();
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(14);
      timer.current = window.setTimeout(() => rotate(nextIndex(idx)), 900);
    } else if (next.every((c) => c !== '') && !wasFull) {
      // Just completed but wrong: wobble + break streak; re-editing an already-full word doesn't re-fire.
      if (timer.current) window.clearTimeout(timer.current);
      streakRef.current = 0;
      onStreak?.(0, bestRef.current);
      setWrong(true);
      setErrored(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([0, 28, 38, 28]);
      timer.current = window.setTimeout(() => setWrong(false), 460);
    } else if (i < n - 1) {
      refs.current[i + 1]?.focus();
    }
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
    // Backspace always steps back: filled cell erases in place + moves left; empty cell erases previous.
    const next = [...lettersRef.current];
    if (next[i]) {
      next[i] = '';
    } else if (i > 0) {
      next[i - 1] = '';
    }
    commit(next);
    if (i > 0) refs.current[i - 1]?.focus();
  };

  return (
    <div className={wrap}>
      <div className={row}>
        <div className={box}>
          <DefCell clues={[clue]} arrow="right" validated={solved} />
        </div>
        {Array.from({ length: n }, (_, i) => {
          // Focus wins over filled so a re-focused cell always shows the active ring.
          const state = solved ? 'solved' : focus === i ? 'active' : letters[i] ? 'filled' : 'empty';
          return (
            <div
              key={i}
              className={cx(box, solved && glow, wrong && shake)}
              style={solved ? { animationDelay: `${i * 60}ms` } : undefined}
            >
              <Cell state={state} letter={letters[i]} />
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className={input}
                // Always-empty capture input: Cell renders the letter so typing always overtypes.
                value=""
                maxLength={1}
                // Roving tabindex: word is a single Tab stop; arrows/tap move between slots.
                tabIndex={i === (focus ?? 0) ? 0 : -1}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                readOnly={solved}
                aria-label={`${clue} — lettre ${i + 1} sur ${n}`}
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
        {errored ? (
          <button type="button" className={skipBtn} onClick={skip}>
            Passer ›
          </button>
        ) : null}
      </div>
    </div>
  );
}
