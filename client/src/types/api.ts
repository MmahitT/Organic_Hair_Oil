export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface PublicVariant {
  sku: string; label: string; sizeValue: number | null; sizeUnit: string | null;
  price: number; compareAtPrice: number | null; stockStatus: StockStatus; maxQty: number;
}

export interface PublicProduct {
  id: string; slug: string; type: 'simple' | 'bundle';
  name: string; nameBn: string | null;
  shortDescription: string | null; shortDescriptionBn: string | null;
  description: string | null; descriptionBn: string | null;
  images: { url: string; alt: string; isPrimary: boolean }[];
  variants: PublicVariant[];
  price: number; compareAtPrice: number | null; stockStatus: StockStatus; maxQty: number;
  freeDelivery: boolean; isFeatured: boolean;
  ratingAverage?: number; ratingCount?: number;
  bundle: { productId: string; name: string; nameBn: string | null; label: string; quantity: number; isGift: boolean; unitPrice: number }[];
  bundleValue: number | null;
  ingredients: { id: string; name: string; nameBn: string | null; description: string | null }[];
}

export type MfsChannel = 'bkash' | 'nagad' | 'rocket';
export interface BankDetails { bankName: string | null; accountName: string | null; accountNumber: string | null; branch: string | null }
/** Payment options with the owner's instructions/details (all edited in Admin → Payments). */
export interface PaymentMethods {
  cod: boolean;
  manual: { channel: MfsChannel; number: string; instructions: string | null }[];
  bank: (BankDetails & { instructions: string | null }) | null;
}
export type PaymentMethodKey = 'cod' | 'manual_bkash' | 'manual_nagad' | 'manual_rocket' | 'manual_bank';
export interface PublicSettings {
  currency: string;
  business: { name?: string; phone?: string; whatsapp?: string; logo: string | null; email?: string | null; address?: string | null; social?: Partial<Record<'facebook' | 'instagram' | 'youtube' | 'tiktok', string>> };
  announcement: { text?: string | null; textBn?: string | null; link?: string | null } | null;
  /** Owner-edited FAQ. Empty = the built-in answers are shown. */
  faq?: { q: string; a: string; qBn?: string; aBn?: string }[];
  seo?: { title: string | null; description: string | null; titleBn: string | null; descriptionBn: string | null; ogImage: string | null };
  /** Tracking IDs. Scripts for them are loaded only after the visitor consents. */
  analytics?: { ga4Id: string | null; metaPixelId: string | null };
  legalReviewed?: boolean;
  delivery: { zones: { key: string; name: string; fee: number; etaDays: string | null }[] };
  payments: PaymentMethods;
}

export interface ApiMeta { page: number; limit: number; total: number }

export interface QuoteLine {
  productId: string; sku: string; name: string; nameBn: string | null; image: string | null; isBundle: boolean;
  requestedQty: number; qty: number; maxQty: number; unitPrice: number; regularPrice: number; lineTotal: number;
  freeDelivery: boolean; unavailable: boolean; issue: 'ITEM_UNAVAILABLE' | 'STOCK_REDUCED' | null;
}
export interface Quote {
  lines: QuoteLine[];
  subtotal: number; productDiscount: number; couponDiscount: number; deliveryFee: number; total: number; freeDelivery: boolean;
  zone: { key: string; name: string; etaDays: string | null } | null;
  coupon: { code: string; type: string; discount: number; freeDelivery: boolean } | null;
  couponError: { reason: string; message: string } | null;
  warnings: { code: 'ITEM_UNAVAILABLE' | 'STOCK_REDUCED'; productId: string; sku: string; message: string }[];
}
export interface DeliveryInfo { zones: { key: string; name: string; fee: number; etaDays: string | null }[]; districts: string[]; codEnabled: boolean; methods: PaymentMethods }
export interface CheckoutResult { replay: boolean; orderNo: string; status: string; paymentStatus: string; paymentMethod: PaymentMethodKey; total: number; orderToken: string }
export interface OrderStatusData {
  orderNo: string; status: string; paymentStatus: string; paymentMethod: string; createdAt: string;
  items: { name: string; image: string | null; unitPrice: number; quantity: number; lineTotal: number }[];
  subtotal: number; productDiscount: number; couponDiscount: number; deliveryFee: number; total: number; deliveryZone: string | null;
  customer: { firstName: string; phoneMasked: string; district: string };
  payment: {
    method: string; status: string; expiresAt: string | null;
    manual: { channel: MfsChannel | 'bank'; number: string | null; instructions: string | null; bank: BankDetails | null; canSubmit: boolean; submitted: boolean } | null;
  };
}

export interface TimelineEntry { status: string; at: string }
/** Result of POST /orders/track (limited, privacy-safe view of an order). */
export interface TrackData {
  orderNo: string; status: string; paymentStatus: string; paymentMethod: string; createdAt: string; token: string;
  timeline: TimelineEntry[];
  items: { productId: string; name: string; image: string | null; unitPrice: number; quantity: number; lineTotal: number }[];
  subtotal: number; productDiscount: number; couponDiscount: number; deliveryFee: number; total: number; deliveryZone: string | null;
  courier: { name: string | null; trackingNo: string | null } | null;
  customer: { firstName: string; phoneMasked: string; district: string };
  canCancel: boolean; cancellationRequested: boolean; canReturn: boolean; returnStatus: string | null;
}
export interface PublicReview { id: string; name: string; rating: number; title: string | null; comment: string; verified: boolean; reply: string | null; createdAt: string }
export interface ReviewSummary { count: number; average: number; distribution: { star: number; count: number }[] }
