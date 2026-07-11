// Port-level typed error so the UI can branch on the 429 without importing the adapter (ADR-0103).
export class ReportRateLimitedError extends Error {
  constructor() {
    super('report rate limited');
    this.name = 'ReportRateLimitedError';
  }
}
