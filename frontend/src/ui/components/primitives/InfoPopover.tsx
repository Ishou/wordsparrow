import type { ReactElement } from 'react';
import { cloneElement, useState } from 'react';
import { Tooltip } from '@ark-ui/react/tooltip';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { useTouchPrimary } from '@/ui/components/keyboard/useTouchPrimary';
import { useLongPress } from './useLongPress';

const contentStyles = css({
  maxWidth: '260px',
  bg: 'neutral.900',
  color: 'neutral.50',
  borderRadius: 'md',
  padding: 'md',
  fontSize: 'sm',
  lineHeight: 1.5,
  boxShadow: 'floating',
  zIndex: 60,
  '&[hidden]': { display: 'none' },
});

const arrowStyles = css({
  '--arrow-size': '8px',
  '--arrow-background': 'token(colors.neutral.900)',
});

export interface InfoPopoverProps {
  readonly info: string;
  readonly onActivate: () => void;
  readonly children: ReactElement;
  readonly disabled?: boolean;
  readonly longPressMs?: number;
}

export function InfoPopover({
  info,
  onActivate,
  children,
  disabled = false,
  longPressMs = 500,
}: InfoPopoverProps) {
  const touch = useTouchPrimary();
  const [open, setOpen] = useState(false);
  const longPress = useLongPress({
    onLongPress: () => setOpen(true),
    enabled: touch,
    delayMs: longPressMs,
  });

  const handleClick = () => {
    const longPressJustFired = longPress.consumeSuppression();
    if (disabled || longPressJustFired) return;
    onActivate();
  };

  // aria-disabled (not native disabled) keeps the button hoverable so the popover stays reachable.
  // eslint-disable-next-line @eslint-react/no-clone-element -- inject handlers/aria-disabled onto the caller's trigger
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    onClick: handleClick,
    'aria-disabled': disabled || undefined,
    ...(touch ? longPress.handlers : {}),
  });

  // Touch: open only from long-press; honor Ark's close but ignore its opens so a tap runs the action.
  const rootProps = touch
    ? {
        open,
        onOpenChange: (details: { open: boolean }) => {
          if (!details.open) setOpen(false);
        },
      }
    : { openDelay: 400, closeDelay: 100 };

  return (
    <Tooltip.Root {...rootProps}>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={contentStyles}>
            <Tooltip.Arrow className={arrowStyles}>
              <Tooltip.ArrowTip />
            </Tooltip.Arrow>
            {info}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
