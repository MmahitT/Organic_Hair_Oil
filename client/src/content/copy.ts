/**
 * Seed landing-page copy (English + Bangla). Phase 8 moves this into the admin
 * Content module. Tokens like {combo} are filled from live price data.
 *
 * DRAFT NOTICE: benefits, usage steps and FAQ wording are cautious drafts and
 * must be reviewed by the owner. No certification, medical or guaranteed-result
 * claims are made. Ingredient lists are intentionally NOT invented.
 */
export type Lang = 'en' | 'bn';

export interface Copy {
  announcement: string;
  nav: { offer: string; benefits: string; ingredients: string; howTo: string; reviews: string; faq: string; orderNow: string; cart: string; menu: string; close: string };
  hero: { eyebrow: string; title: string; sub: string; cta: string; whatsapp: string; points: string[]; badge: string; rating: string };
  trust: { title: string; text: string }[];
  products: { eyebrow: string; title: string; sub: string; story: string; add: string; comboTag: string; value: string; save: string; empty: string; emptyText: string };
  benefits: { eyebrow: string; title: string; items: { title: string; text: string }[]; disclaimer: string };
  ingredients: { eyebrow: string; title: string; sub: string; cards: { name: string; note: string }[]; pending: string };
  howTo: { eyebrow: string; title: string; steps: { title: string; text: string }[]; powderNote: string; caution: string };
  gallery: { eyebrow: string; title: string; open: string; close: string; prev: string; next: string; alts: string[] };
  reviews: { eyebrow: string; title: string; emptyTitle: string; emptyText: string; cta: string };
  offers: { eyebrow: string; title: string; includes: string; giftTag: string; free: string; freeDelivery: string; deliveryTitle: string; dhaka: string; outside: string; comboFree: string; cta: string; save: string };
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
  finalCta: { title: string; text: string; cta: string };
  footer: { about: string; links: string; contact: string; deliveryInfo: string; rights: string; whatsapp: string };
  cart: { title: string; empty: string; emptyCta: string; qty: string; remove: string; zone: string; dhaka: string; outside: string; subtotal: string; delivery: string; free: string; total: string; estimate: string; orderWa: string; clear: string; giftNote: string; inc: string; dec: string; continue: string };
  sticky: { label: string; cta: string };
  wa: { greeting: string; orderIntro: string; area: string; support: string };
  a11y: { skip: string; whatsappFloat: string; language: string };
  stock: { out: string; low: string };
  load: { loading: string; errorTitle: string; errorText: string; retry: string };
}

