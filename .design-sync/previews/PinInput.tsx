import { useState } from 'react';
import { PinInput } from '@bliss/frontend';

export const Filled = () => {
  const [value, setValue] = useState('1234');
  return <PinInput label="Code de la partie" value={value} onValueChange={setValue} />;
};

export const Empty = () => {
  const [value, setValue] = useState('');
  return (
    <PinInput label="Code de la partie" value={value} onValueChange={setValue} placeholder="_" />
  );
};

export const Invalid = () => {
  const [value, setValue] = useState('99');
  return (
    <PinInput
      label="Code de la partie"
      value={value}
      onValueChange={setValue}
      invalid
      errorText="Code introuvable."
    />
  );
};
