import { OverflowMenu } from '@bliss/frontend';

const noop = () => {};

export const Default = () => (
  <OverflowMenu
    triggerLabel="Options de la partie"
    items={[
      { id: 'share', label: 'Partager la grille', onSelect: noop },
      { id: 'restart', label: 'Recommencer', onSelect: noop },
      { id: 'quit', label: 'Quitter la partie', onSelect: noop, disabled: true },
    ]}
  />
);
