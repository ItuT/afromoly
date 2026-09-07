/**
 * Six-character game codes people read aloud over a phone.
 *
 * The alphabet drops O, 0, I and 1 so nobody joins the wrong table because of
 * a font. Codes are drawn from crypto randomness and checked for collisions by
 * the caller.
 */

import { randomInt, randomUUID } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function makeId(): string {
  return randomUUID();
}

export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
}
