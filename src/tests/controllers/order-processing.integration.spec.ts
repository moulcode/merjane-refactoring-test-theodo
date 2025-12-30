import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { asValue } from 'awilix';
import { type Database } from '@/db/type.js';
import { buildFastify } from '@/fastify.js';
import { type ProductService } from '@/services/product/product.service.ts';
import { products, orders, ordersToProducts } from '@/db/schema.ts';

describe('OrderProcessingController Integration Tests', () => {
  let fastify: FastifyInstance;
  let database: Database;
  let productServiceMock: DeepMockProxy<ProductService>;

  beforeEach(async () => {
    // Create deep mock for product service
    productServiceMock = mockDeep<ProductService>();

    // Build Fastify and register dependencies
    fastify = await buildFastify();
    fastify.diContainer.register({
      db: asValue(fastify.database), // Use test DB
      ps: asValue(productServiceMock), // Inject mocked ProductService
    });
    await fastify.ready();

    database = fastify.database;
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('should process order and update product availability or call handlers', async () => {
    const client = supertest(fastify.server);
    const allProducts = createProducts();
    const orderId = await database.transaction(async tx => {
      // Insert products
      const productList = await tx.insert(products)
        .values(allProducts)
        .returning({ productId: products.id });

      // Insert order
      const [order] = await tx.insert(orders).values([{}]).returning({ orderId: orders.id });

      // Link products to order
      await tx.insert(ordersToProducts)
        .values(productList.map(p => ({ orderId: order!.orderId, productId: p.productId })));

      return order!.orderId;
    });

    // Call controller endpoint
    await client.post(`/orders/${orderId}/processOrder`)
      .expect(200)
      .expect('Content-Type', /application\/json/);

    // Verify order exists
    const resultOrder = await database.query.orders.findFirst({ where: eq(orders.id, orderId) });
    expect(resultOrder).toBeDefined();
    expect(resultOrder!.id).toBe(orderId);

    // Check NORMAL out-of-stock product triggered notifyDelay
    expect(productServiceMock.notifyDelay).toHaveBeenCalled();

    // Check SEASONAL and EXPIRABLE handlers called when conditions not met
    expect(productServiceMock.handleSeasonalProduct).toHaveBeenCalled();
    expect(productServiceMock.handleExpiredProduct).toHaveBeenCalled();
  });

  function createProducts() {
    const d = 24 * 60 * 60 * 1000; // 1 day
    return [
      { leadTime: 15, available: 30, type: 'NORMAL', name: 'USB Cable' },
      { leadTime: 10, available: 0, type: 'NORMAL', name: 'USB Dongle' },
      { leadTime: 15, available: 30, type: 'EXPIRABLE', name: 'Butter', expiryDate: new Date(Date.now() + 26 * d) },
      { leadTime: 90, available: 6, type: 'EXPIRABLE', name: 'Milk', expiryDate: new Date(Date.now() - 2 * d) },
      { leadTime: 15, available: 30, type: 'SEASONAL', name: 'Watermelon', seasonStartDate: new Date(Date.now() - 2 * d), seasonEndDate: new Date(Date.now() + 58 * d) },
      { leadTime: 15, available: 30, type: 'SEASONAL', name: 'Grapes', seasonStartDate: new Date(Date.now() + 180 * d), seasonEndDate: new Date(Date.now() + 240 * d) },
    ];
  }
});
