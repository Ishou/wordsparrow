import { css } from 'styled-system/css';

export interface StatCardProps {
  readonly temps: string;
  readonly serie: string;
}

// Single frosted-glass pill holding both stats, split by a hairline (design source of truth).
const card = css({
  display: 'inline-flex',
  alignItems: 'center',
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(8px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '16px',
  padding: '13px 6px',
  boxShadow: '0 6px 18px rgba(33,75,64,0.08)',
});
const col = css({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', paddingInline: '18px' });
const sep = css({ width: '1px', height: '32px', bg: 'rgba(33,75,64,0.14)' });
const label = css({ fontFamily: 'wsUi', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'ws.khaki', opacity: 0.7 });
const value = css({ fontFamily: 'wsDisplay', fontSize: '26px', fontWeight: 'semibold', color: 'ws.jadeInk', lineHeight: '1', whiteSpace: 'nowrap' });

export function StatCard({ temps, serie }: StatCardProps) {
  return (
    <div className={card}>
      <div className={col}>
        <span className={label}>Temps</span>
        <span className={value}>{temps}</span>
      </div>
      <span aria-hidden="true" className={sep} />
      <div className={col}>
        <span className={label}>Série</span>
        <span className={value}>{serie}</span>
      </div>
    </div>
  );
}
