import { apiError } from '@/server/api';

/** Unknown /api/v0 paths answer JSON `{code, message}` (never the HTML 404 page). */
export const runtime = 'nodejs';

const notFound = () => apiError(404, 'not_found', 'No such /api/v0 endpoint.');

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
