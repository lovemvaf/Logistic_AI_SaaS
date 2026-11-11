import Stripe from 'stripe';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class StripeService {
  private stripe: any;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly prisma: PrismaService) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured. Stripe payment features will be unavailable.');
    } else {
      // apiVersion của package stripe đang cài (2023-10-16) - đổi khi nâng SDK.
      this.stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
    }
  }

  private requireStripe(): void {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
    }
  }

  async createPaymentIntent(amount: number, currency: string = 'usd', metadata: Record<string, any> = {}): Promise<string> {
    this.requireStripe();

    const intent = await this.stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    });
    return intent.client_secret as string;
  }

  async createSubscription(customerId: string, priceId: string, metadata: Record<string, any> = {}): Promise<any> {
    this.requireStripe();

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata,
    });

    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<any> {
    this.requireStripe();

    return await this.stripe.subscriptions.cancel(subscriptionId);
  }

  async createCustomer(email: string, name: string, metadata: Record<string, any> = {}): Promise<any> {
    this.requireStripe();

    return await this.stripe.customers.create({
      email,
      name,
      metadata,
    });
  }

  async createInvoice(customerId: string): Promise<any> {
    this.requireStripe();

    const invoice = await this.stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 30,
    });

    return invoice;
  }

  async finalizeInvoice(invoiceId: string): Promise<any> {
    this.requireStripe();

    return await this.stripe.invoices.finalize(invoiceId);
  }

  async sendInvoice(invoiceId: string): Promise<any> {
    this.requireStripe();

    return await this.stripe.invoices.sendInvoice(invoiceId);
  }

  verifyWebhookSignature(signature: string, payload: Buffer, secret: string): any {
    this.requireStripe();

    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  async handleWebhookEvent(event: any): Promise<void> {
    this.logger.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handlePaymentSuccess(paymentIntent: any): Promise<void> {
    const { invoiceId, tenantId } = paymentIntent.metadata || {};
    if (!invoiceId) {
      this.logger.log(`Payment succeeded: ${paymentIntent.id} (no invoice metadata)`);
      return;
    }

    try {
      await this.prisma.runAsPlatform(async (db) => {
        const existing = await db.invoice.findUnique({ where: { id: invoiceId } });
        if (!existing || (tenantId && existing.tenantId !== tenantId)) {
          this.logger.warn(`Invoice ${invoiceId} not found or tenant mismatch`);
          return;
        }
        await db.invoice.update({
          where: { id: invoiceId },
          data: { status: 'PAID', paidAt: new Date() },
        });
      });
      this.logger.log(`Invoice ${invoiceId} marked as PAID via webhook`);
    } catch (error: any) {
      this.logger.error(`Failed to update invoice ${invoiceId}: ${error.message}`);
    }
  }

  private async handlePaymentFailure(paymentIntent: any): Promise<void> {
    const { invoiceId } = paymentIntent.metadata || {};
    this.logger.warn(`Payment failed: ${paymentIntent.id} for invoice ${invoiceId || 'N/A'}`);
  }

  private async handleInvoicePaid(invoice: any): Promise<void> {
    this.logger.log(`Invoice paid: ${invoice.id}`);
    try {
      await this.prisma.runAsPlatform((db) =>
        db.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidAt: new Date() },
        }),
      );
    } catch (error: any) {
      this.logger.error(`Failed to update invoice ${invoice.id}: ${error.message}`);
    }
  }

  private async handleInvoicePaymentFailed(invoice: any): Promise<void> {
    this.logger.warn(`Invoice payment failed: ${invoice.id}`);
    try {
      await this.prisma.runAsPlatform((db) =>
        db.invoice.update({
          where: { id: invoice.id },
          data: { status: 'FAILED' },
        }),
      );
    } catch (error: any) {
      this.logger.error(`Failed to update invoice ${invoice.id} status: ${error.message}`);
    }
  }

  private async handleSubscriptionUpdated(subscription: any): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id} - Status: ${subscription.status}`);
  }

  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);
  }
}
