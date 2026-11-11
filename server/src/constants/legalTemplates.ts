/**
 * DRAFT legal templates, shown only until the owner writes (or approves) their own text in Admin → Website → Legal pages.
 *
 * They are deliberately generic and contain NO registrations, licence numbers, certifications, medical claims or
 * guarantees. They must be reviewed by the owner (and ideally a lawyer) before being treated as final.
 *
 * Tokens {{like_this}} are filled from the owner's settings when a page is served. A line that starts with
 * `?token|` is kept (without that prefix) only when the token has a value, so missing details never leave blanks.
 */
export const LEGAL_SLUGS = ['privacy', 'terms', 'refund', 'shipping'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_TITLES: Record<LegalSlug, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  refund: 'Return & Refund Policy',
  shipping: 'Shipping & Delivery Policy',
};

const contact = `## Contact us
{{businessName}}
?address|Address: {{address}}
?phone|Phone: {{phone}}
?whatsapp|WhatsApp: {{whatsapp}}
?email|Email: {{email}}
`;

export const LEGAL_TEMPLATES: Record<LegalSlug, string> = {
  privacy: `# Privacy Policy

Last updated: {{updated}}

{{businessName}} ("we", "us") respects your privacy. This page explains what information we collect when you use our website and why.

## What we collect
- **Order details:** your name, mobile number, delivery address and (optionally) email, so we can confirm, deliver and support your order.
- **Payment details you give us:** for bKash, Nagad, Rocket or bank transfer we keep the transaction ID and reference you enter. We never ask for, see or store card numbers or PINs.
- **Messages:** what you write in the contact form.
- **Reviews:** the rating and text you submit after receiving an order.
- **Technical data:** basic information such as your browser type, used to keep the website secure.

## Cookies and tracking
We only use analytics and advertising tools (for example Google Analytics and Meta Pixel) **if you accept them** in the cookie banner. If you decline, they are not loaded. You can change your choice at any time using "Cookie settings" at the bottom of the website. Without your consent we only store what the shop needs to work (your cart and language choice) on your own device.

## How we use your information
To process and deliver orders, confirm payments, answer your messages, prevent fraud and improve the website. We do not sell your personal information.

## Who we share it with
Only with people who help us fulfil your order — for example a courier, who needs your name, phone number and address — and where the law requires it.

## How long we keep it
Order records are kept for as long as needed for accounting, returns and legal obligations. You may ask us to correct or delete your information (where the law allows) using the contact details below.

## Your choices
You can ask what we hold about you, ask us to correct it, or withdraw your cookie consent at any time.

${contact}
This policy is a draft template pending review by the shop owner.
`,
  terms: `# Terms & Conditions

Last updated: {{updated}}

By ordering from {{businessName}} you agree to these terms.

## Orders
- Prices are shown in Bangladeshi Taka (BDT) and are confirmed again when you place your order.
- An order is accepted when we confirm it with you (we usually do this on WhatsApp). We may decline or cancel an order, for example if an item is out of stock or the details cannot be verified; we will tell you and refund any payment received.
- Please give a correct name, mobile number and full address so that the courier can reach you.

## Payment
- **Cash on Delivery:** pay the delivery person when the parcel arrives.
- **bKash / Nagad / Rocket / bank transfer:** send the exact amount to the account shown at checkout and enter the transaction ID. Your order is treated as paid only after we have checked the payment in our own account.

## Products
We describe our products carefully and use cautious wording. Results from hair-care products vary from person to person. Please read the label, do a patch test first and stop using a product if you have a reaction.

## Delivery, returns and refunds
See our Shipping & Delivery Policy and Return & Refund Policy.

## Reviews
Only customers who received an order can leave a review. We may remove reviews that are abusive or unrelated to the product.

## Changes
We may update these terms. The date at the top shows the latest version.

${contact}
This document is a draft template pending review by the shop owner.
`,
  refund: `# Return & Refund Policy

Last updated: {{updated}}

We want you to be happy with your order.

## Returns
{{returnWindow}}
- Please keep the product and its packaging, and contact us first so we can arrange the return.
- If the parcel arrives damaged or you receive the wrong item, tell us as soon as possible with a photo so we can fix it.

## Cancelling an order
You can ask to cancel an order before it ships, from the "Track order" page or by message. We will confirm the cancellation.

## Refunds
- If you paid in advance (bKash, Nagad, Rocket or bank transfer) and your order is cancelled or returned, we send the refund back to the account you paid from and record it.
- For Cash on Delivery orders that are returned after payment, we will agree a refund method with you.
- We will tell you when the refund has been sent. Your bank or mobile wallet may need a little time to show it.

${contact}
This policy is a draft template pending review by the shop owner.
`,
  shipping: `# Shipping & Delivery Policy

Last updated: {{updated}}

We deliver across Bangladesh by courier.

## Delivery charges
{{deliveryTable}}
?comboFree|{{comboFree}}

## Delivery time
?deliveryTime|{{deliveryTime}}
Delivery times can vary with location, weather and courier availability. We will contact you if there is a delay.

## Before delivery
We confirm your order with you first (usually on WhatsApp). Please keep your phone nearby and your address accurate. If we cannot reach you or the address cannot be found, the parcel may be returned.

## Tracking
You can follow your order on the "Track order" page using your order number and phone number.

${contact}
This policy is a draft template pending review by the shop owner.
`,
};
