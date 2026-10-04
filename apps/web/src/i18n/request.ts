import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { getMessageFallback, onIntlError, TIME_ZONE } from './fallback';
import { loadMessages } from './messages';
import { routing } from './routing';

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const requested = locale ?? (await requestLocale);
  const resolved = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale: resolved,
    messages: await loadMessages(resolved),
    timeZone: TIME_ZONE,
    onError: onIntlError,
    getMessageFallback,
  };
});
