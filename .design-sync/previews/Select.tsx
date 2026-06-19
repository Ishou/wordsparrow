import { useState } from 'react';
import { Select } from '@bliss/frontend';

const DIFFICULTES = [
  { value: 'facile', label: 'Facile' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'difficile', label: 'Difficile' },
  { value: 'expert', label: 'Expert' },
];

export const Selected = () => {
  const [value, setValue] = useState<string | null>('moyen');
  return (
    <Select label="Difficulté" value={value} onValueChange={setValue} options={DIFFICULTES} />
  );
};

export const Placeholder = () => {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Select
      label="Difficulté"
      value={value}
      onValueChange={setValue}
      options={DIFFICULTES}
      placeholder="Choisir une difficulté"
    />
  );
};
