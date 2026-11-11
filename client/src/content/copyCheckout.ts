import type { Lang } from './copy';

export interface CheckoutCopy {
  title: string; back: string; secureNote: string;
  contact: string; name: string; phone: string; phoneHint: string; email: string; emailHint: string;
  delivery: string; district: string; districtPick: string; city: string; cityHint: string; address: string; addressHint: string; instructions: string; instructionsHint: string;
  payment: string; cod: string; codText: string;
  couponLabel: string; couponPlaceholder: string; apply: string; applying: string; couponApplied: string; couponRemove: string; couponFree: string;
  summary: string; qty: string; subtotal: string; productDiscount: string; couponDiscount: string; deliveryFee: string; free: string; total: string; zoneLabel: string; eta: string; updating: string;
  place: string; placing: string; placeWithTotal: string; emptyTitle: string; emptyText: string; shopNow: string;
  ord: { eyebrow: string; title: string; sub: string; pick: string; add: string; inCart: string; delivery: string; emptyHint: string };
  v: { name: string; phone: string; email: string; district: string; city: string; address: string; instructions: string };
  err: Record<'INSUFFICIENT_STOCK' | 'PRICE_CHANGED' | 'DUPLICATE_ORDER' | 'COUPON_INVALID' | 'ACCOUNT_BLOCKED' | 'COD_LIMIT' | 'PAYMENT_METHOD_UNAVAILABLE' | 'NETWORK' | 'GENERIC' | 'RATE_LIMITED' | 'NOT_CONFIGURED', string>;
  dupTitle: string; dupText: string; dupConfirm: string; priceChangedBtn: string;
  couponReasons: Record<'NOT_FOUND' | 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'MIN_ORDER' | 'LIMIT_REACHED' | 'CUSTOMER_LIMIT' | 'NOT_APPLICABLE', string>;
  warn: { STOCK_REDUCED: string; ITEM_UNAVAILABLE: string };
  fixCart: string;
  order: {
    title: string; thanks: string; number: string; copy: string; copied: string; placedOn: string; next: string; nextText: string; codNote: string; items: string; deliverTo: string; contactVia: string;
    whatsapp: string; waMessage: string; continue: string; invalidTitle: string; invalidText: string; errorTitle: string; errorText: string; retry: string; loading: string; payment: string; paymentCod: string; status: string;
    statuses: Record<string, string>;
  };
}

