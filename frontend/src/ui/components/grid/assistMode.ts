// Single seam PlayScreen branches on; hardcoded until a lobby setting picks the mode per player (ADR-0099).
export type AssistMode = 'verify' | 'hint' | 'none';

export const ACTIVE_ASSIST_MODE: AssistMode = 'verify';
