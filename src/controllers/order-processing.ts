/* eslint-disable no-await-in-loop */
import type { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { orders } from '@/db/schema.ts';
import type { Database } from '@/db/type.ts';
import { ProductService } from '@/services/product/product.service.ts';


type ProcessOrderParams = { orderId: number };

// Plugin that elegantly wires the process order route
export const OrderProcessingController: FastifyPluginAsync = fastifyPlugin(async server => {
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  server
    .withTypeProvider<ZodTypeProvider>()
    .post(
      '/orders/:orderId/processOrder',
      {
        schema: {
          params: z.object({
            orderId: z.coerce.number(),
          }),
        },
      },
      async (request, reply) => {
        const db = server.diContainer.resolve('db') as Database;
        const ps = server.diContainer.resolve('ps') as ProductService;
        const { orderId } = request.params as ProcessOrderParams;

        // Find the order, including its products
        const order = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          with: {
            products: {
              columns: {},
              with: { product: true },
            },
          },
        });

        if (!order) {
          return reply.status(404).send({ error: 'Order not found!' });
        }

        // Use for-await for max JS clarity and future async iteration
        const productList = order.products ?? [];
        for await (const { product } of productList) {
          await ps.handleProduct(product);
        }

        return reply.send({ orderId: order.id });
      }
    );
});
