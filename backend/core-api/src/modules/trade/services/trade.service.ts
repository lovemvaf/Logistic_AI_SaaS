import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OutboxService } from '../../../core/outbox/outbox.service';

const ALLOWED_TRADE_DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
]);

@Injectable()
export class TradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async listDocuments(query?: { bookingId?: string; clientId?: string; status?: string }) {
    const where: any = {};
    if (query?.bookingId) where.bookingId = query.bookingId;
    if (query?.clientId) where.clientId = query.clientId;
    if (query?.status) where.status = query.status;

    return this.prisma.getTenantDb().tradeDocument.findMany({
      where,
      include: {
        booking: { select: { id: true, bookingNo: true } },
        client: { select: { id: true, name: true } },
        versions: { orderBy: { versionNo: 'desc' }, take: 3 },
        hsSuggestions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(dto: {
    bookingId?: string;
    shipmentId?: string;
    clientId?: string;
    docType: string;
    docNumber: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
    extractedJson?: Record<string, unknown>;
    simulateFailure?: 'PASSWORD_PROTECTED' | 'CORRUPTED' | 'UNSUPPORTED';
    uploadedBy?: string;
    note?: string;
  }) {
    if (!dto?.docType || !dto?.docNumber || !dto?.fileName) {
      throw new BadRequestException('docType, docNumber, and fileName are required');
    }

    const safeFileName = pathBasenameSafe(dto.fileName);
    const mimeType = dto.mimeType || 'application/pdf';
    if (!ALLOWED_TRADE_DOC_MIMES.has(mimeType) || dto.simulateFailure === 'UNSUPPORTED') {
      throw new BadRequestException(`Unsupported trade document mimeType: ${mimeType}`);
    }

    let status = dto.extractedJson ? 'EXTRACTED' : 'UPLOADED';
    let extractionStatus = dto.extractedJson ? 'SUCCEEDED' : 'PENDING';
    let discrepanciesJson: Record<string, unknown> | undefined;

    if (dto.simulateFailure === 'PASSWORD_PROTECTED' || dto.simulateFailure === 'CORRUPTED') {
      status = 'REJECTED';
      extractionStatus = 'FAILED';
      discrepanciesJson = {
        errorCode: dto.simulateFailure,
        message:
          dto.simulateFailure === 'PASSWORD_PROTECTED'
            ? 'Document is encrypted/password-protected and cannot be parsed automatically'
            : 'Document stream appears corrupted during checksum validation',
      };
    }

    const sha256 = crypto
      .createHash('sha256')
      .update(`${safeFileName}:${dto.docNumber}:${JSON.stringify(dto.extractedJson || {})}`)
      .digest('hex');

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const existing = await tx.tradeDocument.findFirst({
        where: { docType: dto.docType, docNumber: dto.docNumber },
        include: { versions: true },
      });

      if (existing) {
        const nextVersion = existing.versions.length + 1;
        const updated = await tx.tradeDocument.update({
          where: { id: existing.id },
          data: {
            fileName: safeFileName,
            mimeType,
            fileSize: dto.fileSize ?? existing.fileSize,
            sha256,
            status,
            extractionStatus,
            extractedJson: dto.extractedJson ?? existing.extractedJson,
            discrepanciesJson: discrepanciesJson ?? undefined,
          },
        });
        await tx.tradeDocumentVersion.create({
          data: {
            documentId: existing.id,
            versionNo: nextVersion,
            fileName: safeFileName,
            sha256,
            extractedJson: dto.extractedJson ?? undefined,
            uploadedBy: dto.uploadedBy || null,
            note: dto.note || `Revision ${nextVersion}`,
          },
        });
        return updated;
      }

      const doc = await tx.tradeDocument.create({
        data: {
          bookingId: dto.bookingId || null,
          shipmentId: dto.shipmentId || null,
          clientId: dto.clientId || null,
          docType: dto.docType,
          docNumber: String(dto.docNumber).trim(),
          fileName: safeFileName,
          mimeType,
          fileSize: dto.fileSize ?? null,
          sha256,
          status,
          extractionStatus,
          extractedJson: dto.extractedJson ?? undefined,
          discrepanciesJson: discrepanciesJson ?? undefined,
        },
      });

      await tx.tradeDocumentVersion.create({
        data: {
          documentId: doc.id,
          versionNo: 1,
          fileName: safeFileName,
          sha256,
          extractedJson: dto.extractedJson ?? undefined,
          uploadedBy: dto.uploadedBy || null,
          note: dto.note || 'Initial upload',
        },
      });

      return doc;
    });
  }

  /**
   * Cross-checks Commercial Invoice (CI) vs Packing List (PL) vs Bill of Lading (BL)
   * on a single booking and flags concrete field discrepancies in DB.
   */
  async reconcileBookingDocuments(bookingId: string) {
    const db = this.prisma.getTenantDb();
    const docs = await db.tradeDocument.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
    if (docs.length === 0) {
      throw new NotFoundException(`No trade documents found for booking ${bookingId}`);
    }

    const ci = docs.find((d: any) => d.docType === 'COMMERCIAL_INVOICE');
    const pl = docs.find((d: any) => d.docType === 'PACKING_LIST');
    const bl = docs.find((d: any) => d.docType === 'BILL_OF_LADING');

    const discrepancies: Array<{
      field: string;
      severity: 'HIGH' | 'MEDIUM';
      sourceA: string;
      valueA: unknown;
      sourceB: string;
      valueB: unknown;
    }> = [];

    const ciData = (ci?.extractedJson as Record<string, any>) || {};
    const plData = (pl?.extractedJson as Record<string, any>) || {};
    const blData = (bl?.extractedJson as Record<string, any>) || {};

    if (ci && pl) {
      if (
        ciData.grossWeightKg !== undefined &&
        plData.grossWeightKg !== undefined &&
        Math.abs(Number(ciData.grossWeightKg) - Number(plData.grossWeightKg)) > 0.5
      ) {
        discrepancies.push({
          field: 'grossWeightKg',
          severity: 'HIGH',
          sourceA: 'COMMERCIAL_INVOICE',
          valueA: ciData.grossWeightKg,
          sourceB: 'PACKING_LIST',
          valueB: plData.grossWeightKg,
        });
      }
      if (
        ciData.packageCount !== undefined &&
        plData.packageCount !== undefined &&
        Number(ciData.packageCount) !== Number(plData.packageCount)
      ) {
        discrepancies.push({
          field: 'packageCount',
          severity: 'HIGH',
          sourceA: 'COMMERCIAL_INVOICE',
          valueA: ciData.packageCount,
          sourceB: 'PACKING_LIST',
          valueB: plData.packageCount,
        });
      }
    }

    if (pl && bl) {
      if (
        plData.grossWeightKg !== undefined &&
        blData.grossWeightKg !== undefined &&
        Math.abs(Number(plData.grossWeightKg) - Number(blData.grossWeightKg)) > 1
      ) {
        discrepancies.push({
          field: 'grossWeightKg',
          severity: 'HIGH',
          sourceA: 'PACKING_LIST',
          valueA: plData.grossWeightKg,
          sourceB: 'BILL_OF_LADING',
          valueB: blData.grossWeightKg,
        });
      }
    }

    if (ci && ciData.currency && bl && blData.currency && ciData.currency !== blData.currency) {
      discrepancies.push({
        field: 'currency',
        severity: 'MEDIUM',
        sourceA: 'COMMERCIAL_INVOICE',
        valueA: ciData.currency,
        sourceB: 'BILL_OF_LADING',
        valueB: blData.currency,
      });
    }

    const nextStatus = discrepancies.length > 0 ? 'MISMATCH_FOUND' : 'VERIFIED';
    await db.$transaction(async (tx: any) => {
      for (const d of docs) {
        if (d.status === 'REJECTED') continue;
        await tx.tradeDocument.update({
          where: { id: d.id },
          data: {
            status: nextStatus,
            discrepanciesJson: discrepancies,
          },
        });
      }
    });

    return {
      bookingId,
      status: nextStatus,
      discrepancyCount: discrepancies.length,
      discrepancies,
      documentsChecked: docs.map((d: any) => ({ id: d.id, docType: d.docType, docNumber: d.docNumber })),
    };
  }

  async listDeclarations(query?: { status?: string; channel?: string }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.channel) where.channel = query.channel;

    return this.prisma.getTenantDb().customsDeclaration.findMany({
      where,
      include: {
        booking: { select: { id: true, bookingNo: true, mblNo: true } },
        events: { orderBy: { occurredAt: 'desc' } },
        hsSuggestions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDeclaration(dto: any, actorId?: string) {
    if (!dto?.portCode) throw new BadRequestException('portCode is required');
    const declarationNo =
      dto.declarationNo ||
      `DEC-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const decl = await tx.customsDeclaration.create({
        data: {
          declarationNo,
          bookingId: dto.bookingId || null,
          shipmentId: dto.shipmentId || null,
          direction: dto.direction === 'IMPORT' ? 'IMPORT' : 'EXPORT',
          channel: ['GREEN', 'YELLOW', 'RED'].includes(dto.channel) ? dto.channel : 'YELLOW',
          portCode: String(dto.portCode).trim().toUpperCase(),
          hsReviewRequired: true,
          status: 'NEEDS_CUSTOMS_REVIEW',
          notes: dto.notes || null,
        },
      });

      await tx.customsStatusEvent.create({
        data: {
          declarationId: decl.id,
          status: 'NEEDS_CUSTOMS_REVIEW',
          channel: decl.channel,
          message: 'Declaration initialized — HS codes and document check pending officer review',
          actorId: actorId || null,
        },
      });

      return decl;
    });
  }

  async suggestHsCodes(dto: {
    declarationId?: string;
    documentId?: string;
    itemDescription: string;
  }) {
    if (!dto?.itemDescription || !dto.itemDescription.trim()) {
      throw new BadRequestException('itemDescription is required');
    }

    const candidates = inferDeterministicHsCandidates(dto.itemDescription);
    const top = candidates[0];

    const record = await this.prisma.getTenantDb().hSCodeSuggestion.create({
      data: {
        declarationId: dto.declarationId || null,
        documentId: dto.documentId || null,
        itemDescription: dto.itemDescription.trim(),
        suggestedHsCode: top.hsCode,
        confidence: top.confidence,
        advisoryOnly: true,
        status: 'NEEDS_CUSTOMS_REVIEW',
        sourceMethod: 'rule_fallback',
      },
    });

    return {
      suggestion: record,
      advisoryOnly: true,
      requiresHumanReview: true,
      candidates,
      legalDisclaimer:
        'Mã HS gợi ý chỉ mang tính tham khảo (NEEDS_CUSTOMS_REVIEW), phải được cán bộ XNK xác nhận trước khi truyền tờ khai.',
    };
  }

  async reviewHsSuggestion(
    id: string,
    dto: { decision: 'APPROVED' | 'REJECTED'; approvedHsCode?: string; reviewNote?: string },
    reviewerId?: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(dto.decision)) {
      throw new BadRequestException('decision must be APPROVED or REJECTED');
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const existing = await tx.hSCodeSuggestion.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`HSCodeSuggestion ${id} not found`);

      const updated = await tx.hSCodeSuggestion.update({
        where: { id },
        data: {
          status: dto.decision,
          approvedHsCode:
            dto.decision === 'APPROVED'
              ? String(dto.approvedHsCode || existing.suggestedHsCode).trim()
              : null,
          reviewedBy: reviewerId || 'customs-officer',
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote || null,
        },
      });

      if (existing.declarationId && dto.decision === 'APPROVED') {
        const remainingPending = await tx.hSCodeSuggestion.count({
          where: {
            declarationId: existing.declarationId,
            status: 'NEEDS_CUSTOMS_REVIEW',
          },
        });
        if (remainingPending === 0) {
          const decl = await tx.customsDeclaration.findUnique({
            where: { id: existing.declarationId },
          });
          if (decl && decl.status === 'NEEDS_CUSTOMS_REVIEW') {
            await tx.customsDeclaration.update({
              where: { id: decl.id },
              data: { status: 'READY_TO_SUBMIT', hsReviewRequired: false },
            });
            await tx.customsStatusEvent.create({
              data: {
                declarationId: decl.id,
                status: 'READY_TO_SUBMIT',
                channel: decl.channel,
                message: 'All HS code suggestions approved by licensed operator',
                actorId: reviewerId || null,
              },
            });
          }
        }
      }

      return updated;
    });
  }

  /**
   * Hard customs compliance gate: blocks declaration submission if ANY pending
   * HS review remains OR any attached booking document has MISMATCH_FOUND / FAILED.
   */
  async submitDeclaration(id: string, actorId?: string) {
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const decl = await tx.customsDeclaration.findUnique({
        where: { id },
        include: { hsSuggestions: true },
      });
      if (!decl) throw new NotFoundException(`CustomsDeclaration ${id} not found`);

      const unapprovedHs = decl.hsSuggestions.filter((s: any) => s.status !== 'APPROVED');
      if (decl.hsReviewRequired && (decl.hsSuggestions.length === 0 || unapprovedHs.length > 0)) {
        throw new ConflictException(
          `Declaration ${decl.declarationNo} blocked by NEEDS_CUSTOMS_REVIEW gate (${unapprovedHs.length} unapproved HS suggestion(s))`,
        );
      }

      if (decl.bookingId) {
        const badDocs = await tx.tradeDocument.findMany({
          where: {
            bookingId: decl.bookingId,
            status: { in: ['MISMATCH_FOUND', 'REJECTED'] },
          },
        });
        if (badDocs.length > 0) {
          throw new ConflictException(
            `Declaration ${decl.declarationNo} blocked: ${badDocs.length} linked trade document(s) have unresolved discrepancies`,
          );
        }
      }

      const nextStatus = decl.channel === 'GREEN' ? 'CLEARED' : 'SUBMITTED';
      const updated = await tx.customsDeclaration.update({
        where: { id },
        data: {
          status: nextStatus,
          submittedAt: new Date(),
          ...(nextStatus === 'CLEARED' ? { clearedAt: new Date() } : {}),
        },
      });

      await tx.customsStatusEvent.create({
        data: {
          declarationId: decl.id,
          status: nextStatus,
          channel: decl.channel,
          message:
            nextStatus === 'CLEARED'
              ? 'Submitted and auto-cleared under GREEN channel'
              : `Submitted under ${decl.channel} channel awaiting inspection`,
          actorId: actorId || null,
        },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'trade.customs.submitted',
          aggregateId: decl.id,
          payload: {
            declarationId: decl.id,
            declarationNo: decl.declarationNo,
            channel: decl.channel,
            status: nextStatus,
          },
        },
        tx,
      );

      return updated;
    });
  }
}

function pathBasenameSafe(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() || 'document.pdf';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function inferDeterministicHsCandidates(desc: string): Array<{
  hsCode: string;
  description: string;
  confidence: number;
}> {
  const lower = desc.toLowerCase();
  if (lower.includes('pcb') || lower.includes('circuit') || lower.includes('electronic') || lower.includes('linh kien')) {
    return [
      { hsCode: '8534.00.90', description: 'Printed circuits & electronic sub-assemblies', confidence: 0.78 },
      { hsCode: '8542.39.00', description: 'Electronic integrated circuits', confidence: 0.61 },
    ];
  }
  if (lower.includes('textile') || lower.includes('garment') || lower.includes('shoe') || lower.includes('giay') || lower.includes('det may')) {
    return [
      { hsCode: '6403.99.90', description: 'Footwear / textile manufactured goods', confidence: 0.74 },
      { hsCode: '6205.20.00', description: 'Woven cotton apparel', confidence: 0.58 },
    ];
  }
  if (lower.includes('wood') || lower.includes('furniture') || lower.includes('go')) {
    return [
      { hsCode: '9403.60.90', description: 'Wooden furniture & interior components', confidence: 0.76 },
      { hsCode: '4407.99.90', description: 'Processed sawn timber products', confidence: 0.55 },
    ];
  }
  return [
    { hsCode: '3926.90.99', description: 'Other industrial articles of plastics/components (Review Required)', confidence: 0.45 },
    { hsCode: '8479.89.99', description: 'General mechanical/industrial apparatus', confidence: 0.35 },
  ];
}
