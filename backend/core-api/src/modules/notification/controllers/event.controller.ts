import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EventPrismaService } from '../prisma/event-prisma.service';
import { NotificationService } from '../services/notification.service';

@Controller()
export class EventController {
  private readonly logger = new Logger(EventController.name);
  private readonly defaultEmail = process.env.DEFAULT_NOTIFICATION_EMAIL || 'support@smartlogi.com';
  private readonly sosHotline = process.env.SOS_HOTLINE || process.env.DEFAULT_SOS_HOTLINE || 'support@smartlogi.com';

  constructor(
    private readonly notificationService: NotificationService,
    private readonly eventPrisma: EventPrismaService,
  ) {}

  @MessagePattern('order.created')
  async handleOrderCreated(@Payload() data: any) {
    this.logger.log(`Received Kafka event: order.created for Order ${data.trackingCode}`);
    
    if (!data.recipientEmail) {
      this.logger.warn(`No recipient email for order ${data.trackingCode}, skipping notification`);
      return;
    }

    await this.notificationService.sendEmail(
      data.recipientEmail,
      'Order Created Successfully',
      `Your tracking code is: ${data.trackingCode}`
    );
  }

  @MessagePattern('delivery.completed')
  async handleDeliveryCompleted(@Payload() data: any) {
    this.logger.log(`Received Kafka event: delivery.completed for Trip ${data.tripId}`);
    
    if (!data.driverId) {
      this.logger.warn('No driverId for delivery.completed event, skipping notification');
      return;
    }

    await this.notificationService.sendPush(
      data.driverId,
      'Trip Completed',
      'You have completed the trip. Please remit COD at the counter.'
    );
  }

  @MessagePattern('sos.alert')
  async handleSosAlert(@Payload() data: any) {
    this.logger.warn(`URGENT: Received sos.alert from Driver ${data.driverId}`);
    
    await this.notificationService.sendSms(
      this.sosHotline,
      `SOS ALERT: Driver ${data.driverId} at coordinates ${data.lat}, ${data.lng}`
    );
  }

  @MessagePattern('return.requested')
  async handleReturnRequested(@Payload() data: any) {
    this.logger.log(`Return requested: ${data.returnCode} for order ${data.orderId}`);
    
    const email = process.env.RETURN_NOTIFICATION_EMAIL || process.env.DEFAULT_NOTIFICATION_EMAIL || 'returns@smartlogi.com';
    await this.notificationService.sendEmail(
      email,
      `New Return Request: ${data.returnCode}`,
      `Return request ${data.returnCode} has been created for order ${data.orderId}. Items: ${JSON.stringify(data.items)}`
    );
  }

  @MessagePattern('return.approved')
  async handleReturnApproved(@Payload() data: any) {
    this.logger.log(`Return approved: ${data.returnCode}`);
    
    if (data.clientId) {
      const clientUser = await this.getClientUserEmail(data.clientId);
      if (clientUser) {
        await this.notificationService.sendEmail(
          clientUser,
          `Return Approved: ${data.returnCode}`,
          `Your return request ${data.returnCode} has been approved. A driver will be scheduled for pickup.`
        );
      }
    }
  }

  @MessagePattern('return.rejected')
  async handleReturnRejected(@Payload() data: any) {
    this.logger.log(`Return rejected: ${data.returnCode} - ${data.rejectionReason}`);
    
    if (data.clientId) {
      const clientUser = await this.getClientUserEmail(data.clientId);
      if (clientUser) {
        await this.notificationService.sendEmail(
          clientUser,
          `Return Rejected: ${data.returnCode}`,
          `Your return request ${data.returnCode} has been rejected. Reason: ${data.rejectionReason || 'N/A'}`
        );
      }
    }
  }

  private async getClientUserEmail(clientId: string, schemaName?: string): Promise<string | null> {
    try {
      return await this.eventPrisma.runWithSchema(schemaName || 'public', async (client) => {
        const found = await client.client.findUnique({
          where: { id: clientId },
          include: { users: { take: 1 } }
        });
        return found?.users?.[0]?.email || null;
      });
    } catch {
      return null;
    }
  }
}
