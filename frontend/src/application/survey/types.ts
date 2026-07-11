// Application-layer shapes for the /sondage surface (ADR-0056).

export type SurveyPos =
  | 'verbe_infinitif'
  | 'participe_passe'
  | 'participe_present'
  | 'nom_commun'
  | 'nom_propre'
  | 'adjectif'
  | 'adverbe'
  | 'interjection'
  | 'mot_outil'
  | 'sigle_abreviation'
  | 'polyvalent'
  | 'autre';

export type SurveyCategorie =
  | 'personne'
  | 'faune_flore'
  | 'geographie'
  | 'meteo'
  | 'objet'
  | 'nourriture'
  | 'corps'
  | 'culture'
  | 'histoire'
  | 'jeu'
  | 'sport'
  | 'religion'
  | 'societe'
  | 'science'
  | 'conceptuel'
  | 'langue'
  | 'action'
  | 'qualificatif'
  | 'autre';

export type SurveyStyle =
  | 'definition_directe'
  | 'periphrase'
  | 'metonymie'
  | 'fonction_role'
  | 'calembour'
  | 'culturel'
  | 'cryptique'
  | 'cryptique_morphologique'
  | 'technique';

export type SurveyTier = 'high' | 'mid' | 'low' | 'excluded';

export type SurveyFlagReason = 'hors_sujet' | 'auto_reference' | 'erreur_sens' | 'autre';

// Player-facing report taxonomy (ADR-0103), distinct from the annotator `SurveyFlagReason`.
export type ReportReason =
  | 'mot_offensant'
  | 'definition_offensante'
  | 'erreur_sens'
  | 'erreur_grammaire'
  | 'definition_revele'
  | 'ambigu'
  | 'trop_facile'
  | 'trop_difficile'
  | 'autre';

export type ReportSurface = 'solo' | 'daily' | 'multiplayer' | 'mini_game';

export interface SignalementInput {
  // Optional: sent only when the player has solved the word; an offensive clue is reportable without it (ADR-0103).
  readonly wordText?: string;
  readonly clueText: string;
  readonly reason: ReportReason;
  readonly note?: string;
  readonly puzzleId?: string;
  readonly surface: ReportSurface;
}

export interface SignalementResult {
  readonly reportId: string;
}

// A pending-report group in the maintainer queue; `reportId` is the latest report the decision acts on (ADR-0103).
export interface SignalementSummary {
  readonly reportId: string;
  readonly wordText: string | null;
  readonly clueText: string;
  readonly reason: ReportReason;
  readonly count: number;
  readonly latestNote: string | null;
  readonly latestAt: string;
}

export type SignalementDecision = 'dismiss' | 'action';

export type SubmittedAs = 'auth' | 'anon';

export type LikertScore = 1 | 2 | 3 | 4 | 5;

export interface SurveyItem {
  readonly itemId: string;
  readonly mot: string;
  readonly definition: string;
  readonly pos: SurveyPos;
  readonly categorie: SurveyCategorie;
  readonly style: SurveyStyle;
  readonly forceClaimed: number;
  readonly longueur: number;
  readonly tier: SurveyTier;
  readonly isCalibration: boolean;
}

export interface SurveyCorrectif {
  readonly text: string;
  readonly style: SurveyStyle;
  readonly pos?: SurveyPos;
}

export interface RatingSubmission {
  readonly qualite: LikertScore;
  readonly difficulte: LikertScore;
  readonly flag?: SurveyFlagReason;
  readonly correctif?: SurveyCorrectif;
  // ADR-0061 meta: all auth-only on the server; anon submissions carrying any meta field get 401.
  readonly targetCategories?: ReadonlyArray<SurveyCategorie>;
  readonly targetSense?: string;
  readonly isMultisense: boolean;
  readonly subTags?: ReadonlyArray<string>;
  readonly latencyMs: number;
}

export interface LemmaMeta {
  readonly priorSenses: ReadonlyArray<string>;
  readonly priorSubTags: ReadonlyArray<string>;
}

export interface RatingResult {
  readonly ratingId: string;
  readonly itemId: string;
  readonly submittedAs: SubmittedAs;
  readonly proposedItemId: string | null;
  readonly undoToken: string | null;
}

export interface PairRatingResult {
  readonly undoToken: string | null;
}

export interface SurveyProgress {
  readonly itemsRated: number;
  readonly calibrationAgreement: number | null;
  readonly lastRatedAt: string | null;
}

export type PairVerdict = 'LEFT_WINS' | 'RIGHT_WINS' | 'BOTH_GOOD' | 'BOTH_BAD' | 'SKIP';

export interface ItemPair {
  readonly mot: string;
  readonly left: SurveyItem;
  readonly right: SurveyItem;
}

export interface PairRatingSubmission {
  readonly leftItemId: string;
  readonly rightItemId: string;
  readonly verdict: PairVerdict;
  readonly difficulte: LikertScore;
  readonly latencyMs: number;
}

export interface SurveyContribution {
  readonly itemId: string;
  readonly mot: string;
  readonly definition: string;
  readonly pos: SurveyPos;
  readonly categorie: SurveyCategorie;
  readonly style: SurveyStyle;
  readonly optedOut: boolean;
  readonly kCoverage: number;
  readonly createdAt: string;
}

export interface SurveyPreferencesPatch {
  readonly deleteProposedOnErasure: boolean;
}

export interface Campaign {
  readonly campaignId: string;
  readonly batchLabel: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
}

// Application port. Concrete adapter: `infrastructure/api/survey/client.ts`.
export interface SurveyClient {
  getNextItem(opts?: { readonly excludedItemIds?: readonly string[] }): Promise<SurveyItem | null>;
  submitRating(itemId: string, body: RatingSubmission): Promise<RatingResult>;
  getNextPair(opts?: { readonly excludedItemIds?: readonly string[] }): Promise<ItemPair | null>;
  submitPairRating(body: PairRatingSubmission): Promise<PairRatingResult>;
  undoAction(token: string): Promise<void>;
  getProgress(): Promise<SurveyProgress>;
  getContributions(): Promise<ReadonlyArray<SurveyContribution>>;
  patchPreferences(body: SurveyPreferencesPatch): Promise<void>;
  getCurrentCampaign(): Promise<Campaign>;
  getLemmaMeta(mot: string): Promise<LemmaMeta>;
  submitSignalement(input: SignalementInput): Promise<SignalementResult>;
  listSignalements(): Promise<ReadonlyArray<SignalementSummary>>;
  decideSignalement(reportId: string, decision: SignalementDecision): Promise<void>;
}

// Port for anon-rated dedup. Concrete adapter: `localStorageSurveyAnon.ts`.
export interface SurveyAnonStore {
  list(): ReadonlyArray<string>;
  add(itemId: string): void;
  remove(itemId: string): void;
}
