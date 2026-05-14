import type { Garment } from '@/types/garment';
import type { GarmentFilters } from '@/store/garment';

export function filterGarments(catalog: Garment[], filters: GarmentFilters): Garment[] {
  let items = catalog;

  // 1. Filter by Line
  if (filters.line !== 'Todas') {
    items = items.filter((g) => g.line === filters.line);
  }

  // 2. Filter by Category
  if (filters.category) {
    items = items.filter((g) => g.category === filters.category);
  }

  // 3. Filter by Sizes
  if (filters.sizes && filters.sizes.length > 0) {
    items = items.filter(
      (g) => g.sizes && g.sizes.some((s) => filters.sizes.includes(s)),
    );
  }

  // 4. Filter by Colors
  if (filters.colors && filters.colors.length > 0) {
    items = items.filter(
      (g) => g.colors && g.colors.some((c) => filters.colors.includes(c)),
    );
  }

  return items;
}
