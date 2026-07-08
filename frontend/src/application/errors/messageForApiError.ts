// TypeError (fetch transport failure) → network; anything else → generic.
export type ApiErrorCode = 'network' | 'generic';

export function apiErrorCode(cause: unknown): ApiErrorCode {
  return cause instanceof TypeError ? 'network' : 'generic';
}
