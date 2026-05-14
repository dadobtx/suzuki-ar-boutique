import { describe, it, expect } from 'vitest';
import { generateWishlistCode } from '@/lib/wishlist-code';

describe('Wishlist Code Generator', () => {
  it('generates a 6 character string', () => {
    const code = generateWishlistCode();
    expect(code).toHaveLength(6);
  });

  it('only contains A-Z and 0-9', () => {
    const code = generateWishlistCode();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('generates mostly unique codes (10k test)', () => {
    const codes = new Set<string>();
    const n = 10000;
    for (let i = 0; i < n; i++) {
      codes.add(generateWishlistCode());
    }
    // With 36^6 possibilities (~2.1 billion), collisions in 10k should be very low.
    // 0.1% collision rate allowance => at least 9990 unique codes
    expect(codes.size).toBeGreaterThan(9990);
  });
});
