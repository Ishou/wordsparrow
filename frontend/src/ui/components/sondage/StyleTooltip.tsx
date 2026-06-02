import { Tooltip } from '@ark-ui/react/tooltip';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { styleLabel } from './labels';
import { STYLE_COPY } from './styleCopy';

const wrapStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: 'sm',
  color: 'fgMuted',
});

const labelTextStyles = css({ color: 'fg', fontWeight: 'semibold' });

const triggerStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  border: '1px solid token(colors.border)',
  bg: 'surfaceElevated',
  color: 'fgMuted',
  fontSize: 'xs',
  fontWeight: 'bold',
  cursor: 'help',
  lineHeight: 1,
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const contentStyles = css({
  maxWidth: '280px',
  bg: 'neutral.900',
  color: 'neutral.50',
  borderRadius: 'md',
  padding: 'sm',
  fontSize: 'sm',
  lineHeight: 1.4,
  boxShadow: 'floating',
  zIndex: 60,
  '&[hidden]': { display: 'none' },
});

const exampleStyles = css({
  display: 'block',
  marginTop: 'xs',
  fontFamily: 'mono',
  fontSize: 'xs',
  color: 'secondary.300',
});

const arrowStyles = css({
  '--arrow-size': '8px',
  '--arrow-background': 'token(colors.neutral.900)',
});

export interface StyleTooltipProps {
  readonly style: string;
}

export function StyleTooltip({ style }: StyleTooltipProps) {
  const label = styleLabel(style);
  const copy = STYLE_COPY[style];
  return (
    <span className={wrapStyles}>
      <span>
        Style : <span className={labelTextStyles}>{label}</span>
      </span>
      {copy ? (
        <Tooltip.Root openDelay={150} closeDelay={100}>
          <Tooltip.Trigger
            className={triggerStyles}
            aria-label={`En savoir plus sur le style ${label}`}
          >
            ?
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content className={contentStyles}>
                <Tooltip.Arrow className={arrowStyles}>
                  <Tooltip.ArrowTip />
                </Tooltip.Arrow>
                <span>{copy.definition}</span>
                <span className={exampleStyles}>Exemple : {copy.example}</span>
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      ) : null}
    </span>
  );
}
