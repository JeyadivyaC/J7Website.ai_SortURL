import { DEFAULT_SHORT_CODE_LENGTH, generateBase62Code } from '../../../src/short-url/code-generator';

describe('generateBase62Code', () => {
  it('generates a code of the default length using only Base62 characters', () => {
    const code = generateBase62Code();
    expect(code).toHaveLength(DEFAULT_SHORT_CODE_LENGTH);
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('respects a custom length', () => {
    const code = generateBase62Code(10);
    expect(code).toMatch(/^[0-9A-Za-z]{10}$/);
  });

  it('produces distinct codes across many generations', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateBase62Code()));
    // Not a strict guarantee, but with 62^6 possibilities, collisions in a
    // sample of 2000 are astronomically unlikely - this guards against a
    // broken/constant generator.
    expect(codes.size).toBe(2000);
  });

  it('covers the full 62-character alphabet over a large sample (rejection sampling correctness)', () => {
    const seenChars = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      for (const char of generateBase62Code(8)) {
        seenChars.add(char);
      }
    }
    expect(seenChars.size).toBe(62);
  });
});
