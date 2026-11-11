import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Processor('routing')
export class RoutingProcessor extends WorkerHost {
  private readonly logger = new Logger(RoutingProcessor.name);
  private readonly aiServiceUrl = process.env.AI_WORKER_URL || 'http://localhost:8787';

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, payload, tenantId, schemaName } = job.data;
    this.logger.log(`Processing routing job: ${jobId}`);

    let ok = false;
    let solverResult: any = null;

    try {
      const response: any = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/routing/solve`, payload, {
          headers: { 'x-ai-api-key': process.env.AI_API_KEY || '' },
        })
      );
      ok = Boolean(response.data?.ok);
      solverResult = response.data ?? null;
    } catch (error: any) {
      this.logger.error(`Error calling AI Service for job ${jobId}: ${error.message}`);
      solverResult = { ok: false, error: error?.message || 'AI Service call failed' };
    }

    await this.prisma.runWithTenantRequest(tenantId, schemaName, async () => {
      await this.prisma.getTenantDb().routeOptimizationJob.update({
        where: { id: jobId },
        data: ok
          ? {
              status: 'COMPLETED',
              result: JSON.stringify(solverResult ?? {}),
              completedAt: new Date(),
            }
          : {
              status: 'FAILED',
              result: JSON.stringify(solverResult ?? { ok: false }),
              completedAt: new Date(),
            },
      });
    });

    if (ok) {
      this.logger.log(`Routing job ${jobId} COMPLETED`);
    } else {
      this.logger.error(`Routing job ${jobId} FAILED inside AI Service`);
      throw new Error(`Routing job ${jobId} failed`);
    }

    return {};
  }
}
