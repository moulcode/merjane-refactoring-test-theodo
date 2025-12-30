import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import { ProductService } from '@/services/product.service';
import type { INotificationService } from '@/services/notifications.port';
import { products, type Product } from '@/db/schema.ts';
import type { Database } from 'drizzle-orm';

describe('ProductService Tests', () => {
  let db: DeepMockProxy<Database>;
  let ns: DeepMockProxy<INotificationService>;
  let service: ProductService;

  // Sample product
  const sampleProduct: Product = {
    id: 1,
    leadTime: 3,
    available: 10,
    type: 'normal',
    name: 'Sample',
    expiryDate: Date.now() + 1000 * 60 * 60 * 24,
    seasonStartDate: undefined,
    seasonEndDate: undefined,
  };

  beforeEach(() => {
    // Deep mock the database
    db = mockDeep<Database>();
    ns = mockDeep<INotificationService>();

    // Mock the chained update call
    db.update.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    } as any);

    service = new ProductService(db, ns);
  });

  it('should handle delay notification correctly', async () => {
    await service.notifyDelay(sampleProduct, 5);
    expect(db.update).toHaveBeenCalledWith(products);
    expect(ns.sendDelayNotification).toHaveBeenCalledWith(5, 'Sample');
  });

  it('should handle seasonal product in season correctly', async () => {
    const seasonalProduct = {
      ...sampleProduct,
      seasonStartDate: Date.now() - 1000,
      seasonEndDate: Date.now() + 1000 * 60 * 60 * 24,
    };
    await service.handleSeasonalProduct(seasonalProduct);
    expect(db.update).toHaveBeenCalledWith(products);
  });

  it('should handle seasonal product out of season', async () => {
    const seasonalProduct = {
      ...sampleProduct,
      seasonStartDate: Date.now() - 1000 * 60 * 60 * 48,
      seasonEndDate: Date.now() - 1000 * 60 * 60 * 24,
    };
    await service.handleSeasonalProduct(seasonalProduct);
    expect(ns.sendOutOfStockNotification).toHaveBeenCalledWith('Sample');
    expect(db.update).toHaveBeenCalledWith(products);
  });

  it('should handle expired product correctly', async () => {
    const expiredProduct = { ...sampleProduct, expiryDate: Date.now() - 1000 };
    await service.handleExpiredProduct(expiredProduct);
    expect(ns.sendExpirationNotification).toHaveBeenCalledWith(
      'Sample',
      expiredProduct.expiryDate,
    );
    expect(db.update).toHaveBeenCalledWith(products);
  });

  it('should decrement available for unexpired product', async () => {
    const unexpiredProduct = { ...sampleProduct };
    await service.handleExpiredProduct(unexpiredProduct);
    expect(db.update).toHaveBeenCalledWith(products);
    expect(unexpiredProduct.available).toBe(sampleProduct.available - 1);
  });
});
