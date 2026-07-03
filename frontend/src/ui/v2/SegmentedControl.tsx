import { css, cx } from 'styled-system/css';

const track = css({ display: 'flex', bg: 'ws.sable', borderRadius: '13px', padding: '4px', gap: '4px' });
const segBtn = css({
  flex: 1,
  border: 'none',
  borderRadius: '10px',
  padding: '9px 0',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'background 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 120ms ease',
  _active: { transform: 'scale(0.96)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
// background/color live only on the variants (never on segBtn) — declaring a property on both base and the active variant lets Panda's atomic order beat cx, which leaves the active segment unpainted.
const segOff = css({ background: 'transparent', color: 'ws.khaki', _hover: { background: 'ws.glass', color: 'ws.jadeInk' } });
const segOn = css({ background: 'ws.card', color: 'ws.jadeInk', boxShadow: '0 2px 8px rgba(33,75,64,0.16)' });

export interface SegmentOption<T extends string> {
  readonly id: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: ReadonlyArray<SegmentOption<T>>;
  readonly value: T;
  readonly onChange: (id: T) => void;
  readonly ariaLabel: string;
  readonly className?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, className }: SegmentedControlProps<T>) {
  return (
    <div className={className ? cx(track, className) : track} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={cx(segBtn, value === option.id ? segOn : segOff)}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
