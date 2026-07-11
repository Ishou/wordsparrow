// Port-level typed error so the UI can branch on the 429 without importing the adapter (ADR-0103).
export class ReportRateLimitedError extends Error {
  constructor() {
    super('report rate limited');
    this.name = 'ReportRateLimitedError';
  }
}

// 403 from the maintainer triage surface — the server gate is the real enforcement (ADR-0079).
export class ContribuerForbiddenError extends Error {
  constructor() {
    super('contribuer forbidden');
    this.name = 'ContribuerForbiddenError';
  }
}
