export type Invoice = {
  id: string;
  tenantId: string;
  clientId?: string;
  invoiceNumber: string;
  totalAmount: number;
  status: string;
  issuedAt: string;
  dueAt?: string;
  paidAt?: string;
  updatedAt: string;
  deletedAt?: string;
  lineItems?: InvoiceLineItem[];
  payments?: PaymentTransaction[];
  client?: {
    id: string;
    name: string;
  };
};

export type InvoiceLineItem = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PaymentTransaction = {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  method: string;
  status: string;
  transactionId?: string;
  createdAt: string;
  invoice?: Invoice;
};

export type ApiUsageDaily = {
  id: string;
  tenantId: string;
  date: string;
  endpoint: string;
  method: string;
  count: number;
};

export type Notification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  priority: string;
  entityType?: string;
  entityId?: string;
  metadata?: string;
  isRead: boolean;
  readAt?: string;
  sentAt?: string;
  expiresAt?: string;
  createdAt: string;
};

export type FileAttachment = {
  id: string;
  entityType: string;
  entityId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
};

export type AiModel = {
  id: string;
  name: string;
  version: string;
  type: string;
  accuracy?: number;
  modelPath: string;
  isCurrent: boolean;
  trainedAt: string;
  metadata?: string;
};

export type AiFeedback = {
  id: string;
  modelId: string;
  resourceType: string;
  resourceId: string;
  aiPrediction: string;
  humanCorrected: string;
  confidence?: number;
  isUsedForTrain: boolean;
  createdAt: string;
};
