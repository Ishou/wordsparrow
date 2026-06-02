// Per-style tooltip copy for the rating card. Source: docs/clue-style-guide-v2.md §4.
// Unknown styles fall back to the label alone (no tooltip body).

export interface StyleCopy {
  readonly definition: string;
  readonly example: string;
}

export const STYLE_COPY: Record<string, StyleCopy> = {
  definition_directe: {
    definition:
      'Sens premier du mot : synonyme, paraphrase courte ou étiquette grammaticale. Aucun détour.',
    example: 'RAT → « Rongeur »',
  },
  periphrase: {
    definition:
      'Désigne le mot par une caractéristique ou un attribut emblématique, sans synonyme direct.',
    example: 'COQ → « Mâle de la basse-cour »',
  },
  metonymie: {
    definition:
      'Pointe le mot par contiguïté : contenant pour contenu, lieu pour activité, partie pour tout.',
    example: 'NO → « Côté breton »',
  },
  fonction_role: {
    definition:
      'Désigne le mot par son usage ou l’action qu’il accomplit — typiquement un verbe d’action.',
    example: 'COU → « Porte la tête »',
  },
  calembour: {
    definition:
      'Jeu de mots à double sens signalé par un « ? » final, qui met le solveur en alerte.',
    example: 'VENT → « Met les voiles ? »',
  },
  culturel: {
    definition:
      'Référence à une œuvre, un personnage, un lieu ou un fait reconnaissable. Le solveur identifie la référence.',
    example: 'NOÉ → « Rescapé du déluge »',
  },
  cryptique: {
    definition:
      'Définition indirecte : double sens implicite, sans « ? ». Le solveur décode une astuce plutôt qu’une définition littérale.',
    example: 'AVOCAT → « Robe noire ou peau verte »',
  },
  cryptique_morphologique: {
    definition:
      'Opération sur la graphie d’un autre mot : lettre ôtée, accent supprimé, palindrome, troncature.',
    example: 'LOU → « Loup sans p »',
  },
  technique: {
    definition:
      'Renvoie à un domaine spécialisé (sciences, sport, musique, informatique…) via un marqueur de domaine ou un terme catégoriel.',
    example: 'HZ → « Unité de fréquence »',
  },
};
