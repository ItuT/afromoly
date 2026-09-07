export interface Seat {
  gameId: string;
  code: string;
  playerId: string;
  name: string;
  /** Carried through so the socket knows where to connect. */
  wsUrl: string;
}

async function post(apiUrl: string, path: string, body: unknown): Promise<Omit<Seat, 'wsUrl'>> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : 'The rank is not answering. Try again.';
    throw new Error(message);
  }
  return payload as Omit<Seat, 'wsUrl'>;
}

export async function hostTable(
  config: { apiUrl: string; wsUrl: string },
  name: string,
  jackpot: boolean,
): Promise<Seat> {
  const seat = await post(config.apiUrl, '/games', { name, jackpot });
  return { ...seat, wsUrl: config.wsUrl };
}

export async function joinTable(
  config: { apiUrl: string; wsUrl: string },
  code: string,
  name: string,
): Promise<Seat> {
  const seat = await post(config.apiUrl, '/games/join', { code, name });
  return { ...seat, wsUrl: config.wsUrl };
}
