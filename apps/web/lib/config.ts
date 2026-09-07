/**
 * Where the game server lives.
 *
 * Both values are inlined at build time, because the client is a static export.
 * With neither set, the app still runs, offering hot-seat play only.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? '';
export const ONLINE_ENABLED = API_URL !== '' && WS_URL !== '';
