// Unknown styles fall back to the label alone (no tooltip body).

export interface StyleCopy {
  readonly definition: string;
}

export const STYLE_COPY: Record<string, StyleCopy> = {
  definition_directe: {
    definition:
      'Sens premier du mot : synonyme, paraphrase courte ou étiquette grammaticale. Aucun détour.',
  },
  periphrase: {
    definition:
      'Désigne le mot par une caractéristique ou un attribut emblématique, sans synonyme direct.',
  },
  metonymie: {
    definition:
      'Pointe le mot par contiguïté : contenant pour contenu, lieu pour activité, partie pour tout.',
  },
  fonction_role: {
    definition:
      'Désigne le mot par son usage ou l’action qu’il accomplit — typiquement un verbe d’action.',
  },
  calembour: {
    definition:
      'Jeu de mots à double sens signalé par un « ? » final, qui met le solveur en alerte.',
  },
  culturel: {
    definition:
      'Référence à une œuvre, un personnage, un lieu ou un fait reconnaissable. Le solveur identifie la référence.',
  },
  cryptique: {
    definition:
      'Définition indirecte : jeu de mots, double sens ou périphrase. Le solveur doit décoder une astuce plutôt que lire une définition littérale.',
  },
  cryptique_morphologique: {
    definition:
      'Opération sur la graphie d’un autre mot : lettre ôtée, accent supprimé, palindrome, troncature.',
  },
  technique: {
    definition:
      'Renvoie à un domaine spécialisé (sciences, sport, musique, informatique…) via un marqueur de domaine ou un terme catégoriel.',
  },
};
