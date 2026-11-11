import { Controller, Post, Req, Res, Headers, Logger } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { StripeService } from "../payments/stripe.service";
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Stripe Webhook')
@Controller("webhooks")
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  @Post("stripe")
  async handleStripeWebhook(
    @Req() req: any,
    @Res() res: any,
    @Headers("stripe-signature") signature: string,
  ) {
    let event;

    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        this.logger.error('STRIPE_WEBHOOK_SECRET not configured. Rejecting webhook for security.');
        return res.status(500).json({ error: 'Stripe webhook secret not configured' });
      }
      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }
      event = this.stripeService.verifyWebhookSignature(
        signature,
        req.rawBody,
        webhookSecret,
      );
    } catch (err: any) {
      this.logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    this.logger.log(`Received Stripe event: ${event.type}`);

    switch (event.type) {
      case "payment_intent.succeeded":
        await this.handlePaymentSuccess(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await this.handlePaymentFailure(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  }

  private async handlePaymentSuccess(paymentIntent: any) {
    const { invoiceId, tenantId } = paymentIntent.metadata || {};
    if (!invoiceId) return;

    try {
      await this.prisma.runAsPlatform(async (db) => {
        const existing = await db.invoice.findUnique({ where: { id: invoiceId } });
        if (!existing || (tenantId && existing.tenantId !== tenantId)) {
          this.logger.warn(`Invoice ${invoiceId} not found or tenant mismatch (${tenantId || 'none'})`);
          return;
        }
        await db.invoice.update({
          where: { id: invoiceId },
          data: { status: "PAID", paidAt: new Date() },
        });
      });
      this.logger.log(`Invoice ${invoiceId} marked as PAID`);
    } catch (error: any) {
      this.logger.error(`Failed to update invoice ${invoiceId}: ${error.message}`);
    }
  }

  private async handlePaymentFailure(paymentIntent: any) {
    const { invoiceId } = paymentIntent.metadata || {};
    if (!invoiceId) return;

    this.logger.warn(`Payment failed for invoice ${invoiceId}`);
  }
}