export const copy: Record<Lang, Copy> = {
  en: {
    announcement: 'Combo offer: Hair Oil + Hair Powder + a free wooden comb for {combo} — free home delivery all over Bangladesh',
    nav: { offer: 'Offer', benefits: 'Benefits', ingredients: 'Ingredients', howTo: 'How to use', reviews: 'Reviews', faq: 'FAQ', orderNow: 'Order now', cart: 'Open cart', menu: 'Open menu', close: 'Close' },
    hero: {
      eyebrow: 'Natural hair care from Bangladesh',
      title: 'Nourish your hair, the natural way',
      sub: 'A complete hair-care combo — 200 ml Hair Oil, 225 g Hair Powder and a premium wooden comb — delivered to your door.',
      cta: 'Order the combo — {combo}',
      whatsapp: 'Chat on WhatsApp',
      points: ['Free delivery on the combo', 'Cash on Delivery', 'Free wooden comb'],
      badge: 'Free comb + free delivery',
      rating: 'Customer reviews coming soon',
    },
    trust: [
      { title: 'Cash on Delivery', text: 'Pay when your order arrives' },
      { title: 'All over Bangladesh', text: 'Home delivery to every district' },
      { title: 'Free delivery on combo', text: 'No delivery charge on the combo' },
      { title: 'WhatsApp support', text: 'Ask us anything, any time' },
      { title: 'Premium wooden comb', text: 'Included free with the combo' },
    ],
    products: {
      eyebrow: 'Our products',
      title: 'Everything for your hair routine',
      sub: 'Buy the combo for the best value, or choose a single product.',
      story: 'Beauty Organic Hair Oil brings a simple natural routine together: an oil for your scalp and hair, a powder for your hair-care ritual, and a wooden comb to finish.',
      add: 'Add to cart',
      comboTag: 'Best value',
      empty: 'Products are being updated',
      emptyText: 'Please message us on WhatsApp to order while we refresh the shop.',
      value: 'Worth {value} if bought separately',
      save: 'You save {save} + free delivery',
    },
    benefits: {
      eyebrow: 'Why you will love it',
      title: 'Simple, natural, thoughtful',
      items: [
        { title: 'Natural care routine', text: 'Made to fit into a simple, regular natural hair-care routine.' },
        { title: 'Oil and powder together', text: 'Two products sold together so you can build a complete routine.' },
        { title: 'Gentle wooden comb', text: 'A wide-tooth wooden comb helps you detangle with care.' },
        { title: 'Easy to order', text: 'Order in a minute and pay by Cash on Delivery.' },
        { title: 'Real value', text: 'The combo includes a free comb and free delivery nationwide.' },
        { title: 'Friendly support', text: 'Questions? Message us on WhatsApp and we will help.' },
      ],
      disclaimer: 'Results can vary from person to person.',
    },
    ingredients: {
      eyebrow: 'Transparency',
      title: 'What is inside',
      sub: 'We believe you should know what you put on your hair.',
      cards: [
        { name: 'Hair Oil · 200 ml', note: 'Please see the ingredient list printed on the product label.' },
        { name: 'Hair Powder · 225 g', note: 'Please see the ingredient list printed on the jar label.' },
      ],
      pending: 'The complete ingredient list will be published here soon.',
    },
    howTo: {
      eyebrow: 'Easy steps',
      title: 'How to use',
      steps: [
        { title: 'Prepare', text: 'Start with clean, detangled hair. Part your hair into sections.' },
        { title: 'Apply the oil', text: 'Apply a small amount of Hair Oil to your scalp and along your hair.' },
        { title: 'Massage gently', text: 'Massage your scalp with your fingertips for a few minutes.' },
        { title: 'Comb through', text: 'Use the wooden comb to spread the oil and gently detangle.' },
        { title: 'Leave and wash', text: 'Leave for the time shown on the label, then rinse with a mild shampoo.' },
      ],
      powderNote: 'Hair Powder: please follow the directions printed on the jar label.',
      caution: 'Do a small patch test first. Keep away from eyes. Stop using and consult a professional if irritation occurs.',
    },
    gallery: {
      eyebrow: 'Gallery',
      title: 'See it for yourself',
      open: 'Open image',
      close: 'Close image',
      prev: 'Previous image',
      next: 'Next image',
      alts: [
        'Hair oil, hair powder and wooden comb held in front of pink flowers',
        'Open Beauty Organic box with hair powder jar, hair oil bottle and wooden comb',
        'Beauty Organic Hair Oil bottle',
        'Beauty Organic Hair Powder jar',
        'Wooden comb engraved Beauty Organic Hair Oil',
      ],
    },
    reviews: {
      eyebrow: 'Customer reviews',
      title: 'What customers say',
      emptyTitle: 'Reviews are coming soon',
      emptyText: 'We only show real reviews from real customers. Tried our products? We would love to hear from you.',
      cta: 'Share your feedback on WhatsApp',
    },
    offers: {
      eyebrow: 'Running offer',
      title: 'Combo offer — {combo} only',
      includes: 'What you get',
      giftTag: 'Free gift',
      free: 'Free',
      freeDelivery: 'Free home delivery all over Bangladesh',
      deliveryTitle: 'Delivery charges (single products)',
      dhaka: 'Inside Rangpur',
      outside: 'Outside Rangpur',
      comboFree: 'Combo: delivery free everywhere',
      cta: 'Get the combo — {combo}',
      save: 'Worth {value} separately',
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Frequently asked questions',
      items: [
        { q: 'What is in the combo?', a: 'The combo includes one 200 ml Hair Oil, one 225 g Hair Powder and one premium wooden comb, for {combo}.' },
        { q: 'What are the delivery charges?', a: 'Delivery is free all over Bangladesh when you order the combo. For other orders it is {dhaka} inside Rangpur and {outside} outside Rangpur.' },
        { q: 'Can I pay on delivery?', a: 'Yes. Cash on Delivery is available. Online payment options (bKash, Nagad, Rocket and cards) are coming soon.' },
        { q: 'How do I order?', a: 'Add items to your cart and send your order to us on WhatsApp. A full online checkout is coming soon.' },
        { q: 'How do I use the products?', a: 'Please follow the usage directions printed on each label. A general guide is in the "How to use" section above.' },
        { q: 'How long does delivery take?', a: 'Message us on WhatsApp with your area and we will tell you the expected delivery time.' },
        { q: 'Can I buy a single product?', a: 'Yes. You can buy the Hair Oil, Hair Powder or Wooden Comb separately.' },
      ],
    },
    finalCta: {
      title: 'Start your natural hair-care routine today',
      text: 'Combo offer — Hair Oil + Hair Powder + free wooden comb for {combo}, with free delivery all over Bangladesh.',
      cta: 'Order the combo — {combo}',
    },
    footer: {
      about: 'Natural hair-care products from Bangladesh — hair oil, hair powder and wooden combs.',
      links: 'Quick links',
      contact: 'Contact',
      deliveryInfo: 'Delivery',
      rights: 'All rights reserved.',
      whatsapp: 'WhatsApp',
    },
    cart: {
      title: 'Your cart',
      empty: 'Your cart is empty.',
      emptyCta: 'Browse products',
      qty: 'Quantity',
      remove: 'Remove',
      zone: 'Delivery area',
      dhaka: 'Inside Rangpur',
      outside: 'Outside Rangpur',
      subtotal: 'Subtotal',
      delivery: 'Delivery',
      free: 'Free',
      total: 'Total',
      estimate: 'Estimated total. Final amount is confirmed when your order is placed.',
      orderWa: 'Order on WhatsApp',
      clear: 'Clear cart',
      giftNote: 'Includes a free wooden comb',
      inc: 'Increase quantity',
      dec: 'Decrease quantity',
      continue: 'Continue shopping',
    },
    sticky: { label: 'Combo offer', cta: 'Order now' },
    wa: {
      greeting: 'Hello! I would like to know more about Beauty Organic Hair Oil.',
      orderIntro: 'Hello! I would like to order:',
      area: 'Delivery area',
      support: 'Hello! I want to share my feedback about Beauty Organic Hair Oil.',
    },
    a11y: { skip: 'Skip to main content', whatsappFloat: 'Chat with us on WhatsApp', language: 'Switch language' },
    stock: { out: 'Out of stock', low: 'Only a few left' },
    load: { loading: 'Loading…', errorTitle: 'We could not load the shop', errorText: 'Please check your connection and try again, or order directly on WhatsApp.', retry: 'Try again' },
  },
  bn: {
    announcement: 'কম্বো অফার চলছে মাত্র {combo} — সারা বাংলাদেশে হোম ডেলিভারি ফ্রি, সাথে একটি প্রিমিয়াম কাঠের চিরুনি',
    nav: { offer: 'অফার', benefits: 'উপকারিতা', ingredients: 'উপাদান', howTo: 'ব্যবহারবিধি', reviews: 'রিভিউ', faq: 'প্রশ্নোত্তর', orderNow: 'অর্ডার করুন', cart: 'কার্ট খুলুন', menu: 'মেনু খুলুন', close: 'বন্ধ করুন' },
    hero: {
      eyebrow: 'বাংলাদেশের প্রাকৃতিক হেয়ার কেয়ার',
      title: 'প্রাকৃতিক যত্নে চুলের সৌন্দর্য',
      sub: '২০০ মিলি হেয়ার অয়েল, ২২৫ গ্রাম হেয়ার পাউডার ও একটি প্রিমিয়াম কাঠের চিরুনি — সরাসরি আপনার দরজায়।',
      cta: 'কম্বো অর্ডার করুন — {combo}',
      whatsapp: 'হোয়াটসঅ্যাপে কথা বলুন',
      points: ['কম্বোতে ডেলিভারি ফ্রি', 'ক্যাশ অন ডেলিভারি', 'সাথে ফ্রি কাঠের চিরুনি'],
      badge: 'ফ্রি চিরুনি + ফ্রি ডেলিভারি',
      rating: 'কাস্টমার রিভিউ শীঘ্রই আসছে',
    },
    trust: [
      { title: 'ক্যাশ অন ডেলিভারি', text: 'পণ্য হাতে পেয়ে টাকা দিন' },
      { title: 'সারা বাংলাদেশে', text: 'প্রতিটি জেলায় হোম ডেলিভারি' },
      { title: 'কম্বোতে ফ্রি ডেলিভারি', text: 'কম্বো অর্ডারে ডেলিভারি চার্জ নেই' },
      { title: 'হোয়াটসঅ্যাপ সাপোর্ট', text: 'যেকোনো সময় প্রশ্ন করুন' },
      { title: 'প্রিমিয়াম কাঠের চিরুনি', text: 'কম্বোর সাথে একদম ফ্রি' },
    ],
    products: {
      eyebrow: 'আমাদের পণ্য',
      title: 'আপনার চুলের যত্নের সব কিছু',
      sub: 'সেরা মূল্যের জন্য কম্বো নিন, অথবা আলাদা পণ্য বেছে নিন।',
      story: 'বিউটি অর্গানিক হেয়ার অয়েল একটি সহজ প্রাকৃতিক যত্নের রুটিন একসাথে এনেছে: মাথার ত্বক ও চুলের জন্য তেল, চুলের যত্নের জন্য পাউডার, আর শেষে কাঠের চিরুনি।',
      add: 'কার্টে যোগ করুন',
      comboTag: 'সেরা মূল্য',
      empty: 'পণ্য হালনাগাদ করা হচ্ছে',
      emptyText: 'দোকান হালনাগাদ হওয়া পর্যন্ত অর্ডার করতে হোয়াটসঅ্যাপে মেসেজ করুন।',
      value: 'আলাদা কিনলে মূল্য {value}',
      save: 'আপনি বাঁচান {save} + ফ্রি ডেলিভারি',
    },
    benefits: {
      eyebrow: 'কেন পছন্দ করবেন',
      title: 'সহজ, প্রাকৃতিক, যত্নশীল',
      items: [
        { title: 'প্রাকৃতিক যত্নের রুটিন', text: 'নিয়মিত সহজ প্রাকৃতিক হেয়ার কেয়ার রুটিনের জন্য তৈরি।' },
        { title: 'অয়েল ও পাউডার একসাথে', text: 'দুটি পণ্য একসাথে, যাতে সম্পূর্ণ রুটিন তৈরি করতে পারেন।' },
        { title: 'কোমল কাঠের চিরুনি', text: 'চওড়া দাঁতের কাঠের চিরুনি যত্নের সাথে জট ছাড়াতে সাহায্য করে।' },
        { title: 'অর্ডার করা সহজ', text: 'এক মিনিটে অর্ডার করুন, ক্যাশ অন ডেলিভারিতে টাকা দিন।' },
        { title: 'সত্যিকারের ভ্যালু', text: 'কম্বোতে থাকছে ফ্রি চিরুনি ও সারা দেশে ফ্রি ডেলিভারি।' },
        { title: 'আন্তরিক সাপোর্ট', text: 'প্রশ্ন আছে? হোয়াটসঅ্যাপে মেসেজ করুন, আমরা সাহায্য করব।' },
      ],
      disclaimer: 'ফলাফল ব্যক্তিভেদে ভিন্ন হতে পারে।',
    },
    ingredients: {
      eyebrow: 'স্বচ্ছতা',
      title: 'ভেতরে কী আছে',
      sub: 'আপনার চুলে কী ব্যবহার করছেন, তা জানার অধিকার আপনার আছে।',
      cards: [
        { name: 'হেয়ার অয়েল · ২০০ মিলি', note: 'অনুগ্রহ করে পণ্যের লেবেলে ছাপানো উপাদানের তালিকা দেখুন।' },
        { name: 'হেয়ার পাউডার · ২২৫ গ্রাম', note: 'অনুগ্রহ করে জারের লেবেলে ছাপানো উপাদানের তালিকা দেখুন।' },
      ],
      pending: 'সম্পূর্ণ উপাদান তালিকা শীঘ্রই এখানে প্রকাশ করা হবে।',
    },
    howTo: {
      eyebrow: 'সহজ ধাপ',
      title: 'ব্যবহারবিধি',
      steps: [
        { title: 'প্রস্তুতি', text: 'পরিষ্কার ও জট ছাড়ানো চুল নিন। চুল কয়েকটি ভাগে ভাগ করুন।' },
        { title: 'তেল লাগান', text: 'মাথার ত্বকে ও চুলের দৈর্ঘ্য বরাবর অল্প পরিমাণ হেয়ার অয়েল লাগান।' },
        { title: 'আলতো ম্যাসাজ', text: 'আঙুলের ডগা দিয়ে কয়েক মিনিট মাথার ত্বকে ম্যাসাজ করুন।' },
        { title: 'চিরুনি করুন', text: 'কাঠের চিরুনি দিয়ে তেল ছড়িয়ে দিন এবং আলতো করে জট ছাড়ান।' },
        { title: 'রেখে ধুয়ে নিন', text: 'লেবেলে উল্লেখিত সময় রেখে মাইল্ড শ্যাম্পু দিয়ে ধুয়ে ফেলুন।' },
      ],
      powderNote: 'হেয়ার পাউডার: জারের লেবেলে ছাপানো নির্দেশনা অনুসরণ করুন।',
      caution: 'প্রথমে অল্প জায়গায় প্যাচ টেস্ট করুন। চোখে লাগাবেন না। জ্বালাপোড়া হলে ব্যবহার বন্ধ করে বিশেষজ্ঞের পরামর্শ নিন।',
    },
    gallery: {
      eyebrow: 'গ্যালারি',
      title: 'নিজের চোখে দেখুন',
      open: 'ছবি খুলুন',
      close: 'ছবি বন্ধ করুন',
      prev: 'আগের ছবি',
      next: 'পরের ছবি',
      alts: [
        'গোলাপি ফুলের সামনে হেয়ার অয়েল, হেয়ার পাউডার ও কাঠের চিরুনি',
        'বিউটি অর্গানিক বক্সে হেয়ার পাউডার, হেয়ার অয়েল ও কাঠের চিরুনি',
        'বিউটি অর্গানিক হেয়ার অয়েলের বোতল',
        'বিউটি অর্গানিক হেয়ার পাউডারের জার',
        'বিউটি অর্গানিক হেয়ার অয়েল খোদাই করা কাঠের চিরুনি',
      ],
    },
    reviews: {
      eyebrow: 'কাস্টমার রিভিউ',
      title: 'কাস্টমাররা কী বলছেন',
      emptyTitle: 'রিভিউ শীঘ্রই আসছে',
      emptyText: 'আমরা শুধু প্রকৃত গ্রাহকের সত্যিকারের রিভিউ দেখাই। আমাদের পণ্য ব্যবহার করেছেন? আপনার মতামত জানতে চাই।',
      cta: 'হোয়াটসঅ্যাপে মতামত জানান',
    },
    offers: {
      eyebrow: 'চলমান অফার',
      title: 'কম্বো অফার — মাত্র {combo}',
      includes: 'যা পাবেন',
      giftTag: 'ফ্রি উপহার',
      free: 'ফ্রি',
      freeDelivery: 'সারা বাংলাদেশে হোম ডেলিভারি ফ্রি',
      deliveryTitle: 'ডেলিভারি চার্জ (আলাদা পণ্যের জন্য)',
      dhaka: 'রংপুরের ভেতরে',
      outside: 'রংপুরের বাইরে',
      comboFree: 'কম্বোতে সব জায়গায় ডেলিভারি ফ্রি',
      cta: 'কম্বো নিন — {combo}',
      save: 'আলাদা কিনলে মূল্য {value}',
    },
    faq: {
      eyebrow: 'প্রশ্নোত্তর',
      title: 'সচরাচর জিজ্ঞাসা',
      items: [
        { q: 'কম্বোতে কী কী আছে?', a: 'কম্বোতে আছে একটি ২০০ মিলি হেয়ার অয়েল, একটি ২২৫ গ্রাম হেয়ার পাউডার ও একটি প্রিমিয়াম কাঠের চিরুনি — মাত্র {combo}।' },
        { q: 'ডেলিভারি চার্জ কত?', a: 'কম্বো অর্ডার করলে সারা বাংলাদেশে ডেলিভারি ফ্রি। অন্য অর্ডারে রংপুরের ভেতরে {dhaka} এবং রংপুরের বাইরে {outside}।' },
        { q: 'পণ্য হাতে পেয়ে টাকা দেওয়া যাবে?', a: 'জি, ক্যাশ অন ডেলিভারি আছে। অনলাইন পেমেন্ট (বিকাশ, নগদ, রকেট ও কার্ড) শীঘ্রই আসছে।' },
        { q: 'কীভাবে অর্ডার করব?', a: 'কার্টে পণ্য যোগ করে হোয়াটসঅ্যাপে আমাদের অর্ডার পাঠান। পূর্ণাঙ্গ অনলাইন চেকআউট শীঘ্রই আসছে।' },
        { q: 'পণ্য কীভাবে ব্যবহার করব?', a: 'প্রতিটি পণ্যের লেবেলে ছাপানো নির্দেশনা অনুসরণ করুন। সাধারণ গাইড উপরের "ব্যবহারবিধি" অংশে আছে।' },
        { q: 'ডেলিভারি পেতে কত সময় লাগে?', a: 'হোয়াটসঅ্যাপে আপনার এলাকার নাম জানান, আমরা আনুমানিক সময় জানিয়ে দেব।' },
        { q: 'আলাদা পণ্য কেনা যাবে?', a: 'জি, হেয়ার অয়েল, হেয়ার পাউডার বা কাঠের চিরুনি আলাদাভাবেও কেনা যায়।' },
      ],
    },
    finalCta: {
      title: 'আজই শুরু করুন আপনার প্রাকৃতিক হেয়ার কেয়ার',
      text: 'কম্বো অফার — হেয়ার অয়েল + হেয়ার পাউডার + ফ্রি কাঠের চিরুনি মাত্র {combo}, সারা বাংলাদেশে ডেলিভারি ফ্রি।',
      cta: 'কম্বো অর্ডার করুন — {combo}',
    },
    footer: {
      about: 'বাংলাদেশের প্রাকৃতিক হেয়ার কেয়ার পণ্য — হেয়ার অয়েল, হেয়ার পাউডার ও কাঠের চিরুনি।',
      links: 'দ্রুত লিংক',
      contact: 'যোগাযোগ',
      deliveryInfo: 'ডেলিভারি',
      rights: 'সর্বস্বত্ব সংরক্ষিত।',
      whatsapp: 'হোয়াটসঅ্যাপ',
    },
    cart: {
      title: 'আপনার কার্ট',
      empty: 'আপনার কার্ট খালি।',
      emptyCta: 'পণ্য দেখুন',
      qty: 'পরিমাণ',
      remove: 'সরান',
      zone: 'ডেলিভারি এলাকা',
      dhaka: 'রংপুরের ভেতরে',
      outside: 'রংপুরের বাইরে',
      subtotal: 'সাবটোটাল',
      delivery: 'ডেলিভারি',
      free: 'ফ্রি',
      total: 'মোট',
      estimate: 'আনুমানিক মোট। অর্ডার দেওয়ার সময় চূড়ান্ত পরিমাণ নিশ্চিত করা হবে।',
      orderWa: 'হোয়াটসঅ্যাপে অর্ডার করুন',
      clear: 'কার্ট খালি করুন',
      giftNote: 'সাথে একটি ফ্রি কাঠের চিরুনি',
      inc: 'পরিমাণ বাড়ান',
      dec: 'পরিমাণ কমান',
      continue: 'কেনাকাটা চালিয়ে যান',
    },
    sticky: { label: 'কম্বো অফার', cta: 'অর্ডার করুন' },
    wa: {
      greeting: 'হ্যালো! আমি বিউটি অর্গানিক হেয়ার অয়েল সম্পর্কে জানতে চাই।',
      orderIntro: 'হ্যালো! আমি অর্ডার করতে চাই:',
      area: 'ডেলিভারি এলাকা',
      support: 'হ্যালো! আমি বিউটি অর্গানিক হেয়ার অয়েল সম্পর্কে আমার মতামত জানাতে চাই।',
    },
    a11y: { skip: 'মূল অংশে যান', whatsappFloat: 'হোয়াটসঅ্যাপে আমাদের সাথে কথা বলুন', language: 'ভাষা পরিবর্তন' },
    stock: { out: 'স্টকে নেই', low: 'আর অল্প কয়েকটি আছে' },
    load: { loading: 'লোড হচ্ছে…', errorTitle: 'দোকান লোড করা যায়নি', errorText: 'আপনার ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন, অথবা সরাসরি হোয়াটসঅ্যাপে অর্ডার করুন।', retry: 'আবার চেষ্টা করুন' },
  },
};
