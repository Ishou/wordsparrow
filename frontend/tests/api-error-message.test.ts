import { describe, expect, it } from 'vitest';
import { messageForApiError } from '@/ui/lib/apiErrorMessage';

describe('messageForApiError (ui edge)', () => {
  it('maps a fetch TypeError to the French network message', () => {
    expect(messageForApiError(new TypeError('Failed to fetch'))).toBe(
      'Connexion impossible. Vérifie ton réseau et réessaie.',
    );
  });

  it('maps any other throwable to the generic French message', () => {
    expect(messageForApiError(new Error('Internal Server Error'))).toBe(
      'Une erreur est survenue. Réessaie.',
    );
    expect(messageForApiError('a string')).toBe('Une erreur est survenue. Réessaie.');
  });
});
