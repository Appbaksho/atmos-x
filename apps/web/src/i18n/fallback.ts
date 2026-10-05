/**
 * Shared next-intl error handling for server (request.ts) and client (IntlProvider):
 * missing messages never throw; they render the last key segment (English is already merged in,
 * so this only happens for keys that are missing in English too).
 */
import { IntlErrorCode, type IntlError } from 'next-intl';

export function onIntlError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] ${error.message}`);
    return;
  }
  if (process.env.NODE_ENV !== 'production') console.error(error);
}

export function getMessageFallback({ namespace, key }: { namespace?: string; key: string; error: IntlError }): string {
  const path = [namespace, key].filter(Boolean).join('.');
  const last = path.split('.').pop() ?? path;
  return last.replace(/[_-]+/g, ' ');
}

/** Time zone used for next-intl date formatting (format.ts uses the device zone). */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Asia/Dhaka';
