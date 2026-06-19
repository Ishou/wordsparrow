import { Dialog, DialogDescription, Button } from '@bliss/frontend';

const noop = () => {};

export const Confirmation = () => (
  <Dialog open onClose={noop} title="Partie terminée">
    <DialogDescription>
      Bravo&nbsp;! Vous avez complété la grille du jour en 4&nbsp;min 12&nbsp;s.
    </DialogDescription>
    <Button variant="primary" onClick={noop}>
      Rejouer
    </Button>
    <Button variant="secondary" onClick={noop}>
      Fermer
    </Button>
  </Dialog>
);
