import type { CSSProperties, ReactElement } from 'react';
import { cloneElement, useId, useState } from 'react';
import { Tooltip } from '@ark-ui/react/tooltip';
import { Popover } from '@ark-ui/react/popover';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { useTouchPrimary } from '@/ui/components/keyboard/useTouchPrimary';
import { useLongPress } from './useLongPress';

const srOnly = css({ srOnly: true });

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

// A touch-hold over the label would otherwise start native text selection / the iOS callout.
const noSelectStyle: CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

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
  const descId = useId();
  const contentId = useId();
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

  const childStyle = (children.props as { style?: CSSProperties }).style;

  // Popover.Content stays mounted (hidden, not unmounted) per contentStyles' &[hidden] rule, so this
  // id resolves even before the first long-press opens it.
  const touchDescribedBy = touch && !disabled ? contentId : undefined;

  // aria-disabled (not native disabled) keeps the button focusable so the reason stays reachable.
  // eslint-disable-next-line @eslint-react/no-clone-element -- inject handlers/aria/style onto the caller's trigger
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    onClick: handleClick,
    'aria-disabled': disabled || undefined,
    'aria-describedby': disabled ? descId : touchDescribedBy,
    ...(touch
      ? { ...longPress.handlers, style: { ...childStyle, ...noSelectStyle } }
      : {}),
  });

  // Ark associates the tooltip only while open; expose the disabled reason persistently for touch/AT.
  const reason = disabled ? (
    <span id={descId} className={srOnly}>
      {info}
    </span>
  ) : null;

  // Touch: a persistent Popover (long-press opens, outside-tap/Esc dismiss); Ark Tooltip closes on release.
  if (touch) {
    return (
      <Popover.Root
        open={open}
        onOpenChange={(details) => setOpen(details.open)}
        modal={false}
        autoFocus={false}
        positioning={{ placement: 'top' }}
      >
        <Popover.Anchor asChild>{trigger}</Popover.Anchor>
        {reason}
        <Portal>
          <Popover.Positioner>
            <Popover.Content id={contentId} className={contentStyles}>
              <Popover.Arrow className={arrowStyles}>
                <Popover.ArrowTip />
              </Popover.Arrow>
              {info}
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    );
  }

  return (
    <Tooltip.Root openDelay={400} closeDelay={100}>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      {reason}
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
