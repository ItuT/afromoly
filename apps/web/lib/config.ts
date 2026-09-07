/**
 * Where the game server lives.
 *
 * The client is a static export, so it cannot be told its own API address at
 * build time without rebuilding per environment. Instead it fetches
 * /config.json, which the deployment writes alongside the site. Build-time
 * environment variables still win when they are set, which is what local
 * development uses.
 */

export interface RuntimeConfig {
  apiUrl: string;
  wsUrl: string;
}

const fromEnv: RuntimeConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? '',
};

const EMPTY: RuntimeConfig = { apiUrl: '', wsUrl: '' };

let cached: RuntimeConfig | null = null;
let inFlight: Promise<RuntimeConfig> | null = null;

export const isOnline = (config: RuntimeConfig): boolean =>
  config.apiUrl !== '' && config.wsUrl !== '';

/** Whatever we know right now, without waiting for the network. */
export function configNow(): RuntimeConfig {
  return cached ?? (isOnline(fromEnv) ? fromEnv : EMPTY);
}

export function loadConfig(): Promise<RuntimeConfig> {
  if (cached) return Promise.resolve(cached);
  if (isOnline(fromEnv)) {
    cached = fromEnv;
    return Promise.resolve(cached);
  }
  inFlight ??= fetch('/config.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => {
      const record = (body ?? {}) as Partial<RuntimeConfig>;
      cached = {
        apiUrl: typeof record.apiUrl === 'string' ? record.apiUrl : '',
        wsUrl: typeof record.wsUrl === 'string' ? record.wsUrl : '',
      };
      return cached;
    })
    .catch(() => {
      // No config file is a normal state: the app still offers hot-seat play.
      cached = EMPTY;
      return cached;
    });
  return inFlight;
}
