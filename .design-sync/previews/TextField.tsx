import { TextField } from '@bliss/frontend';

export const Default = () => <TextField label="Pseudonyme" placeholder="ex. mésange42" />;

export const Filled = () => (
  <TextField label="Adresse e-mail" type="email" defaultValue="claire@exemple.fr" />
);

export const Invalid = () => (
  <TextField
    label="Adresse e-mail"
    type="email"
    defaultValue="claire@"
    invalid
    errorText="Adresse e-mail invalide."
  />
);

export const Disabled = () => (
  <TextField label="Identifiant" defaultValue="joueur-001" disabled />
);

export const Password = () => (
  <TextField label="Mot de passe" type="password" defaultValue="motdepasse" />
);
