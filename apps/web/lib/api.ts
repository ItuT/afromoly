import { API_URL } from './config';

export interface Seat {
  gameId: string;
  code: string;
  playerId: string;
  name: string;
}

async function post(path: string, body: unknown): Promise<Seat> {
  const response = await fetch(`${API_URL}${path}`, {
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
  return payload as Seat;
}

export const hostTable = (name: string, jackpot: boolean): Promise<Seat> =>
  post('/games', { name, jackpot });

export const joinTable = (code: string, name: string): Promise<Seat> =>
  post('/games/join', { code, name });
