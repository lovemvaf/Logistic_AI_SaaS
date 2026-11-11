export type OrderSummary = {
  id: string;
  trackingCode: string;
  clientId?: string;
  clientOrderRef?: string;
  status: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  lat?: number;
  lng?: number;
  codAmount: number;
  shippingFee: number;
  notes?: string;
  cancelledReason?: string;
  podImageUrl?: string;
  driverId?: string;
  estimatedDeliveryDate?: string;
  actualDeliveryTime?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  items?: OrderItem[];
  events?: OrderTrackingEvent[];
  client?: ClientSummary;
  driver?: DriverSummaryRef;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  createdAt: string;
  product?: ProductSummaryRef;
};

export type OrderTrackingEvent = {
  id: string;
  orderId: string;
  status: string;
  location?: string;
  description: string;
  timestamp: string;
  feedbackId?: string;
};

export type ClientSummary = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
};

export type ClientUser = {
  id: string;
  clientId: string;
  email: string;
  fullName: string;
  phone?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductSummaryRef = {
  id: string;
  sku: string;
  name: string;
};

export type DriverSummaryRef = {
  id: string;
  userId: string;
  licenseClass: string;
  status: string;
};

export type ClientWebhook = {
  id: string;
  clientId: string;
  url: string;
  events: string;
  secretToken?: string;
  isActive: boolean;
  createdAt: string;
};

export type ShippingRate = {
  id: string;
  name: string;
  baseFee: number;
  perKmRate: number;
  perKgRate: number;
  minFee: number;
  serviceType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
