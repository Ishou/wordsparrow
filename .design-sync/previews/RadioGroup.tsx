import { useState } from 'react';
import { RadioGroup } from '@bliss/frontend';

const OPTIONS = [
  { value: 'quotidienne', label: 'Quotidienne' },
  { value: 'hebdo', label: 'Hebdomadaire' },
  { value: 'jamais', label: 'Jamais' },
];

export const Default = () => {
  const [value, setValue] = useState('quotidienne');
  return (
    <RadioGroup
      label="Fréquence des notifications"
      value={value}
      onValueChange={setValue}
      options={OPTIONS}
    />
  );
};
