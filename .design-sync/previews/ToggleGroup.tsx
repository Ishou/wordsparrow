import { useState } from 'react';
import { ToggleGroup } from '@bliss/frontend';

const MODES = [
  { value: 'liste', label: 'Liste' },
  { value: 'calendrier', label: 'Calendrier' },
];

export const Default = () => {
  const [value, setValue] = useState('liste');
  return (
    <ToggleGroup
      label="Affichage des grilles"
      value={value}
      onValueChange={setValue}
      options={MODES}
    />
  );
};
