'use client';
/** Every data source with its kind, licence, credit, use and latest data (GET /sources). */
import { useQuery } from '@tanstack/react-query';

import type { SourcesInfo } from '../types';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';

export function useSources(initial?: SourcesInfo | null) {
  return useQuery<SourcesInfo>({
    queryKey: ['atmos', 'server', 'sources'],
    retry: shouldRetry,
    staleTime: 30 * 60_000,
    initialData: initial ?? undefined,
    queryFn: ({ signal }) => getJSON<SourcesInfo>(`${API}/sources`, undefined, signal),
  });
}
