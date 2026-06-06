// Grid value-cell toggling a read-only trigger button ⇄ inline editor; centralizes focus return + Escape/Enter/blur.

import { useEffect, useRef, type ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

const triggerStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '100%',
  textAlign: 'start',
  background: 'none',
  border: '1px solid transparent',
  borderRadius: 'sm',
  paddingInline: '6px',
  paddingBlock: '3px',
  marginInline: '-6px',
  fontFamily: 'body',
  fontSize: 'sm',
  color: 'fg',
  cursor: 'pointer',
  minHeight: '28px',
  transition: 'background-color 120ms ease-out, border-color 120ms ease-out',
  _hover: { bg: 'surface', borderColor: 'metaSuggestedLine' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '1px',
  },
  '& .row-pencil': { opacity: 0, transition: 'opacity 120ms ease-out' },
  '&:hover .row-pencil, &:focus-visible .row-pencil': { opacity: 0.7 },
  '@media (hover: none)': { '& .row-pencil': { opacity: 0.5 } },
});

const emptyTriggerStyles = css({
  borderStyle: 'dashed',
  borderColor: 'metaSuggestedLine',
  borderRadius: '999px',
  bg: 'surface',
  color: 'metaSuggestedText',
  fontWeight: 'semibold',
});

const pencilStyles = css({ fontSize: 'xs', flexShrink: 0 });

const editorCellStyles = css({ display: 'block', minWidth: 0 });

export interface InlineEditableRowProps {
  readonly label: string;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
  readonly triggerAriaLabel: string;
  readonly empty?: boolean;
  readonly testId?: string;
  readonly renderDisplay: () => ReactNode;
  readonly renderEditor: () => ReactNode;
}

export function InlineEditableRow({
  label,
  isOpen,
  onOpen,
  onCommit,
  onCancel,
  triggerAriaLabel,
  empty = false,
  testId,
  renderDisplay,
  renderEditor,
}: InlineEditableRowProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !isOpen) triggerRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  if (isOpen) {
    return (
      <div
        className={editorCellStyles}
        data-editor-region={label}
        onKeyDown={(e) => {
          if (e.defaultPrevented) return;
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter') {
            onCommit();
          }
        }}
        // Focus-out commits; relies on onCommit being idempotent (Enter may also have committed).
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit();
        }}
      >
        {renderEditor()}
      </div>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      className={empty ? cx(triggerStyles, emptyTriggerStyles) : triggerStyles}
      data-testid={testId}
      aria-label={triggerAriaLabel}
      onClick={onOpen}
    >
      {renderDisplay()}
      <span className={cx('row-pencil', pencilStyles)} aria-hidden="true">✎</span>
    </button>
  );
}