export const checkoutCopy: Record<Lang, CheckoutCopy> = {
  en: {
    title: 'Checkout', back: '← Back to shop', secureNote: 'Pay with cash when your order arrives.',
    contact: 'Your details', name: 'Full name', phone: 'Mobile number', phoneHint: 'We will call or message you on this number.', email: 'Email (optional)', emailHint: 'For your order receipt.',
    delivery: 'Delivery address', district: 'District', districtPick: 'Choose your district', city: 'City / Thana / Area', cityHint: 'e.g. Mirpur, Sadar, Zindabazar', address: 'Full address', addressHint: 'House, road, village/area — as clear as possible so the courier can find you.', instructions: 'Delivery instructions (optional)', instructionsHint: 'e.g. call before delivery',
    payment: 'Payment', cod: 'Cash on Delivery', codText: 'Pay in cash to the delivery person when your order arrives.',
    couponLabel: 'Coupon code', couponPlaceholder: 'Enter code', apply: 'Apply', applying: 'Checking…', couponApplied: 'Coupon applied', couponRemove: 'Remove coupon', couponFree: 'Free delivery with this coupon',
    summary: 'Order summary', qty: 'Quantity', subtotal: 'Subtotal', productDiscount: 'Discount', couponDiscount: 'Coupon discount', deliveryFee: 'Delivery', free: 'Free', total: 'Total', zoneLabel: 'Delivery area', eta: 'Estimated delivery', updating: 'Updating prices…',
    place: 'Place order', placing: 'Placing your order…', placeWithTotal: 'Place order · {total}', emptyTitle: 'Your cart is empty', emptyText: 'Add a product to your cart to check out.', shopNow: 'Browse products',
    ord: { eyebrow: 'Order now', title: 'Place your order here', sub: 'Choose what you want, fill in your details and confirm. We will confirm your order on WhatsApp.', pick: 'Choose your products', add: 'Add', inCart: 'In cart', delivery: 'Delivery', emptyHint: 'Add a product above to start your order.' },
    v: { name: 'Please enter your full name (at least 2 letters).', phone: 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.', email: 'Enter a valid email address.', district: 'Please choose your district.', city: 'Please enter your city or area.', address: 'Please write your full address (at least 10 characters).', instructions: 'Instructions are too long (max 300 characters).' },
    err: {
      INSUFFICIENT_STOCK: 'Some items are no longer available in the quantity you chose. We updated your cart — please review it and try again.',
      PRICE_CHANGED: 'Prices or delivery charges changed. Please check the updated total, then place your order again.',
      DUPLICATE_ORDER: 'You already placed an identical order a moment ago.',
      COUPON_INVALID: 'This coupon can no longer be used, so we removed it. Please review your total.',
      ACCOUNT_BLOCKED: 'We could not accept this order online. Please contact us on WhatsApp.',
      COD_LIMIT: 'Cash on Delivery is not available for an order this large. Please contact us on WhatsApp.',
      PAYMENT_METHOD_UNAVAILABLE: 'Cash on Delivery is currently unavailable. Please contact us on WhatsApp.',
      NETWORK: 'We could not reach the server. Your order was NOT lost — please check your connection and tap “Place order” again.',
      GENERIC: 'Something went wrong. Please try again.',
      RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
      NOT_CONFIGURED: 'The shop is not ready for orders yet. Please contact us on WhatsApp.',
    },
    dupTitle: 'Order already placed?', dupText: 'An identical order from this number was placed a moment ago (order {orderNo}).', dupConfirm: 'This is a new order — place it anyway', priceChangedBtn: 'Updated total shown — place order',
    couponReasons: {
      NOT_FOUND: 'This coupon code is not valid.', INACTIVE: 'This coupon is not active.', NOT_STARTED: 'This coupon is not active yet.', EXPIRED: 'This coupon has expired.',
      MIN_ORDER: 'Your order does not reach the minimum amount for this coupon.', LIMIT_REACHED: 'This coupon has reached its usage limit.', CUSTOMER_LIMIT: 'You have already used this coupon.', NOT_APPLICABLE: 'This coupon does not apply to the items in your cart.',
    },
    warn: { STOCK_REDUCED: 'Only {qty} available — quantity reduced.', ITEM_UNAVAILABLE: 'Out of stock — please remove it to continue.' },
    fixCart: 'Please remove the unavailable items to continue.',
    order: {
      title: 'Order confirmation', thanks: 'Thank you! Your order has been received.', number: 'Order number', copy: 'Copy', copied: 'Copied', placedOn: 'Placed on', next: 'What happens next', nextText: 'Our team will confirm your order on WhatsApp and arrange delivery. Please keep your phone nearby.',
      codNote: 'Cash on Delivery — please keep the exact amount ready.', items: 'Your items', deliverTo: 'Delivering to', contactVia: 'We will contact you on', whatsapp: 'Message us on WhatsApp', waMessage: 'Hello! I have a question about my order {orderNo}.', continue: 'Continue shopping',
      invalidTitle: 'We can’t show this order here', invalidText: 'This confirmation link has expired or was opened on another device. If you placed an order, it is safe — please message us on WhatsApp with your order number.', errorTitle: 'Could not load your order', errorText: 'Your order is safe. Please check your connection and try again.', retry: 'Try again', loading: 'Loading your order…', payment: 'Payment', paymentCod: 'Cash on Delivery', status: 'Status',
      statuses: { pending: 'Order received', confirmed: 'Confirmed', processing: 'Being prepared', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' },
    },
  },
  bn: {
    title: 'চেকআউট', back: '← দোকানে ফিরুন', secureNote: 'পণ্য হাতে পেয়ে নগদ টাকা দিন।',
    contact: 'আপনার তথ্য', name: 'পুরো নাম', phone: 'মোবাইল নম্বর', phoneHint: 'এই নম্বরে আমরা কল বা মেসেজ করব।', email: 'ইমেইল (ঐচ্ছিক)', emailHint: 'অর্ডারের রসিদের জন্য।',
    delivery: 'ডেলিভারির ঠিকানা', district: 'জেলা', districtPick: 'আপনার জেলা বেছে নিন', city: 'শহর / থানা / এলাকা', cityHint: 'যেমন: মিরপুর, সদর, জিন্দাবাজার', address: 'পূর্ণ ঠিকানা', addressHint: 'বাড়ি, রাস্তা, গ্রাম/এলাকা — যত স্পষ্ট লিখবেন, কুরিয়ার তত সহজে খুঁজে পাবে।', instructions: 'ডেলিভারি নির্দেশনা (ঐচ্ছিক)', instructionsHint: 'যেমন: ডেলিভারির আগে কল করবেন',
    payment: 'পেমেন্ট', cod: 'ক্যাশ অন ডেলিভারি', codText: 'অর্ডার হাতে পেয়ে ডেলিভারি ম্যানকে নগদ টাকা দিন।',
    couponLabel: 'কুপন কোড', couponPlaceholder: 'কোড লিখুন', apply: 'প্রয়োগ করুন', applying: 'যাচাই হচ্ছে…', couponApplied: 'কুপন প্রয়োগ হয়েছে', couponRemove: 'কুপন সরান', couponFree: 'এই কুপনে ডেলিভারি ফ্রি',
    summary: 'অর্ডারের সারসংক্ষেপ', qty: 'পরিমাণ', subtotal: 'সাবটোটাল', productDiscount: 'ছাড়', couponDiscount: 'কুপন ছাড়', deliveryFee: 'ডেলিভারি', free: 'ফ্রি', total: 'মোট', zoneLabel: 'ডেলিভারি এলাকা', eta: 'আনুমানিক ডেলিভারি', updating: 'দাম হালনাগাদ হচ্ছে…',
    place: 'অর্ডার করুন', placing: 'অর্ডার হচ্ছে…', placeWithTotal: 'অর্ডার করুন · {total}', emptyTitle: 'আপনার কার্ট খালি', emptyText: 'চেকআউট করতে কার্টে পণ্য যোগ করুন।', shopNow: 'পণ্য দেখুন',
    ord: { eyebrow: 'অর্ডার করুন', title: 'এখানেই অর্ডার করুন', sub: 'পণ্য বেছে নিন, আপনার তথ্য দিন এবং অর্ডার নিশ্চিত করুন। আমরা হোয়াটসঅ্যাপে অর্ডার কনফার্ম করব।', pick: 'আপনার পণ্য বেছে নিন', add: 'যোগ করুন', inCart: 'কার্টে আছে', delivery: 'ডেলিভারি', emptyHint: 'অর্ডার শুরু করতে উপরে থেকে পণ্য যোগ করুন।' },
    v: { name: 'অনুগ্রহ করে পুরো নাম লিখুন (কমপক্ষে ২ অক্ষর)।', phone: 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন, যেমন: 01712345678।', email: 'সঠিক ইমেইল ঠিকানা লিখুন।', district: 'অনুগ্রহ করে আপনার জেলা বেছে নিন।', city: 'অনুগ্রহ করে শহর বা এলাকার নাম লিখুন।', address: 'অনুগ্রহ করে পূর্ণ ঠিকানা লিখুন (কমপক্ষে ১০ অক্ষর)।', instructions: 'নির্দেশনা অনেক বড় (সর্বোচ্চ ৩০০ অক্ষর)।' },
    err: {
      INSUFFICIENT_STOCK: 'কিছু পণ্য আপনার নির্বাচিত পরিমাণে আর নেই। আমরা কার্ট হালনাগাদ করেছি — দেখে আবার চেষ্টা করুন।',
      PRICE_CHANGED: 'দাম বা ডেলিভারি চার্জ বদলেছে। হালনাগাদ মোট দেখে আবার অর্ডার করুন।',
      DUPLICATE_ORDER: 'একটু আগেই আপনি হুবহু একই অর্ডার করেছেন।',
      COUPON_INVALID: 'এই কুপনটি আর ব্যবহার করা যাচ্ছে না, তাই সরিয়ে দিয়েছি। মোট দেখে নিন।',
      ACCOUNT_BLOCKED: 'অনলাইনে এই অর্ডারটি নেওয়া যায়নি। অনুগ্রহ করে হোয়াটসঅ্যাপে যোগাযোগ করুন।',
      COD_LIMIT: 'এত বড় অর্ডারে ক্যাশ অন ডেলিভারি পাওয়া যাবে না। অনুগ্রহ করে হোয়াটসঅ্যাপে যোগাযোগ করুন।',
      PAYMENT_METHOD_UNAVAILABLE: 'ক্যাশ অন ডেলিভারি এখন বন্ধ আছে। অনুগ্রহ করে হোয়াটসঅ্যাপে যোগাযোগ করুন।',
      NETWORK: 'সার্ভারে যোগাযোগ করা যায়নি। আপনার অর্ডার হারায়নি — ইন্টারনেট দেখে আবার “অর্ডার করুন” চাপুন।',
      GENERIC: 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',
      RATE_LIMITED: 'অনেকবার চেষ্টা করা হয়েছে। এক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।',
      NOT_CONFIGURED: 'দোকান এখনও অর্ডারের জন্য প্রস্তুত নয়। অনুগ্রহ করে হোয়াটসঅ্যাপে যোগাযোগ করুন।',
    },
    dupTitle: 'অর্ডার কি আগেই হয়ে গেছে?', dupText: 'এই নম্বর থেকে একটু আগে হুবহু একই অর্ডার করা হয়েছে (অর্ডার {orderNo})।', dupConfirm: 'এটি নতুন অর্ডার — তবুও অর্ডার করুন', priceChangedBtn: 'হালনাগাদ মোট দেখানো হয়েছে — অর্ডার করুন',
    couponReasons: {
      NOT_FOUND: 'এই কুপন কোডটি সঠিক নয়।', INACTIVE: 'এই কুপনটি সক্রিয় নয়।', NOT_STARTED: 'এই কুপনটি এখনও শুরু হয়নি।', EXPIRED: 'এই কুপনের মেয়াদ শেষ হয়ে গেছে।',
      MIN_ORDER: 'এই কুপনের জন্য ন্যূনতম অর্ডারের পরিমাণে পৌঁছায়নি।', LIMIT_REACHED: 'এই কুপনের ব্যবহারের সীমা শেষ।', CUSTOMER_LIMIT: 'আপনি আগেই এই কুপন ব্যবহার করেছেন।', NOT_APPLICABLE: 'এই কুপন আপনার কার্টের পণ্যে প্রযোজ্য নয়।',
    },
    warn: { STOCK_REDUCED: 'মাত্র {qty}টি আছে — পরিমাণ কমানো হয়েছে।', ITEM_UNAVAILABLE: 'স্টকে নেই — এগিয়ে যেতে এটি সরিয়ে দিন।' },
    fixCart: 'এগিয়ে যেতে অনুপলব্ধ পণ্যগুলো সরিয়ে দিন।',
    order: {
      title: 'অর্ডার নিশ্চিতকরণ', thanks: 'ধন্যবাদ! আপনার অর্ডার আমরা পেয়েছি।', number: 'অর্ডার নম্বর', copy: 'কপি', copied: 'কপি হয়েছে', placedOn: 'অর্ডারের সময়', next: 'এরপর কী হবে', nextText: 'আমাদের টিম হোয়াটসঅ্যাপে আপনার অর্ডার নিশ্চিত করে ডেলিভারির ব্যবস্থা করবে। অনুগ্রহ করে ফোন কাছে রাখুন।',
      codNote: 'ক্যাশ অন ডেলিভারি — সঠিক টাকা তৈরি রাখুন।', items: 'আপনার পণ্য', deliverTo: 'ডেলিভারি হবে', contactVia: 'আমরা যোগাযোগ করব', whatsapp: 'হোয়াটসঅ্যাপে মেসেজ করুন', waMessage: 'হ্যালো! আমার অর্ডার {orderNo} সম্পর্কে একটি প্রশ্ন আছে।', continue: 'কেনাকাটা চালিয়ে যান',
      invalidTitle: 'এখানে অর্ডারটি দেখানো যাচ্ছে না', invalidText: 'এই নিশ্চিতকরণ লিংকের মেয়াদ শেষ হয়েছে অথবা অন্য ডিভাইসে খোলা হয়েছে। আপনি অর্ডার করে থাকলে সেটি নিরাপদ আছে — অনুগ্রহ করে অর্ডার নম্বরসহ হোয়াটসঅ্যাপে মেসেজ করুন।', errorTitle: 'অর্ডার লোড করা যায়নি', errorText: 'আপনার অর্ডার নিরাপদ আছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।', retry: 'আবার চেষ্টা করুন', loading: 'আপনার অর্ডার লোড হচ্ছে…', payment: 'পেমেন্ট', paymentCod: 'ক্যাশ অন ডেলিভারি', status: 'অবস্থা',
      statuses: { pending: 'অর্ডার গ্রহণ করা হয়েছে', confirmed: 'নিশ্চিত', processing: 'প্রস্তুত করা হচ্ছে', shipped: 'পাঠানো হয়েছে', out_for_delivery: 'ডেলিভারির পথে', delivered: 'ডেলিভারি হয়েছে', cancelled: 'বাতিল', returned: 'ফেরত' },
    },
  },
};
