import { describe, expect, it } from 'vitest';
import { apiErrorCode } from './messageForApiError';

describe('apiErrorCode', () => {
  it('maps fetch TypeError to the network code', () => {
    // Browser produces these literal strings on CORS rejection / offline.
    expect(apiErrorCode(new TypeError('Failed to fetch'))).toBe('network');
    expect(
      apiErrorCode(new TypeError('NetworkError when attempting to fetch resource.')),
    ).toBe('network');
  });

  it('maps any other Error to the generic code', () => {
    expect(apiErrorCode(new Error('whatever'))).toBe('generic');
    expect(apiErrorCode(new Error('Internal Server Error'))).toBe('generic');
  });

  it('maps non-Error throwables to the generic code', () => {
    expect(apiErrorCode('a string')).toBe('generic');
    expect(apiErrorCode(undefined)).toBe('generic');
    expect(apiErrorCode(null)).toBe('generic');
    expect(apiErrorCode({ random: 'object' })).toBe('generic');
  });
});
