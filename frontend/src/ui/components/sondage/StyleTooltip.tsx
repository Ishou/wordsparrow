import { Tooltip } from '@ark-ui/react/tooltip';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { styleLabel } from './labels';
import { STYLE_COPY } from './styleCopy';

const wrapStyles = css({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '4px',
  fontSize: 'sm',
  color: 'fgMuted',
});

const triggerStyles = css({
  font: 'inherit',
  color: 'fg',
  fontWeight: 'semibold',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'help',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: '3px',
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: 'sm',
  },
});

const contentStyles = css({
  maxWidth: '320px',
  bg: 'neutral.900',
  color: 'neutral.50',
  borderRadius: 'md',
  padding: 'md',
  fontSize: 'sm',
  lineHeight: 1.5,
  boxShadow: 'floating',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  '&[hidden]': { display: 'none' },
});

const headerStyles = css({ fontWeight: 'bold', color: 'neutral.50' });

const exampleLabelStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'secondary.300',
});

const exampleStyles = css({
  fontStyle: 'italic',
  color: 'neutral.50',
});

const arrowStyles = css({
  '--arrow-size': '8px',
  '--arrow-background': 'token(colors.neutral.900)',
});

export interface StyleTooltipProps {
  readonly style: string;
  readonly definition: string;
  readonly mot: string;
}

export function StyleTooltip({ style, definition, mot }: StyleTooltipProps) {
  const label = styleLabel(style);
  const copy = STYLE_COPY[style];
  if (!copy) {
    return (
      <span className={wrapStyles}>
        Style : <span className={css({ color: 'fg', fontWeight: 'semibold' })}>{label}</span>
      </span>
    );
  }
  return (
    <Tooltip.Root openDelay={150} closeDelay={100}>
      <span className={wrapStyles}>
        Style :{' '}
        <Tooltip.Trigger
          className={triggerStyles}
          aria-label={`En savoir plus sur le style ${label}`}
        >
          {label}
        </Tooltip.Trigger>
      </span>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={contentStyles}>
            <Tooltip.Arrow className={arrowStyles}>
              <Tooltip.ArrowTip />
            </Tooltip.Arrow>
            <span className={headerStyles}>Style : {label}</span>
            <span>{copy.definition}</span>
            <span className={exampleLabelStyles}>Exemple</span>
            <span className={exampleStyles}>« {definition} » → {mot}</span>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
