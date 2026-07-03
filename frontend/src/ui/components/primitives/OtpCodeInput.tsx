import { PinInput as ArkPinInput } from '@ark-ui/react/pin-input';
import { forwardRef } from 'react';
import { css } from 'styled-system/css';

// Sibling of PinInput (ADR-0091): numeric slots, no Crockford alphabet/paste extraction.

const OTP_CODE_LENGTH = 6;

const rootStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'xs',
  flex: 1,
  minWidth: 0,
  maxWidth: '20em',
});

// Visually-hidden label — Ark's Label part still names the group for assistive tech.
const labelStyles = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

const controlStyles = css({
  display: 'flex',
  gap: 'xs',
  width: '100%',
});

const slotStyles = css({
  flex: 1,
  minWidth: 0,
  aspectRatio: '1',
  textAlign: 'center',
  paddingBlock: '0',
  paddingInline: '0',
  borderRadius: 'sm',
  border: '1px solid token(colors.border)',
  bg: 'surface',
  color: 'fg',
  fontFamily: 'body',
  fontSize: 'md',
  fontWeight: 'bold',
  fontVariantNumeric: 'tabular-nums',
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
  _disabled: { opacity: 0.6, cursor: 'not-allowed' },
  _placeholder: { color: 'fgMuted' },
});

const errorStyles = css({
  fontSize: 'sm',
  color: 'errorText',
  margin: 0,
});

export interface OtpCodeInputProps {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly errorText?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
}

export const OtpCodeInput = forwardRef<HTMLDivElement, OtpCodeInputProps>(function OtpCodeInput(
  { label, value, onValueChange, disabled, invalid, errorText, placeholder = '_', readOnly },
  ref,
) {
  // Ark's `value` is a `string[]`; pad the controlled string to match.
  const slots = Array.from({ length: OTP_CODE_LENGTH }, (_, i) => value[i] ?? '');

  return (
    <ArkPinInput.Root
      ref={ref}
      value={slots}
      type="numeric"
      disabled={disabled}
      invalid={invalid}
      readOnly={readOnly}
      placeholder={placeholder}
      onValueChange={(detail) => onValueChange(detail.valueAsString)}
      className={rootStyles}
    >
      <ArkPinInput.Label className={labelStyles}>{label}</ArkPinInput.Label>
      <ArkPinInput.Control className={controlStyles}>
        {Array.from({ length: OTP_CODE_LENGTH }, (_, index) => (
          <ArkPinInput.Input
            key={index}
            index={index}
            aria-label={label}
            className={slotStyles}
          />
        ))}
      </ArkPinInput.Control>
      {invalid && errorText != null ? (
        <p className={errorStyles} role="alert">{errorText}</p>
      ) : null}
      <ArkPinInput.HiddenInput />
    </ArkPinInput.Root>
  );
});
