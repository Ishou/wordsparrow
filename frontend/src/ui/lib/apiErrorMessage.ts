import { apiErrorCode } from '@/application/errors';
import { t } from '@/ui/i18n';

export function messageForApiError(cause: unknown): string {
  return t(`error.api.${apiErrorCode(cause)}`);
}
