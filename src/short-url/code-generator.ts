import { randomBytes } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ALPHABET_LENGTH = ALPHABET.length; // 62
// Reject bytes >= 248 (the largest multiple of 62 that fits in a byte) so
// every alphabet character has exactly equal probability - a naive
// `byte % 62` would otherwise bias toward the first 8 characters.
const MAX_UNBIASED_BYTE = Math.floor(256 / ALPHABET_LENGTH) * ALPHABET_LENGTH;

export const DEFAULT_SHORT_CODE_LENGTH = 6;

export function generateBase62Code(length: number = DEFAULT_SHORT_CODE_LENGTH): string {
  const chars: string[] = [];
  while (chars.length < length) {
    const bytes = randomBytes(length - chars.length);
    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) {
        continue;
      }
      chars.push(ALPHABET[byte % ALPHABET_LENGTH]);
      if (chars.length === length) {
        break;
      }
    }
  }
  return chars.join('');
}
