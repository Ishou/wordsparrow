import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineEditableRow } from '@/ui/components/sondage';

function Harness(props: {
  readonly onCommit?: () => void;
  readonly onCancel?: () => void;
  readonly empty?: boolean;
  readonly editorHandlesEnter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <InlineEditableRow
      label="Sens"
      isOpen={open}
      onOpen={() => setOpen(true)}
      onCommit={() => { props.onCommit?.(); setOpen(false); }}
      onCancel={() => { props.onCancel?.(); setOpen(false); }}
      triggerAriaLabel="Modifier le sens"
      empty={props.empty}
      testId="row-trigger"
      renderDisplay={() => <span>valeur</span>}
      renderEditor={() => (
        <input
          aria-label="éditeur du sens"
          defaultValue="x"
          onKeyDown={props.editorHandlesEnter ? (e) => { if (e.key === 'Enter') e.preventDefault(); } : undefined}
        />
      )}
    />
  );
}

describe('InlineEditableRow', () => {
  it('shows a read-only trigger at rest and swaps to the editor on click', async () => {
    render(<Harness />);
    const trigger = screen.getByTestId('row-trigger');
    expect(trigger).toHaveAttribute('aria-label', 'Modifier le sens');
    expect(screen.queryByLabelText('éditeur du sens')).toBeNull();
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.getByLabelText('éditeur du sens')).toBeInTheDocument();
    expect(screen.queryByTestId('row-trigger')).toBeNull();
  });

  it('Escape inside the editor cancels and returns focus to the trigger', async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    await act(async () => { fireEvent.click(screen.getByTestId('row-trigger')); });
    const editor = screen.getByLabelText('éditeur du sens');
    await act(async () => { fireEvent.keyDown(editor, { key: 'Escape' }); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('row-trigger')).toHaveFocus();
  });

  it('Enter inside the editor (unhandled) commits', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await act(async () => { fireEvent.click(screen.getByTestId('row-trigger')); });
    const editor = screen.getByLabelText('éditeur du sens');
    await act(async () => { fireEvent.keyDown(editor, { key: 'Enter' }); });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('renders the empty trigger styling when empty', () => {
    render(<Harness empty />);
    expect(screen.getByTestId('row-trigger')).toBeInTheDocument();
  });

  it('commits when focus leaves the editor region (blur to body)', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await act(async () => { fireEvent.click(screen.getByTestId('row-trigger')); });
    const editor = screen.getByLabelText('éditeur du sens');
    await act(async () => { fireEvent.blur(editor, { relatedTarget: null }); });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not commit on Enter the editor already handled (preventDefault)', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} editorHandlesEnter />);
    await act(async () => { fireEvent.click(screen.getByTestId('row-trigger')); });
    const editor = screen.getByLabelText('éditeur du sens');
    await act(async () => { fireEvent.keyDown(editor, { key: 'Enter' }); });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
