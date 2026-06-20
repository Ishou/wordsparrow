import { css } from 'styled-system/css';

export type StatKind = 'temps' | 'serie';

export interface StatCardProps {
  readonly kind: StatKind;
  readonly value: string;
}

const LABEL: Record<StatKind, string> = { temps: 'TEMPS', serie: 'SÉRIE' };

const card = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'xs',
  bg: 'white',
  borderRadius: 'md',
  paddingInline: 'lg',
  paddingBlock: 'sm',
  minWidth: '120px',
});
const label = css({ fontSize: 'xs', fontWeight: 'bold', letterSpacing: '0.08em', color: 'ws.khaki' });
const value = css({ fontSize: 'xl', fontWeight: 'bold', color: 'ws.jadeInk' });

export function StatCard({ kind, value: v }: StatCardProps) {
  return (
    <div className={card}>
      <span className={label}>{LABEL[kind]}</span>
      <span className={value}>{v}</span>
    </div>
  );
}
