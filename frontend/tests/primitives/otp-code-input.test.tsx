import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OtpCodeInput } from '@/ui/components/primitives/OtpCodeInput';

// Sibling of `PinInput` for the email-OTP login flow (ADR-0091): six
// numeric slots, no Crockford alphabet, no URL-paste extraction. Ark UI
// `pin-input` with `type="numeric"` drives the keyboard + a11y.

function ControlledOtp({
  initial = '',
  onValueChange,
  invalid = false,
  errorText,
  readOnly = false,
  disabled = false,
}: {
  readonly initial?: string;
  readonly onValueChange?: (next: string) => void;
  readonly invalid?: boolean;
  readonly errorText?: string;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <OtpCodeInput
      label="Code de connexion"
      value={value}
      invalid={invalid}
      errorText={errorText}
      readOnly={readOnly}
      disabled={disabled}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('OtpCodeInput', () => {
  it('renders six numeric-inputmode slots wired to the supplied label', () => {
    const { container } = render(<ControlledOtp />);
    const slots = container.querySelectorAll<HTMLInputElement>('input[data-part="input"]');
    expect(slots.length).toBe(6);
    for (const slot of slots) {
      expect(slot.getAttribute('inputmode')).toBe('numeric');
      expect(slot.getAttribute('aria-label')).toMatch(/code de connexion/i);
    }
  });

  it('fires onValueChange with the concatenated digits as they are typed', async () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledOtp onValueChange={onValueChange} />);
    const slots = container.querySelectorAll<HTMLInputElement>('input[data-part="input"]');
    for (const [index, digit] of [...'123456'].entries()) {
      // The machine only processes a change on the focused slot; async
      // `act` lets zag's effects flush between keystrokes.
      await act(async () => {
        slots[index]!.focus();
        fireEvent.change(slots[index]!, { target: { value: digit } });
      });
    }
    expect(onValueChange).toHaveBeenLastCalledWith('123456');
  });

  it('renders the error text with role="alert" when invalid', () => {
    render(<ControlledOtp invalid errorText="Code incorrect" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Code incorrect');
  });

  it('does not render the error text when not invalid', () => {
    render(<ControlledOtp errorText="Code incorrect" />);
    expect(screen.queryByText('Code incorrect')).not.toBeInTheDocument();
  });

  it('defaults the empty-slot placeholder to an underscore', () => {
    const { container } = render(<ControlledOtp />);
    const slots = container.querySelectorAll<HTMLInputElement>('input[data-part="input"]');
    expect(slots.length).toBe(6);
    for (const slot of slots) {
      expect(slot.getAttribute('placeholder')).toBe('_');
    }
  });

  it('renders readOnly slots when readOnly', () => {
    render(<ControlledOtp initial="123456" readOnly />);
    const slots = screen
      .getAllByLabelText(/code de connexion/i)
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    for (const slot of slots) {
      expect(slot.getAttribute('readonly')).not.toBeNull();
    }
  });
});
