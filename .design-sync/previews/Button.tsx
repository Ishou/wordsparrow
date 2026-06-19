import { Button } from '@bliss/frontend';

export const Primary = () => <Button variant="primary">Jouer la grille</Button>;

export const Secondary = () => <Button variant="secondary">Fermer</Button>;

export const Ghost = () => <Button variant="ghost">Modifier le pseudo</Button>;

export const Disabled = () => (
  <Button variant="primary" disabled>
    Valider
  </Button>
);
