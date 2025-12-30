import { eq } from 'drizzle-orm';
import { products, type Product } from '@/db/schema.ts';
import { type Database } from '@/db/type.ts';
import { type INotificationService } from '../notifications.port.ts';

/**
 * Service class for handling product processing logic,
 * including inventory management and notifications.
 */
export class ProductService {
  /**
   * @param db - Database instance for CRUD operations
   * @param ns - Notification service for sending alerts
   */
  constructor(
    private readonly db: Database,
    private readonly ns: INotificationService
  ) {}

  /**
   * Top-level handler to process products based on their type.
   * Will call the appropriate handler for each product type.
   *
   * @param product - The product to process
   */
  public async handleProduct(product: Product): Promise<void> {
    const now = new Date();
    switch (product.type) {
      case 'NORMAL':
        // Standard product: decrement available or maybe notify delay
        await this.handleNormal(product);
        break;
      case 'SEASONAL':
        // Seasonal product: check dates and stock, otherwise call seasonal handler
        await this.handleSeasonal(product, now);
        break;
      case 'EXPIRABLE':
        // Expirable product: check expiry, otherwise call expired handler
        await this.handleExpirable(product, now);
        break;
      default:
        throw new Error(`Unknown product type: ${product.type}`);
    }
  }

  /**
   * Handle normal product inventory and potential delay notification.
   * Decrements available if in stock, otherwise, if leadTime is set, sends a delay notification.
   */
  private async handleNormal(p: Product): Promise<void> {
    if (p.available > 0) {
      // Product in stock, decrement quantity
      p.available -= 1;
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    } else if (p.leadTime && p.leadTime > 0) {
      // Out of stock, expected restock ("lead time") - send notification
      await this.notifyDelay(p.leadTime, p);
    }
  }

  /**
   * Handle seasonal product sale logic:
   * - Will only decrement if available and within season.
   * - Delegates out-of-window or out-of-stock cases to season handler.
   *
   * @param p - The product to process
   * @param now - Current datetime
   */
  private async handleSeasonal(p: Product, now: Date): Promise<void> {
    if (
      p.available > 0 &&
      p.seasonStartDate &&
      p.seasonEndDate &&
      now >= p.seasonStartDate &&
      now <= p.seasonEndDate
    ) {
      // In-season and in stock, fulfill order
      p.available -= 1;
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    } else {
      // Out of season or unavailable, call special handler for notification/logic
      await this.handleSeasonalProduct(p);
    }
  }

  /**
   * Handle expirable product sale logic:
   * - Fulfill order if available and not expired.
   * - Otherwise trigger expired product handler.
   *
   * @param p - Product to process
   * @param now - Current datetime
   */
  private async handleExpirable(p: Product, now: Date): Promise<void> {
    if (p.available > 0 && p.expiryDate && p.expiryDate > now) {
      // Not expired and in stock, fulfill order
      p.available -= 1;
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    } else {
      // Expired or unavailable, handle expiration logic
      await this.handleExpiredProduct(p);
    }
  }

  /**
   * Notify about shipping or order delay due to lead time.
   * Updates the leadTime field on the product and sends notification.
   */
  public async notifyDelay(leadTime: number, p: Product): Promise<void> {
    // Ensure product's leadTime is set, update DB, notify customer
    p.leadTime = leadTime;
    await this.db.update(products).set(p).where(eq(products.id, p.id));
    this.ns.sendDelayNotification(leadTime, p.name);
  }

  /**
   * Handles special cases for seasonal products, including sending OOS notifications
   * and triggering delayed shipment logic when appropriate.
   */
  public async handleSeasonalProduct(p: Product): Promise<void> {
    const now = new Date();
    const d = 1000 * 60 * 60 * 24; // milliseconds per day

    // If fulfilling now with leadTime puts us past season, it's OOS for this year
    if (new Date(now.getTime() + (p.leadTime ?? 0) * d) > p.seasonEndDate!) {
      // Can't fulfill: season will end before lead time is over
      this.ns.sendOutOfStockNotification(p.name);
      p.available = 0;
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    } else if (p.seasonStartDate! > now) {
      // Out of stock because season hasn't started yet
      this.ns.sendOutOfStockNotification(p.name);
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    } else {
      // Not yet OOS, notify about delayed shipment
      await this.notifyDelay(p.leadTime!, p);
    }
  }

  /**
   * Handles expirable products that are past expiry or out of stock.
   * Sends expiration notification and sets available = 0 in DB.
   */
  public async handleExpiredProduct(p: Product): Promise<void> {
    const now = new Date();
    if (p.available > 0 && p.expiryDate! > now) {
      // Double-check: valid but not handled through main logic? Fulfill.
      p.available -= 1;
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    } else {
      // Product expired or unavailable - notify and mark out of stock
      this.ns.sendExpirationNotification(p.name, p.expiryDate!);
      p.available = 0;
      await this.db.update(products).set(p).where(eq(products.id, p.id));
    }
  }
}
