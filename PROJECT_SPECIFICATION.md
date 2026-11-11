# PROJECT_SPECIFICATION.md — Beauty Organic Hair Oil E-Commerce Platform

> Primary source of truth for business and technical requirements.
> Version 1.0 · Status: Planning (no code written yet)
> Companion file: `CLAUDE.md` (development rules). If the two ever conflict, stop and ask the owner.

---

## 0. Brand Assets Provided

Stored in `docs/brand-assets/` (originals; optimized copies go to Cloudinary during Phase 4).

| File | Content | Intended use |
|---|---|---|
| `hair-oil-bottle.jpg` | Dark glass/plastic bottle, flip-top black cap, cream label "Beauty Organic Hair Oil", woman in red outfit holding a red flower, neem-style leaf banner, green "Natural" tag | Hero / primary product image |
| `hair-oil-powder-jar.jpg` | Yellow-capped jar of golden-brown herbal powder with matching label and "100% organic" badge | Secondary product image / companion product / ingredients visual |
| `wooden-comb.jpg` | Wide-tooth wooden comb with handle, engraved "Beauty Organic Hair Oil" | Companion/bundle item, gallery, "how to use" visual |
| `lifestyle-products-bougainvillea.jpg` | Hand holding comb, oil bottle and powder jar against pink bougainvillea (portrait, 1536×2048) | Hero/lifestyle banner, combo offer section, social/OG image (crop needed) |
| `combo-box-packaging.jpg` | Open branded cardboard box showing jar, bottle and comb together | Combo offer image — shows exactly what the customer receives; use in offer section and gallery |

Note: in the lifestyle and box photos the bottle and jar have **light-green labels and a clear/white jar cap**, while the first two studio photos show a cream label and a yellow cap. Confirm which is the current packaging, and use one consistent version in hero/offer imagery. The shipping box carries the brand logo.

### 0.0 Brand name and logo (owner confirmed)
- **Business/brand name:** "Beauty Organic Hair Oil" (spelling as printed on the product labels, box and comb; the owner's message wrote it as "beauty hair organic oil" — confirm if a different order is intended).
- **Powder product name shown to customers:** "Hair Powder".
- **Logo:** use the brand mark printed on the labels and shipping box (stylised leaf + woman's profile with the "Beauty Organic Hair Oil" wordmark). It is best seen on `combo-box-packaging.jpg`. Phase 2 will crop it into `client/src/assets/logo.*` and make a transparent-background SVG/PNG. Photo crops are low resolution; if the owner has the original logo file (AI/PDF/PNG), it replaces the crop. Logo stays admin-replaceable via Business Settings.

### 0.1 Confirmed Business Data (provided by owner — "Fixed")

These values are **seed data only**. They must be stored in the database/admin settings, never hardcoded in code.

| Item | Value (BDT) | Notes |
|---|---|---|
| Hair Oil (single) | ৳550 | The bottle in `hair-oil-bottle.jpg`. **Size: 200 ml** (confirmed). |
| Hair Powder (single; owner's list calls it "Hair pack") | ৳500 | The jar in `hair-oil-powder-jar.jpg`. **Net weight: 225 g** (confirmed). |
| Wooden comb (single) | ৳150 | `wooden-comb.jpg`, engraved "Beauty Organic Hair Oil". |
| **Combo offer: Oil + Powder + free premium wooden comb** | **৳999** | Running offer. **Free home delivery all over Bangladesh.** |
| Delivery inside Dhaka | ৳60 | Default zone. Always charged unless the order contains the combo. |
| Delivery outside Dhaka | ৳120 | Default zone. |
| WhatsApp / contact number | 01857164863 | International format for `wa.me`: `8801857164863`. Used for the WhatsApp CTA and support. |

**Combo mechanics (implementation rules):**
- The combo is a **Bundle product** (SKU e.g. `COMBO-OIL-POWDER`) with fixed price ৳999 and component items: 1× Hair Oil, 1× Hair Powder, 1× Wooden Comb (gift line, ৳0). Stock for the combo is derived from the **minimum available stock of its components**; ordering a combo decrements each component atomically (Spec §12 inventory rules).
- The bundle has a flag `freeDelivery = true`; any order containing the combo has delivery fee ৳0 in every zone (server-side rule, not a client coupon).
- Savings display must be computed, not typed: separate price oil+pack = ৳1,050; combo ৳999 saves ৳51 **plus** a free ৳150 comb and free delivery (৳60/৳120). Show "worth ৳X" only from real computed values.
- Offer has an admin-editable on/off switch and optional end date (no fake countdowns).
- Delivery for non-combo orders: ৳60 inside Dhaka, ৳120 outside Dhaka, **always charged — no free-delivery threshold** (owner confirmed). Free delivery applies only to orders containing the combo.
- Landing page hero/offer sections lead with the ৳999 combo as the primary offer, with single-item purchase options (oil ৳550, pack ৳500, comb ৳150) available. Because three products are sold, `multiProductCatalogEnabled` is **on** at launch and the cart must support multiple line items (the "single-product" landing page now features one hero offer plus add-on items).
- Customer messaging (Bangla, from owner): "কম্বো অফার চলতেছে ৯৯৯ টাকায়, পুরো বাংলাদেশে হোম ডেলিভারি ফ্রি, সাথে থাকবে একটা প্রিমিয়াম কাঠের চিরুনি" — use as the basis of the announcement bar and hero offer copy. **Bangla copy is therefore required at launch** (resolves open question 4: Bangla + English).

**Observations that affect the design (must be confirmed with the owner, see §22):**
1. The photos show **three physical items** (oil, powder, comb). Owner confirmed (§0.1): all three are sold individually, and a ৳999 combo bundles oil + powder + a free comb. The catalogue is multi-product with bundle support from day one.
2. Label shows a **"100% organic"** badge and "Natural" tag. These are marketing claims; the site must not repeat them as certified facts unless the owner confirms substantiation (see §16).
3. The label features a **model's photograph**. Confirm the owner holds usage rights for web advertising.
4. Product images have white backgrounds with soft shadows, suitable for cream-background placement; some have cut-out edges that must be re-processed (clean background removal) for premium presentation.
5. Net volume/size, ingredient list, and batch/expiry info are **not legible** in the photos and must be supplied by the owner.

---

## 1. Project Overview

### 1.1 Project name
**Beauty Organic Hair Oil — Online Store** (working repo name: `beauty-organic-store`).

### 1.2 Business description
A direct-to-consumer online store selling premium organic hair oil in Bangladesh, with the ability to add companion products (herbal hair powder, wooden comb, bundles) and future products without re-architecture.

### 1.3 Business objectives
- Sell the product online with a frictionless mobile checkout (majority of Bangladeshi traffic is mobile, often from Facebook/Instagram ads).
- Support Cash on Delivery (dominant payment method in Bangladesh) and manual prepaid payments (bKash/Nagad/Rocket send-money and bank transfer, verified by an admin).
- Give the owner a complete admin dashboard to run daily operations without a developer.
- Build trust (reviews, clear policies, WhatsApp support, order tracking).
- Enable tracked marketing (Meta Pixel, GA4, coupons).

### 1.4 Target audience
- Women and men aged 18–45 in Bangladesh, urban and semi-urban, interested in natural/herbal hair care (hair fall, dryness, dandruff, growth).
- Primarily mobile users on mid-range Android devices and variable 4G connections; Bangla-speaking with English literacy varying.
- Gift buyers.

### 1.5 Target market
Bangladesh (all 64 districts). Language: **English at launch with a Bangla-ready i18n structure**; Bangla content for the landing page is a recommended Phase 2 deliverable (confirm in §22).

### 1.6 Currency
**BDT (৳)**. All money fields are stored as **whole-taka integers** (no floats). Format with the shared money helper only. If fractional taka (e.g., percent discounts) arise, round to the nearest taka using one shared rounding helper.

### 1.7 Business model
B2C direct sales; revenue from product sales; delivery fee charged to customers per zone; coupons and promotional pricing used for conversion.

### 1.8 Project scope
**In scope:** public storefront/landing page, product pages, cart, checkout, COD and manual prepaid payments (bKash/bank) with admin verification, order lifecycle, tracking, reviews, coupons, admin dashboard, notifications (email, SMS, WhatsApp link), SEO, analytics, legal pages, testing, deployment.

**Out of scope (v1):** native mobile apps, multi-vendor marketplace, courier API auto-booking (designed as extension point), multi-currency, subscription billing, loyalty points.

### 1.9 Success criteria
- A real customer can find the site, order via COD or online payment on a phone in **< 2 minutes**, and receive confirmation.
- Admin can manage products, stock, orders, payments, reviews, coupons, and content without code changes.
- Lighthouse (mobile): Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95, Best Practices ≥ 90.
- No prepaid order can be marked paid without an admin verifying the real payment.
- Zero oversells under concurrent purchase tests.

---

## 2. Business Requirements

### 2.1 Single-product commerce, scalable catalogue
- The launch storefront is a **conversion-focused single-product landing page** with the Hair Oil as the featured product.
- Data model, APIs, and admin are **multi-product from day one** (Product, Category, variants by size). Adding a product = admin action, not a code change.
- `WebsiteSettings.featuredProductId` determines which product the landing page showcases. Additional products render at `/products` and `/products/:slug` once enabled (feature flag `multiProductCatalogEnabled`, default off).
- Companion items (powder, comb) are configured as add-on/cross-sell items on the cart/checkout ("Add a wooden comb for ৳X") and as optional bundles.

### 2.2 Product presentation
High-quality gallery, benefits, ingredients, usage, reviews, FAQs; price with strike-through discount; stock badge; size selector when variants exist.

### 2.3 Shopping experience
Add to cart opens a slide-over cart drawer; sticky mobile "Order Now" bar; "Buy Now" shortcut goes straight to checkout; persistent cart; no mandatory account.

### 2.4 Customer checkout
Guest checkout is default. Optional account (phone/email + password) for history. One-page checkout with inline validation and live totals.

### 2.5 Online payments
Manual prepaid payments: bKash/Nagad/Rocket send-money and bank transfer, verified by an admin against the real account (no payment gateway — owner decision 2026-11-11).

### 2.6 Cash on Delivery
Default and prominent option. Optional admin-configurable rules: COD enabled/disabled, max COD order value, phone verification (OTP) for high-risk orders (post-launch option), partial advance payment (post-launch option).

### 2.7 Order management
Full lifecycle with 8 statuses, status history, admin notes, invoice, cancellation and return workflows.

### 2.8 Customer communication
Order confirmation page, email (if provided), SMS (configurable provider), WhatsApp click-to-chat (and optionally WhatsApp Business API later), status-change notifications.

### 2.9 Product inventory
Per-product (and per-variant) stock, low-stock threshold, atomic decrement, reservation during online payment, restore on cancel/fail/return.

### 2.10 Marketing and promotions
Coupons (percent/fixed/free-delivery), promotional offer banners, announcement bar, bundle pricing, Meta Pixel + GA4 events, UTM capture on orders, SEO.

---

## 3. Technology Stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | **React.js + Vite** | SPA rendering, fast dev/build |
| | **TypeScript** | Type safety across UI and shared types |
| | **Tailwind CSS** | Utility styling, design tokens in `tailwind.config` |
| | **React Router** | Routing (public, account, admin) with lazy-loaded routes |
| | **Framer Motion** | Subtle section/entrance animations; respects `prefers-reduced-motion` |
| | **React Hook Form + Zod** | Forms and schema validation (schemas shared with backend where practical) |
| | **Lucide React** | Icon set |
| | TanStack Query *(recommended addition)* | Server-state caching; **requires owner approval as an extra dependency** — otherwise use plain fetch hooks |
| | Zustand *(recommended)* or Context | Cart/UI client state |
| | react-helmet-async | Per-route meta tags |
| Backend | **Node.js + Express.js + TypeScript** | REST API, business logic |
| | Zod | Request validation |
| | Pino | Structured logging |
| Database | **MongoDB + Mongoose** | Persistence, schemas, validation, indexes; **replica set (Atlas)** so multi-document transactions are available |
| Auth | **JWT**, **bcrypt** (implemented with `bcryptjs`, the pure-JS bcrypt — identical hashes, no native build), RBAC | Access token (short-lived) + refresh token in httpOnly cookie; roles `customer`, `staff`, `admin`, `superadmin` |
| Images | **Cloudinary** | Upload (signed, admin only), transformations, CDN delivery (`f_auto,q_auto`) |
| Payments | **Manual** (COD, bKash/Nagad/Rocket, bank transfer) | Admin-verified; no gateway |
| Email | Configurable provider (Resend / SendGrid / SMTP via Nodemailer) | Transactional email via provider adapter |
| SMS | Configurable provider adapter (e.g., a Bangladesh gateway) | OTP/status SMS; provider chosen by owner |
| WhatsApp | `wa.me` click-to-chat links (v1); Business API optional later | Support and order confirmation links |
| Analytics | **GA4**, **Meta Pixel** (+ optional Conversions API) | Measurement, ad optimization, consent-gated |
| Testing | Vitest, React Testing Library, Supertest, mongodb-memory-server (replica set mode), Playwright | See §17 |
| Tooling | ESLint, Prettier, Husky + lint-staged | Quality gates |

**Repo structure (monorepo, npm workspaces):**
```
/client          React app
/server          Express API
/shared          Shared Zod schemas/types/constants (optional package)
/docs            Brand assets, API docs
PROJECT_SPECIFICATION.md  CLAUDE.md  DEVELOPMENT_PROGRESS.md
```

---

## 4. UI/UX Design Requirements

### 4.1 Brand identity
Premium organic beauty: calm, natural, warm, trustworthy. Cream backgrounds, deep forest green anchors, golden accents, leaf motif drawn from the label (neem/herbal leaves), soft organic shapes. Avoid clinical or cheap "discount store" look.

### 4.2 Color tokens
| Token | Hex | Usage |
|---|---|---|
| `forest` | `#234B35` | Primary buttons, headings accents, footer |
| `sage` | `#A8B99A` | Secondary surfaces, dividers, badges |
| `cream` | `#FAF7EF` | Page background |
| `gold` | `#C6A46A` | Accents, highlights, stars, price emphasis |
| `charcoal` | `#252525` | Body text |
| `white` | `#FFFFFF` | Cards, inputs |

Contrast rules: body text charcoal on cream (≥ 12:1); white on forest (≥ 9:1). **Gold on cream must not be used for small text** (fails WCAG AA); use gold for decorative elements, large text, or on forest background. Add semantic tokens: success (derived from forest), warning, error (a muted red such as `#B3261E`), info.

### 4.3 Typography
- Headings: **Playfair Display** (600/700). Body/UI: **Inter** (400/500/600).
- Bangla text fallback font: *Hind Siliguri* or *Noto Sans Bengali* (loaded only if Bangla enabled).
- Fluid scale: h1 `clamp(2.25rem, 5vw, 4rem)`, h2 `clamp(1.75rem, 3.5vw, 2.75rem)`, body 16px min (never below 16px in inputs, to prevent iOS zoom).
- Self-host or `font-display: swap` with preconnect; subset fonts.

### 4.4 Design principles
Premium beauty branding · mobile-first · elegant product presentation · generous whitespace (8px spacing scale) · conversion-focused (one primary CTA per viewport) · accessible (WCAG 2.1 AA, visible focus, ≥ 44px touch targets, labels, aria, keyboard navigation) · smooth but restrained animation (150–400ms, reduced-motion respected) · consistent components (Button, Card, Badge, Input, Select, Modal/Drawer, Toast, Accordion, Rating, Skeleton, EmptyState, ErrorState).

### 4.5 Responsive behavior
| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | < 640px | Single column; hamburger menu; sticky bottom CTA bar (Order Now + WhatsApp); cart as full-height drawer; gallery swipe carousel; accordions for FAQ/ingredients |
| Tablet | 640–1023px | 2-column grids; hero stacked with larger imagery; inline nav collapses to menu if needed |
| Desktop | ≥ 1024px | Full nav; hero two-column (copy left, product right); 3–4 column benefit grids; sticky order summary on checkout; hover states |

Test widths: 360, 390, 414, 768, 1024, 1280, 1536. No horizontal scroll at any width.

---

## 5. Landing Page Requirements

**Global CTA behavior:** Primary CTA "Order Now" → scrolls to/opens the quick order (add to cart + go to `/checkout`). Secondary CTA "Add to Cart" → adds item and opens cart drawer. WhatsApp CTA → `https://wa.me/<number>?text=<prefilled>`. If out of stock, CTAs become "Notify Me / Out of Stock" and checkout is blocked. All CTAs fire analytics events (§15).

All copy is editable in admin (Content Management) with sensible defaults; no hardcoded business facts.

### 5.1 Announcement bar
- **Purpose:** Surface promo/delivery/COD message.
- **Content:** Short text, optional link, expiry date. e.g. "Free delivery over ৳X · Cash on Delivery available" (values from settings).
- **UI:** Forest background, cream text, dismissible (remembered in localStorage).
- **Interactions:** Optional rotating messages; link to offer section.
- **Responsive:** Single line truncated on mobile; centered on desktop.

### 5.2 Navigation bar
- **Purpose:** Orientation and quick access.
- **Content:** Logo, anchors (Benefits, Ingredients, How to Use, Reviews, FAQ), Track Order, Cart icon with count, Order Now button.
- **UI:** Sticky, cream/blur background, shrinks on scroll.
- **Interactions:** Smooth scroll with active-section highlight; cart opens drawer.
- **Responsive:** Mobile hamburger drawer; cart icon always visible.

### 5.3 Hero section
- **Purpose:** Communicate value and drive first action.
- **Content:** Headline, subheadline, product image (bottle), price with discount, rating summary, 2 CTAs, 3 mini trust points.
- **UI:** Cream background with subtle leaf motif; product on soft sage circle; price badge.
- **Interactions:** Gentle float/fade-in; CTA buttons; image zoom on hover (desktop).
- **Responsive:** Mobile: image first then copy, CTA full width; desktop: two columns.

### 5.4 Trust indicators
- **Purpose:** Reduce purchase anxiety.
- **Content (editable):** Cash on Delivery, Nationwide delivery, Easy returns window (per policy), Secure payment, Customer support on WhatsApp. **Do not display certifications/"dermatologically tested"/"100% organic" unless owner provides substantiation.**
- **UI:** Icon row with Lucide icons. **Responsive:** 2-col grid mobile, 5-col row desktop.

### 5.5 Product introduction
- **Purpose:** Explain what the product is and the brand story.
- **Content:** Description, size, key attributes, brand story paragraph, product photo set (bottle + optional powder/comb).
- **UI:** Image/text split, "Read more" collapse on mobile.

### 5.6 Product benefits (note: sections 5.5–5.14 follow the numbered list in the brief; 5.15 is extra)
- **Purpose:** Persuade with outcomes (phrased as customary use claims, not medical claims; no guaranteed results).
- **Content:** 4–6 benefit cards (icon, title, one-line text), admin editable.
- **Interactions:** Staggered reveal. **Responsive:** 1 → 2 → 3 columns.

### 5.7 Ingredients
- **Purpose:** Transparency.
- **Content:** Ingredient cards from `Ingredient` collection (name, Bangla name optional, image, description). Only owner-supplied ingredients shown.
- **Interactions:** Tap/hover to expand; link to product detail. **Responsive:** Horizontal scroll-snap on mobile; grid on desktop.

### 5.8 How to use
- **Purpose:** Build confidence and show correct use.
- **Content:** 3–5 numbered steps, usage frequency, precautions (patch test advice, keep away from eyes), optional short video.
- **UI:** Stepper/timeline; comb photo can illustrate application.
- **Responsive:** Vertical timeline mobile; horizontal desktop.

### 5.9 Product gallery
- **Purpose:** Visual proof and product detail.
- **Content:** Product images (bottle, jar, comb, lifestyle), admin-managed order.
- **Interactions:** Thumbnail switch, swipe, lightbox with keyboard support, lazy loading.
- **Responsive:** Swipe carousel mobile; thumbnail strip + large image desktop.

### 5.10 Customer reviews
- **Purpose:** Social proof.
- **Content:** Approved reviews only: rating, name, text, date, verified-purchase badge, optional photo; average rating and distribution; "Write a review" form (verified buyers via order ID + phone, or moderated open submission).
- **Interactions:** Pagination/"load more", submission → pending moderation.
- **Responsive:** Carousel mobile; grid desktop. **No fabricated reviews** — seed content must be real and owner-provided.

### 5.11 Promotional offers
- **Purpose:** Create urgency and raise AOV.
- **Content:** Active offers (e.g., bundle "Oil + Comb"), coupon code with copy button, optional countdown only when a real end date is set.
- **Interactions:** "Apply code" auto-applies to cart. **Responsive:** Stacked cards mobile; side-by-side desktop.

### 5.12 FAQ
- **Purpose:** Handle objections and cut support load.
- **Content:** Accordion list editable in admin (delivery time, COD, returns, usage, ingredients, authenticity). FAQPage structured data.
- **Interactions:** Accessible accordion (`aria-expanded`), one open at a time. **Responsive:** Full width, max 800px.

### 5.13 Final call to action
- **Purpose:** Capture visitors who scrolled the whole page.
- **Content:** Strong headline, price, guarantee/return line (per policy), Order Now + WhatsApp buttons.
- **UI:** Forest background, cream text, gold button. **Responsive:** Stacked buttons on mobile.

### 5.14 Footer
- **Purpose:** Navigation, trust, legal.
- **Content:** Logo, short brand text, quick links, policy links, contact (phone, email, address, WhatsApp), social links, payment method icons (only enabled ones), copyright.
- **Responsive:** Accordion columns mobile; 4 columns desktop.

### 5.15 Persistent mobile elements
Sticky bottom bar (price + Order Now), floating WhatsApp button (not overlapping sticky bar), cookie consent banner.

---

## 6. Product Management

All fields editable from admin with validation and image upload (Cloudinary).

| Field | Rules |
|---|---|
| Name | Required, 2–120 chars |
| Slug | Auto-generated, unique, editable |
| Short & long description | Rich text (sanitized HTML or Markdown) |
| Images | Multiple; ordered; alt text required; primary flag; Cloudinary public_id + URL |
| Size / variants | e.g. `100 ml`, `200 ml`; each with own SKU, price, stock |
| Ingredients | References to Ingredient documents + display order |
| Regular price | Integer BDT ≥ 0 |
| Discount price | Optional; must be < regular price; optional start/end date |
| Inventory | Integer ≥ 0; low-stock threshold |
| SKU | Required, unique |
| Stock status | Derived: `in_stock`, `low_stock`, `out_of_stock`; admin may force "out of stock" or enable backorder |
| Visibility | `draft`, `published`, `hidden` (published products only on storefront) |
| Category | Reference |
| SEO | Meta title/description, OG image |
| Companion/cross-sell | List of related product IDs |
| Max quantity per order | Optional |

Soft-delete (archive) instead of hard-delete when orders reference the product. Orders store a **snapshot** of name/price/SKU.

---

## 7. Shopping Cart

- **Add/remove/update quantity:** Min 1, max = min(stock, maxPerOrder).
- **Persistence:** Client cart in localStorage keyed by product/variant ID and quantity only (never trusted for price). Logged-in users: cart synced to server (optional v1.1). Cart expires after 30 days.
- **Server pricing:** `POST /api/cart/quote` returns authoritative lines, subtotal, discount, delivery fee, total, and warnings (price changed, stock reduced, item unavailable). The UI always displays server quote values.
- **Coupon:** Apply/remove code; validation messages (expired, min order, usage limit, not applicable).
- **Delivery charge:** Shown after district is selected; before that show "calculated at checkout" or the default zone fee.
- **Stock validation:** On add, on quantity change, on quote, and again atomically at order creation.
- **Empty state:** Friendly message + CTA to product.
- **UI:** Drawer on mobile/desktop; full `/cart` page available.

---

## 8. Checkout Requirements

### 8.1 Customer information
| Field | Validation |
|---|---|
| Full name | Required, 2–80 |
| Phone | Required, Bangladesh mobile: `^(?:\+?88)?01[3-9]\d{8}$`, normalized to `01XXXXXXXXX` |
| Email | Optional (required if online payment is chosen and provider needs it — fallback placeholder permitted by gateway rules) |
| District | Required, select from the 64 districts |
| City/Thana/Area | Required |
| Full address | Required, 10–300 chars |
| Delivery instructions | Optional, ≤ 300 chars |
| Account creation | Optional checkbox (guest default) |

Autosave form draft locally; autofill support (`autocomplete` attributes).

### 8.2 Order summary
Product (image, name, size), quantity, unit price, subtotal, discount (coupon + product discount shown separately), delivery fee, total. Items editable via quantity stepper.

### 8.3 Delivery configuration
- Seed values: **Inside Dhaka ৳60, Outside Dhaka ৳120**; orders containing the ৳999 combo are **free delivery** everywhere (see §0.1).
- **Inside Dhaka** and **Outside Dhaka** default zones, plus **custom zones** (admin defines name, districts[], fee, free-delivery threshold, estimated days, enabled).
- Zone resolved server-side from selected district. Delivery fee is never accepted from the client.

### 8.4 Payment options
> **Owner decision (2026-11-11): no payment gateway (SSLCOMMERZ and similar are not used).**
- **Cash on Delivery** (default).
- **Manual bKash / Nagad / Rocket (send money):** the owner's number and instructions are shown at checkout; the customer sends money, then submits the TrxID (and sender number). The order stays **Pending** until an admin verifies it against the real account.
- **Manual bank transfer:** bank name, account name, number, branch and instructions shown at checkout; the customer submits the transaction/reference number. Verified by an admin against the bank statement.
- Every method is switched on/off and configured in Admin → Payments (details live in the database). A method cannot be switched on without its details.

### 8.5 Manual payment flow
1. Checkout with a prepaid method creates the order (stock held, `reservationExpiresAt` = 24 h) and a `manual` Payment (`initiated`).
2. The order page shows the account details and a form for TrxID / reference (+ sender number or name). Submitting sets the payment to `pending` and stops the expiry timer; **nothing is marked paid**.
3. The order cannot be processed while unpaid (`PAYMENT_REQUIRED`).
4. An admin checks the real bKash/bank record, then **Verifies** (order + payment become `paid` in one transaction) or **Rejects** (customer may resubmit within 24 h). Unclaimed orders expire and release stock.
5. Refunds the owner has already sent are *recorded* (partial or full; never above the amount paid).
Payment history keeps every event with time and actor.

### 8.6 Payment statuses
`initiated`, `pending` (claim submitted, awaiting verification), `paid` (shown as **Verified**), `failed`, `cancelled`, `expired`, `refund_pending`, `refunded`, `partially_refunded`, `cod_pending`, `cod_collected`.

### 8.7 Error handling
Customer submits a wrong or fake transaction ID → stays Pending, admin rejects, customer may resubmit; nothing is marked paid by a claim; customer never submits → expiry job releases the stock after 24 h; all payment events logged with actor and time.

### 8.8 Duplicate protection
- Unique index on `Payment.tranId`; unique idempotency key on order submission (client-generated UUID stored with the order, TTL).
- Callback/IPN handlers are **idempotent**: if Payment already `paid`, return success without re-applying stock or notifications. Use atomic `findOneAndUpdate` with a status precondition.
- Disable the submit button after click; server rejects duplicate orders from same phone + same cart within a configurable window (default 2 minutes) unless idempotency key differs and the customer confirms.

### 8.9 COD flow
Create order `pending`/`cod_pending`; deduct stock atomically; send confirmation; admin confirms (optionally after phone call).

---

## 9. Order Management

- **Order ID:** Human-friendly unique `HO-YYMMDD-XXXX` (4–5 char base32 random, collision-checked) or sequential counter via an atomic `counters` collection. Internal `_id` is never exposed as the public identifier.
- **Creation:** Server only; recalculates everything; snapshots product/price; stores UTM/source, IP hash, user-agent.
- **Confirmation:** Order success page + email/SMS/WhatsApp link; admin confirm action.
- **Payment status:** See §8.6.
- **Order statuses:** `pending → confirmed → processing → shipped → out_for_delivery → delivered`; plus `cancelled`, `returned`. Allowed-transition map enforced server-side; every change recorded in `statusHistory` (status, by, at, note).
- **Customer info:** Snapshot on the order (not just a reference).
- **Inventory:** Decrement at creation (COD) or confirm payment (online, via reservation); restore on `cancelled`; restore on `returned` only if admin marks item as restockable.
- **Cancellation:** Customer may request cancellation before `shipped` (creates a request); admin approves; paid orders move to `refund_pending`.
- **Returns:** Return request within policy window (admin-configurable), reason, photos optional; admin approves → pickup → `returned` → refund (sent by the owner, then recorded in Admin → Payments) → restock decision.
- **Invoice:** PDF invoice generated server-side (pdfkit or similar) with business details from settings, order lines, totals, payment method/status; downloadable by admin and by customer via tracking verification.
- **Courier:** Fields for courier name, tracking number, consignment ID; API integration (Pathao/Steadfast/RedX) is an extension point, not v1.

---

## 10. Customer Features

- **Order tracking:** `/track` with **Order ID + phone number**. The API returns the same generic "not found" message when either is wrong (no enumeration), applies strict rate limiting (e.g., 5/min/IP), and returns only limited fields (status timeline, items, delivery area, courier tracking) — no full address/email.
- **Order confirmation:** Page + email/SMS/WhatsApp.
- **Order history:** For logged-in customers.
- **Reviews:** Verified-buyer submission (Order ID + phone) or logged-in; moderated.
- **Contact support:** Contact form (stored + emailed), phone, email.
- **WhatsApp:** Click-to-chat with prefilled message including order number.
- **Notifications:** Order placed, confirmed, shipped, out for delivery, delivered, cancelled; payment received/failed. Channel preferences per settings; failures logged and retried; provider adapters (`EmailProvider`, `SmsProvider`).

---

## 11. Admin Dashboard

Route `/admin` (separate lazy-loaded bundle), protected; roles: `superadmin`, `admin` (all), `staff` (orders/inventory/reviews, no settings/users/exports of PII, per permission matrix).

### 11.1 Analytics
Revenue (today/7d/30d/custom), orders count by status, customers (new/returning), pending orders, completed orders, recent sales, best-selling products, sales chart, conversion-related counts, low-stock alerts, COD vs online split. Only confirmed/delivered revenue counts as "revenue" (documented definition).

### 11.2 Management modules
| Module | Capabilities |
|---|---|
| Products | CRUD, images, variants, visibility, SEO |
| Inventory | Stock adjust with reason and log, low-stock alerts, movement history |
| Orders | List, detail, status change, notes, assign courier, print invoice, cancel/return handling |
| Customers | List, detail, order history, notes, block flag |
| Payments | Payment list, filters, verify manual MFS, mark needs_review, refund records, reconciliation |
| Reviews | Approve/reject/delete/reply, feature on landing page |
| Coupons | CRUD, usage stats |
| Content | Announcement bar, hero, benefits, FAQ, how-to steps, gallery, offers, trust badges, footer, legal pages |
| Delivery | Zones, fees, free threshold, ETA |
| Business settings | Name, logo, phone, email, address, WhatsApp, social, payment toggles, notification toggles, currency format, order prefixes |
| SEO | Default meta, per-page meta, OG image, robots, analytics IDs |
| Users/Staff | Create staff, roles, disable (superadmin only) |
| Audit log | Read-only view of sensitive actions |

### 11.3 Common table features
Server-side search, filters (status, date range, payment method, district), sorting, pagination (default 20), CSV export (orders, customers, payments, inventory; PII export restricted by role and logged).

---

## 12. Database Architecture

MongoDB via Mongoose. Common: `timestamps: true`, `strict: true`, `toJSON` transform to remove `__v` and sensitive fields. Money = integer BDT. Use `Types.ObjectId` references.

### 12.1 User
| Field | Type | Rules |
|---|---|---|
| name | String | required, trim, 2–80 |
| email | String | lowercase, unique sparse, email format |
| phone | String | required, unique, BD format normalized |
| passwordHash | String | `select: false` |
| role | String | enum `customer` (default) |
| isActive | Boolean | default true |
| emailVerified / phoneVerified | Boolean | default false |
| lastLoginAt | Date | |
| addresses | → Address[] | |
Indexes: `{email:1}` unique sparse; `{phone:1}` unique.

### 12.2 Admin
| Field | Type | Rules |
|---|---|---|
| name, email, passwordHash (`select:false`) | String | email unique, required |
| role | enum `superadmin | admin | staff` | required |
| permissions | [String] | optional fine-grained |
| isActive | Boolean | |
| failedLoginCount, lockUntil | Number, Date | brute-force lockout |
| refreshTokenHashes | [{hash, expiresAt, userAgent}] | rotation |
| twoFactor (optional) | Object | future |
Separate collection from User to isolate privilege.

### Product
`name`, `slug` (unique), `description`, `shortDescription`, `category` → Category, `images[{url, publicId, alt, isPrimary, order}]`, `variants[{sku (unique), label (e.g. "100 ml"), sizeValue, sizeUnit, regularPrice, discountPrice, discountStart, discountEnd, stock, reservedStock, lowStockThreshold, isActive}]`, `ingredients[{ingredient → Ingredient, order}]`, `benefits[{title, text, icon}]`, `howToUse[{step, text}]`, `type` enum `simple|bundle` (default `simple`), `bundleItems[{product, sku, quantity, isGift}]` (bundle only; stock derived from components), `freeDelivery` Boolean (bundle/product grants ৳0 delivery), `visibility` enum, `forceOutOfStock`, `allowBackorder`, `maxPerOrder`, `relatedProducts[]`, `seo{title, description, ogImage}`, `ratingAverage`, `ratingCount`, `soldCount`, `isFeatured`, `deletedAt`.
Validation: discountPrice < regularPrice; stock ≥ 0 and `reservedStock ≤ stock` (enforced in update filters).
Indexes: `{slug:1}` unique; `{"variants.sku":1}` unique; `{visibility:1, isFeatured:1}`; text index on `name, description`.

### Category
`name`, `slug` (unique), `description`, `image`, `parent` → Category, `order`, `isActive`.

### Ingredient
`name` (unique), `nameBn`, `slug`, `description`, `image`, `isActive`, `order`.

### Order
| Field | Type |
|---|---|
| orderNo | String, unique, indexed (public ID) |
| idempotencyKey | String, unique sparse, TTL-cleanable |
| user | → User (optional) |
| customer | {name, phone, email, district, city, address, instructions} snapshot |
| items | [{product, variantSku, name, image, unitPrice, quantity, lineTotal}] snapshot |
| subtotal, productDiscount, couponDiscount, deliveryFee, total | Number ints, ≥ 0 |
| coupon | {code, couponId, discountType, value} snapshot |
| deliveryZone | {zoneId, name} |
| paymentMethod | enum `cod | manual_bkash | manual_nagad | manual_rocket | manual_bank` |
| paymentStatus | enum (see §8.6) |
| payment | → Payment (latest) |
| status | enum of 8 statuses |
| statusHistory | [{status, at, by, note}] |
| courier | {name, trackingNo, consignmentId} |
| cancellation / returnInfo | {requestedAt, reason, status, resolvedBy, restock} |
| notes | admin internal notes |
| source | {utmSource, utmMedium, utmCampaign, referrer} |
| meta | {ipHash, userAgent} |
| reservationExpiresAt | Date |
Indexes: `{orderNo:1}` unique; `{"customer.phone":1, createdAt:-1}`; `{status:1, createdAt:-1}`; `{paymentStatus:1}`; `{user:1}`; `{createdAt:-1}`.

### Payment
`order` → Order (required, indexed), `provider` enum (`manual | cod`), `method` (e.g., `bkash`, `nagad`, `rocket`, `bank`, `cod`), `tranId` (unique), `amount`, `currency` ('BDT'), `status` enum (§8.6), `gatewayResponse` (sanitized, no card data), `ipnReceivedAt`, `validatedAt`, `manual{senderNumber, trxId, submittedAt, verifiedBy, verifiedAt}`, `refunds[{amount, reason, refId, at, by}]`, `events[{type, at, payloadHash}]` for dedupe/audit.
Indexes: `{tranId:1}` unique; `{order:1}`; `{"manual.trxId":1}` unique sparse; `{status:1, createdAt:-1}`.
**Never store card numbers, CVV or PINs.**

### Review
`product` → Product, `order` → Order (optional, for verified), `user`, `name`, `phone` (hashed/hidden), `rating` 1–5, `title`, `comment` (≤ 1000, sanitized), `images[]`, `status` enum `pending|approved|rejected`, `isVerifiedPurchase`, `isFeatured`, `adminReply`.
Indexes: `{product:1, status:1, createdAt:-1}`; unique `{order:1, product:1}` sparse (one review per purchased product).

### Coupon
`code` (unique, uppercase), `type` enum `percent|fixed|free_delivery`, `value`, `maxDiscount`, `minOrderValue`, `startsAt`, `expiresAt`, `usageLimit`, `perCustomerLimit`, `usedCount`, `usedBy[{phone, orderId}]` (or separate redemption collection), `appliesToProducts[]`, `isActive`.
Indexes: `{code:1}` unique; `{isActive:1, expiresAt:1}`. Redemption increments `usedCount` atomically with `usedCount < usageLimit` precondition.

### Address
`user` → User, `label`, `fullName`, `phone`, `district`, `city`, `address`, `isDefault`. Index `{user:1}`.

### Notification
`channel` (email|sms|whatsapp|inapp), `to`, `template`, `payload`, `order`, `status` (queued|sent|failed), `attempts`, `lastError`, `providerMessageId`, `sentAt`. Index `{status:1, createdAt:1}`.

### WebsiteSettings (singleton)
`business{name, legalName, logo, phone, whatsapp, email, address, social}`, `currency`, `announcement{text, link, active, expiresAt}`, `hero`, `trustBadges[]`, `faq[]`, `offers[]`, `footer`, `delivery{zones[{name, districts[], fee, freeOver, etaDays, active}], defaultZone}`, `payments{codEnabled, codMaxAmount, manual{enabled, bkash, nagad, rocket, instructions}, bank{enabled, bankName, accountName, accountNumber, branch, instructions}}`, `orderSettings{reservationMinutes, returnWindowDays, autoConfirm}`, `seo{...}`, `analytics{ga4Id, metaPixelId}`, `legalPages{privacy, terms, refund, shipping}`, `featuredProductId`, `featureFlags`.

### AuditLog (supporting)
`actor`, `role`, `action`, `entityType`, `entityId`, `before`, `after` (redacted), `ip`, `userAgent`, `createdAt`. Append-only; indexed by `{entityType, entityId}` and `{createdAt}`.

### Counter (supporting)
`_id` (name), `seq`. Used for sequential order numbers if chosen.

### Inventory consistency & order–payment relationships
- Stock changes only via `InventoryService` using atomic conditional updates:
  `Product.updateOne({_id, "variants.sku": sku, "variants.$.stock": {$gte: qty}}, {$inc: {"variants.$.stock": -qty}})` — if `matchedCount === 0` → out of stock; never read-then-write.
- Order creation, stock change, coupon redemption, and Payment creation happen inside a **MongoDB transaction** (`session.withTransaction`).
- `InventoryMovement` log (supporting collection): `{product, sku, delta, reason (order|cancel|return|manual|reservation), order, by, at}`.
- Relationships: Order 1—N Payment (attempts; one "current"); Payment N—1 Order; Order N—1 User (optional); Review N—1 Product/Order.
- Invariants: a `paid` Payment's amount equals Order.total; an order never has two `paid` payments; stock never negative.

---

## 13. Backend API Specification

Base: `/api/v1`. JSON. Response envelope: `{ success: boolean, data?: any, error?: { code, message, details? }, meta?: {page,limit,total} }`. Auth: `Bearer <accessToken>` or httpOnly cookie as designed. Common errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `422 BUSINESS_RULE`, `429 RATE_LIMITED`, `500 INTERNAL`.

### 13.1 Authentication
| Method | Endpoint | Purpose | Auth | Body | Response | Errors |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | Customer sign-up | Public | `{name, phone, email?, password}` | `201 {user}` + tokens | 409 duplicate phone/email, 400 |
| POST | `/auth/login` | Customer login | Public | `{identifier, password}` | `{accessToken, user}`; sets refresh cookie | 401 invalid (generic), 429 |
| POST | `/auth/admin/login` | Admin login | Public (strict rate limit) | `{email, password}` | `{accessToken, admin}` | 401, 423 locked, 429 |
| POST | `/auth/refresh` | Rotate tokens | Refresh cookie | — | new access token | 401 |
| POST | `/auth/logout` | Revoke refresh token | Auth | — | `204` | — |
| GET | `/auth/me` | Current profile | Auth | — | `{user}` | 401 |
| POST | `/auth/forgot-password` | Request reset | Public | `{identifier}` | `200` generic | 429 |  
| POST | `/auth/reset-password` | Reset | Token | `{token, password}` | `200` | 400 expired token |

> **Implementation notes (Phase 3):** `/auth/refresh` and `/auth/logout` require the header `X-Requested-With: XMLHttpRequest` (CSRF defence for the httpOnly cookie). Forgot/reset-password are **deferred to Phase 7** because they need the email/SMS providers. Admin-only endpoints implemented so far: `GET/POST /admin/staff`, `PATCH /admin/staff/:id`, `GET /admin/audit-logs` (superadmin only). `GET /health` returns 503 when the database is down.
| PATCH | `/auth/change-password` | Change | Auth | `{current, new}` | `200` | 401, 400 |

### 13.2 Products
| Method | Endpoint | Purpose | Auth | Notes |
|---|---|---|---|---|
| GET | `/products` | List published | Public | query: `page, limit, category, q, sort` |
| GET | `/products/featured` | Landing product | Public | returns product with ingredients, variants, stock status (no exact stock if hidden) |
| GET | `/products/:slug` | Detail | Public | 404 if unpublished |
| GET | `/categories` | List | Public | |
| GET | `/ingredients` | List | Public | |
| POST | `/admin/products` | Create | Admin | full product body; 409 duplicate SKU/slug |
| PUT/PATCH | `/admin/products/:id` | Update | Admin | |
| DELETE | `/admin/products/:id` | Archive | Admin | soft delete |
| POST | `/admin/uploads/sign` | Cloudinary signed params | Admin | returns signature, timestamp, folder, allowed formats; **503 `UPLOADS_NOT_CONFIGURED`** until Cloudinary credentials are set |
| PATCH | `/admin/inventory/:productId/:sku` | Adjust stock | Admin/Staff | `{delta, note}` or `{set, note}` (reason `note` required); 422 if it would go negative or below reserved stock; 409 if stock changed concurrently (set mode) |
| GET | `/admin/inventory`, `/admin/inventory/movements` | Stock levels, movement history | Admin/Staff | paginated, filter by productId/sku |

> **Implementation notes (Phase 4):** Descriptions are stored as **plain text** (no HTML) to remove any stored-XSS surface; rich text can be added later with sanitisation. Stock can only change through the audited inventory endpoint — the product form rejects a `stock` field on update, and new variants start at 0 (creation may set a starting stock, which is logged as a movement). Bundle stock is derived from its components (minimum of `floor(available/qty)`); direct adjustment of a bundle is refused (422). Public catalogue responses are cached for 10 s so admin edits appear within ~10 s, and never include exact stock, only `stockStatus` and a capped `maxQty`. Publishing requires at least one image and one active priced variant. Archive (DELETE) is a soft delete. Category/ingredient delete = deactivate. **Not yet in the admin UI** (API only / later phases): categories screen, related products, benefits & how-to-use editing (Phase 8 content management), restore of archived products.
| CRUD | `/admin/categories`, `/admin/ingredients` | Manage | Admin | |

### 13.3 Cart & checkout
| Method | Endpoint | Purpose | Auth | Body → Response |
|---|---|---|---|---|
| POST | `/cart/quote` | Authoritative pricing | Public | `{items:[{productId, sku, qty}], couponCode?, district?}` → `{lines, subtotal, discount, couponDiscount, deliveryFee, total, warnings[]}`; errors 422 out of stock, invalid coupon |
| POST | `/coupons/validate` | Validate coupon | Public (rate limited) | `{code, items, phone?}` → `{valid, discount, reason?}` |
| GET | `/delivery/zones` | Public zone info | Public | → `{zones, districts[64], codEnabled}` |
> **Implementation notes (Phase 5):**
> - **Quote** returns per-line `unitPrice/regularPrice/lineTotal/qty/maxQty/issue`, `subtotal` (at regular prices), `productDiscount`, `couponDiscount`, `deliveryFee`, `total`, `zone`, `coupon`/`couponError{reason,message}`, `warnings[]`. Accepts `district` (checkout) **or** `zoneKey` (cart drawer). Quantities above stock are clamped with a `STOCK_REDUCED` warning; sold-out/unknown/unpublished items come back `unavailable` and are never priced. Any client-sent price/total/fee is ignored.
> - **Coupon reasons:** `NOT_FOUND, INACTIVE, NOT_STARTED, EXPIRED, MIN_ORDER, LIMIT_REACHED, CUSTOMER_LIMIT, NOT_APPLICABLE`. Percent is floored and capped by `maxDiscount`; fixed never exceeds the subtotal; `appliesToProducts` limits the discount base; a `free_delivery` coupon zeroes the fee. Usage limit is claimed atomically inside the order transaction. *Known limit:* the per-customer limit is checked (not atomically claimed), so two simultaneous orders from the same phone could both pass — the duplicate-order guard makes this very unlikely; a counter-based claim can be added if abuse appears.
> - **Checkout (COD)** — one MongoDB transaction: re-price → verify stock → take stock (conditional update per component; bundles expand into parts incl. the gift; `allowBackorder` takes only what exists) → claim coupon → create Order + COD Payment (`cod_pending`) + movements. Any failure rolls everything back. Error codes: `VALIDATION_ERROR 400`, `ACCOUNT_BLOCKED 403`, `DUPLICATE_ORDER 409 {orderNo}` (resend with `allowDuplicate:true` to confirm), `PRICE_CHANGED 409 {quote}` (when `expectedTotal` ≠ server total), `INSUFFICIENT_STOCK 422 [{productId,sku,requested,available}]`, `COUPON_INVALID 422 {reason}`, `COD_LIMIT 422`, `PAYMENT_METHOD_UNAVAILABLE 422` (online/manual methods until Phase 6), `DELIVERY_NOT_CONFIGURED 503`. **Idempotent replay returns `200` with the original order** (the same key never takes stock twice, even under simultaneous requests).
> - **Order status** (`GET /orders/:orderNo/status?token=`): the checkout response includes a 24 h signed `orderToken` (separate audience/secret; an access token cannot be used). The page receives it in the URL fragment, stores it in sessionStorage and strips it from the address bar. The response omits address, email and full phone.
> - **Order numbers:** `HO-YYMMDD-XXXXX` (Dhaka date, 5 chars from an unambiguous alphabet). **Owner-defined behaviour now live:** inside Dhaka ৳60, outside ৳120, combo ships free (no free-delivery minimum).
> - Admin (read-only): `GET /admin/orders` (search by order no/name/phone, status filter, pagination), `GET /admin/orders/:id`; coupons CRUD `/admin/coupons` (API only; screen in Phase 8). Rate limits: quote 90/min, coupon 15/min, checkout 10/min per IP.

| POST | `/checkout` | Create order | Public/Auth | `{idempotencyKey, items, customer, paymentMethod, couponCode?, manualPayment?, source?}` → COD: `201 {orderNo, status}`; online: `201 {orderNo, gatewayUrl}`; errors 409 duplicate/idempotent replay returns original result, 422 stock, 400 validation |

### 13.4 Orders
| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/orders/my` | Customer history | Customer |
| POST | `/orders/track` | Track by `{orderNo, phone}` | Public, rate limited (generic 404) |
| GET | `/orders/:orderNo/status` | Success-page status (requires short-lived signed `token` returned at checkout, or track credentials) | Token |
| POST | `/orders/:orderNo/cancel-request` | Request cancel `{phone, reason}` | Token/Customer |
| POST | `/orders/:orderNo/return-request` | Return `{phone, reason, items}` | Token/Customer |
| GET | `/admin/orders` | List w/ filters | Admin/Staff |
| GET | `/admin/orders/:id` | Detail | Admin/Staff |
| PATCH | `/admin/orders/:id/status` | `{status, note}`; 422 invalid transition | Admin/Staff |
| PATCH | `/admin/orders/:id` | Edit notes/courier/address | Admin/Staff |
| POST | `/admin/orders/:id/cancel` | Cancel + restock | Admin |
| POST | `/admin/orders/:id/return` | Process return | Admin |
| GET | `/admin/orders/:id/invoice` | PDF | Admin/Staff |
| GET | `/admin/orders/export` | CSV | Admin |

> **Implementation notes (Phase 7):**
> - Statuses move forward only: pending → confirmed → (processing) → shipped → (out_for_delivery) → delivered. Cancelling (before shipping) and returning (shipped/delivered) are separate admin actions with stock/coupon/refund rules; `PATCH /admin/orders/:id/status` rejects anything else (422 `INVALID_TRANSITION`). An unpaid online/manual order cannot be processed (422 `PAYMENT_REQUIRED`).
> - Cancel restores stock (exact movements), sold count and coupon use once; a paid order becomes `refund_pending` (refund is done by hand in bKash/bank and then recorded). Return restocks only if the admin ticks "sellable". Delivering a COD order marks it `cod_collected`.
> - Customer: `POST /orders/track` (5/min/IP, identical 404 for wrong order or phone), `/orders/:orderNo/cancel-request|return-request` (order number + phone, or the confirmation token), `GET /orders/:orderNo/invoice?token=`, `GET /orders/my`. Return requests need `orderSettings.returnWindowDays` (empty = off; policy text is still an owner question, #8). Return requests are whole-order (no per-item selection) in v1.
> - Invoice is a server-rendered **HTML page** (print / save as PDF from the browser) instead of a generated PDF file: browsers shape Bangla names correctly, PDF libraries here do not, and it avoids a dependency. Customer invoice hides the street address.
> - Notifications: provider adapters (`EmailProvider`, `SmsProvider`) + a `notifications` queue; with no provider configured (owner has not chosen one, Q9) messages stay queued. Owner alerts use the admin menu badge (new orders, requests, payments to check, reviews) and a prefilled **WhatsApp click-to-chat** message on each order. Automated WhatsApp (Business API) is a paid service and was not added.
> - Reviews: verified buyers only (order number + phone, order delivered, product in the order), one per order/product, moderated (`/admin/reviews`), plain text (markup stripped), public names shown as "First L.". Product `ratingAverage/ratingCount` are recomputed on approve/reject/delete. Public: `GET /reviews`, `GET /products/:slug/reviews`.
> - **Deferred (needs an email/SMS provider decision):** forgot/reset password and phone/email verification. Admin passwords can still be reset by a superadmin.
> - CSV export is admin/superadmin only and neutralises spreadsheet formulas.

### 13.5 Payments
| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/payments/manual/submit` | Customer submits `{orderNo, token, trxId, senderNumber? \| senderName?, reference?}` — records a claim only | Order token |
| GET | `/admin/payments` | List/filter (status, type, order no./TrxID) | Admin |
| GET | `/admin/payments/:id` | Detail incl. event history | Admin |
| POST | `/admin/payments/:id/resolve` | Verify or reject a claim `{approve, note}` | Admin |
| POST | `/admin/payments/:id/refund` | Record a refund already sent `{amount?, reason}` | Admin |
| GET/PATCH | `/admin/settings/payments` | Enable methods; numbers, bank details, instructions | Admin |

> **Phase 6 note:** a payment-gateway implementation was removed on 2026-11-11 (owner decision); prepaid orders hold stock via the expiry job (`reservationExpiresAt`, 24 h) instead of `reservedStock`.

> **Implementation notes (manual payments, owner request 2026-11-11):** payment methods are `cod`, `manual_bkash|nagad|rocket` and `manual_bank` (no payment gateway). Owner details/instructions are stored in `WebsiteSettings.payments.{manual,bank}` and exposed (only when the method is on) via `/settings/public` and `/delivery/zones`. `POST /payments/manual/submit` records `{trxId, senderNumber|senderName, reference}` and leaves the payment `pending`; `POST /admin/payments/:id/resolve` is the only path to `paid`; `POST /admin/payments/:id/refund {amount?, reason}` records a refund already sent (`partially_refunded`/`refunded`). UI wording: Pending / Verified (= `paid`) / Failed / Refunded.

### 13.6 Reviews
| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/products/:id/reviews` | Approved reviews + summary | Public |
| POST | `/reviews` | Submit `{productId, rating, comment, name, orderNo?, phone?}` → pending | Public (rate limited) |
| GET | `/admin/reviews` | Filter by status | Admin/Staff |
| PATCH | `/admin/reviews/:id` | Approve/reject/feature/reply | Admin/Staff |
| DELETE | `/admin/reviews/:id` | Delete | Admin |

### 13.7 Coupons
| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET/POST | `/admin/coupons` | List/create | Admin |
| PUT/DELETE | `/admin/coupons/:id` | Update/disable | Admin |
| GET | `/admin/coupons/:id/usage` | Redemptions | Admin |
(Public validation is in §13.3.)

### 13.8 Admin dashboard
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/dashboard/summary?from&to` | Revenue, orders, customers, pending, completed |
| GET | `/admin/dashboard/sales-chart` | Time series |
| GET | `/admin/dashboard/recent-orders` | Latest N |
| GET | `/admin/dashboard/best-sellers` | Top products |
| GET | `/admin/dashboard/low-stock` | Alerts |
| GET | `/admin/audit-logs` | Superadmin only |
All Admin/Staff-protected; 403 on insufficient role.

> **Implementation notes (Phase 8):**
> - **Role matrix (enforced by the server; hidden links are only convenience).** `superadmin`: everything, plus Team and Activity log. `admin`: everything except Team and Activity log. `staff`: Orders (view, move forward, notes/courier/address fix, invoice), Inventory, Reviews moderation — no dashboard/revenue, payments, customers, coupons, website/settings, messages, exports, cancel/return decisions or payment verification.
> - Dashboard (`/admin/dashboard/{summary,sales-chart,best-sellers,recent-orders,low-stock}`, admin+): "Revenue" = orders that are confirmed or further along (confirmed, processing, shipped, out for delivery, delivered); pending, cancelled and returned never count. Days are Bangladesh days (UTC+6); ranges up to one year; new vs returning customers are by phone (first-ever order inside/before the range); COD vs prepaid split; low-stock uses each variant's alert level.
> - Customers are derived from orders (guests included) and keyed by phone; the only stored customer data is the owner's note and block flag (`Customer` collection). Blocking also blocks a registered account's sign-in and any new checkout from that phone. Customer export is admin-only, contains phone numbers, and every export is audit-logged (as are payment/inventory/order exports).
> - Contact form: `POST /contact` (3/min/IP, honeypot, phone or email required) → `/admin/messages` (new/read/done).
> - Website settings: `GET /admin/settings`, `PUT /admin/settings/{business|delivery|content}` (strict validation; https-only social links; delivery zones: each district in at most one zone, default zone must exist and be active, whole-taka fees). Changing a fee or district list changes what customers are charged immediately. Announcement (English + Bangla, link, optional expiry) and an owner-edited FAQ (replaces the built-in answers when non-empty) are served through `/settings/public`.
> - **Not in Phase 8 (still in code, English/Bangla copy files):** hero, benefits, how-to-use, ingredient card text, trust points, gallery and offers copy, and legal pages (Phase 9). SEO/analytics IDs are Phase 9.
> - Table features: orders filter by status, payment type/method, district, Bangladesh date range, search, sort; payments filter by status/type/date/search; CSV exports for orders, customers, payments (no phone numbers) and inventory.

### 13.9 Customer management
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/customers` | Search/paginate (derived from Orders + Users) |
| GET | `/admin/customers/:id` | Detail + orders |
| PATCH | `/admin/customers/:id` | Notes, block/unblock |
| GET | `/admin/customers/export` | CSV (logged) |
| POST | `/contact` | Public contact form (rate limited, honeypot) |
| GET | `/admin/messages` | Contact messages |

### 13.10 Website settings
| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/settings/public` | Public-safe settings (business, announcement, content, analytics IDs, enabled payments, delivery summary) | Public, cacheable |
| GET | `/admin/settings` | Full settings | Admin |
| PUT | `/admin/settings/:section` | Update section (`business`, `content`, `delivery`, `payments`, `seo`, `legal`, …) | Admin |
| GET | `/sitemap.xml`, `/robots.txt` | SEO files (or generated at build) | Public |
| GET | `/health` | Health check | Public |

---

## 14. Security Requirements

- **Passwords:** bcrypt cost ≥ 12; min length 8 with strength guidance; never logged or returned.
- **JWT:** Access token 15 min (HS256 secret ≥ 32 bytes or RS256); refresh token 7–30 days, rotated, stored hashed server-side, delivered via httpOnly cookie; validate `iss`, `aud`, `exp`; revoke on logout/password change.
- **RBAC:** Middleware `authorize(...roles)`; deny by default; permission matrix documented; admin routes separate router.
- **Protected routes:** Frontend route guards are UX only; backend enforces.
- **Validation:** Zod on every body/query/params; unknown keys stripped; length limits.
- **NoSQL injection:** `express-mongo-sanitize` (or manual) + strict schema types; never pass raw `req.body` to queries.
- **XSS:** Escape output; sanitize rich text (DOMPurify/sanitize-html); CSP via Helmet.
- **Rate limiting:** Global; stricter on login, track, coupons, reviews, contact, checkout.
- **CORS:** Allow-list of frontend origins; `credentials: true` only for those.
- **Helmet:** Enabled with CSP tuned for Cloudinary, GA/Meta domains.
- **Cookies:** `httpOnly`, `secure`, `sameSite` (`lax`/`strict` as architecture allows; if frontend and API are on different sites, use `none` + CSRF token).
- **CSRF:** For cookie-authenticated state-changing requests use SameSite + CSRF token / custom header check.
- **Environment variables:** Validated at boot with Zod; server fails fast; `.env` gitignored; no secrets in the client bundle (only `VITE_` public values).
- **Payment verification:** Server-side Order Validation API on every success; amount/currency/tran_id/order match.
- **Webhook validation:** IPN verified via validation API (and signature/hash verification where available); optionally IP allow-list.
- **Duplicate callbacks:** Idempotent handlers with state-precondition atomic updates + event log.
- **Inventory race conditions:** Atomic conditional `$inc`; transactions; reservation expiry job.
- **Price manipulation:** Prices, discounts, delivery fees, totals are computed only on the server from DB; client values ignored.
- **Audit logging:** Admin logins, product/price/stock changes, order status, payment verification/refund, settings, exports, user/role changes.
- **Data privacy:** Minimize PII; mask phone in logs; PII exports restricted; retention policy; no card data stored; privacy policy states processing.
- **Other:** HTTPS/HSTS; dependency audit (`npm audit`) in CI; file upload only via signed Cloudinary uploads with type/size limits; generic auth errors; account lockout; secure error responses (no stack traces in production); request ID logging; body size limits.
- **Never expose API secrets or payment credentials in frontend code.**

---

## 15. Marketing and SEO

- **Meta:** Unique title (≤ 60 chars) and description (≤ 155) per page, editable via SEO settings.
- **Open Graph / Twitter cards:** `og:title/description/image(1200×630)/url/type`.
- **Structured data (JSON-LD):** `Product` (name, image, description, sku, brand, `offers` with BDT price, availability, `aggregateRating` only from real approved reviews), `Organization`, `FAQPage`, `BreadcrumbList`.
- **Sitemap & robots.txt:** Auto-generated; disallow `/admin`, `/checkout`, `/order`, `/api`.
- **Canonical URLs:** On every indexable page.
- **SPA SEO caveat:** A client-rendered Vite SPA limits crawler/social-preview reliability. **Mitigation:** build-time prerender of public routes (e.g., `vite-plugin-prerender`/`vite-ssg` or a prerender step) so the landing page, product pages, and legal pages ship static HTML with meta + JSON-LD. Decision to confirm in Phase 9 (migrating to Next.js is out of the requested stack and requires approval).
- **Image optimization:** Cloudinary `f_auto,q_auto,w_*`, `srcset`/`sizes`, explicit width/height (avoid CLS), lazy-load below fold, preload hero image, WebP/AVIF.
- **Google Analytics 4 and Meta Pixel:** IDs from settings; loaded only after consent where required.
- **Conversion events:** `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `add_payment_info`, `purchase` (fired only after confirmed order, deduplicated by order ID; for online payments only after payment validated), `generate_lead`/`Contact` for WhatsApp clicks, `Search`. Meta: `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`. Optional server-side Meta Conversions API with event_id dedupe (requires owner approval/token).
- **Consent & privacy:** Cookie banner with accept/reject/customize; tracking scripts blocked until consent; privacy policy describes tracking; Bangladesh Digital Security/Personal data considerations noted — owner to obtain legal review.
- **Performance targets:** LCP < 2.5s on 4G, CLS < 0.1, JS initial bundle budget ≤ 200KB gzip (route code-splitting).

---

> **Implementation notes (Phase 9):**
> - **Meta/OG/canonical:** every public page sets title, description, canonical, Open Graph and Twitter tags through one helper; checkout, order, track and admin are `noindex`. Owner-editable SEO title/description (EN + BN, 60/155 chars) and share image live in Admin → Website → Search, sharing and tracking. `index.html` carries baseline description/Open Graph tags (marked `data-rh` so the app replaces rather than duplicates them) for crawlers that do not run JavaScript. The canonical/`og:url`/`og:image` and `robots.txt`/`sitemap.xml` are generated at build time and need `VITE_SITE_URL` (the real domain, still unknown — open question 10).
> - **Prerendering (open question 12) — decision:** no prerender dependency is added now. Google renders JavaScript; link previews use the static baseline tags. Per-page previews for non-JS crawlers (e.g. the legal pages) would need a prerender step once the domain/hosting exist (Phase 11); that is an owner-approval item.
> - **Structured data:** Organization (only what the owner entered), one Product per published product with a BDT offer and availability, FAQPage (the FAQ actually shown), BreadcrumbList on legal pages. `aggregateRating` appears only when a product has real approved reviews.
> - **Consent:** Google Analytics 4 and Meta Pixel IDs are entered by the owner (strict format validation). A cookie banner (Accept all / Reject all / Choose, "Cookie settings" in the footer) appears only if at least one ID is set. **Nothing is requested before consent**; analytics consent loads Google only, marketing consent loads Meta only; withdrawing consent switches Google off (documented opt-out flag) and revokes Meta. No name, phone, email or address is ever sent.
> - **Events:** `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `add_payment_info`, `generate_lead` (WhatsApp links; Meta `Contact`), `purchase` — Meta equivalents ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Contact, Purchase. A `purchase` fires only when the customer views an order the shop has accepted (confirmed or later; never pending, cancelled or returned) and only once per order number. Because owners confirm orders on WhatsApp, this happens when the customer returns to the order/track page; a server-side Meta Conversions API would be more complete but needs an access token and the owner's approval (not built).
> - **Legal pages:** `/privacy`, `/terms`, `/returns`, `/shipping` (`GET /legal/:slug`). Text is Markdown stored in `WebsiteSettings.legalPages`, rendered by a tiny safe renderer (no raw HTML, only http/https/mailto links). Until the owner writes/approves their own text, built-in **draft templates** are shown with a visible "draft" notice. The templates contain no registrations, certifications, medical claims or guarantees (guarded by a test) and fill details (name, contact, delivery charges, combo free delivery, return window) from live settings. Policies are shown in English. They are not legal advice and need the owner's (ideally a lawyer's) review.
> - Not done: image CDN transformations (no Cloudinary account yet), hero image preload, server-side Conversions API.

## 16. Legal Pages

Pages: **Privacy Policy, Terms & Conditions, Return & Refund Policy, Shipping Policy, Contact Page.**
- Content is stored in WebsiteSettings (editable Markdown) with placeholders populated from business settings (name, address, phone, email, return window, delivery times).
- Initial text is a **template draft clearly marked for owner/legal review**; the site must not publish invented legal registrations, trade license numbers, BSTI/ISO/organic certifications, or medical claims. Display only identifiers the owner supplies.
- Product claims language: use "traditionally used", "may help", avoid guaranteed outcomes; owner confirms every claim.
- Contact page: form, phone, email, WhatsApp, address, hours, optional map link.

---

## 17. Testing Requirements

| Area | Tooling | Scope |
|---|---|---|
| Frontend unit/component | Vitest + RTL | Components, hooks, form validation, cart logic, accessibility (jest-axe) |
| Backend unit | Vitest/Jest | Services: pricing, coupons, inventory, delivery zones, status transitions |
| API/integration | Supertest + mongodb-memory-server (replica set) | All endpoints incl. error cases |
| Authentication | Supertest | Login, lockout, refresh rotation, RBAC denial, expired/forged tokens |
| Database | In-memory Mongo | Schema validation, unique indexes, transactions, concurrency |
| Checkout | Integration + E2E | Totals, coupon, zone fee, idempotency, price tamper rejection |
| Manual payments | Real API + database | Claim never marks paid, admin verify/reject, resubmit, duplicate TrxID, refunds, COD separation, expiry |
| Admin | Integration + E2E | CRUD, role restrictions, exports, manual payment verification |
| Responsive | Playwright viewports + Lighthouse | 360/390/768/1024/1280 |
| Security | Automated + manual | NoSQL injection, XSS payloads, rate limits, CORS, header checks, `npm audit`, secret scanning, IDOR on tracking/orders |
| Concurrency | Script | 50 parallel orders for stock of 10 → exactly 10 succeed |

**Key E2E scenarios**
1. Guest COD order on mobile: land → Order Now → fill form → confirmation → admin sees order → status flow to Delivered → stock correct.
2. Online payment success (sandbox) → IPN + return → order confirmed once.
3. Payment failure/cancel → stock released, order not paid.
4. Duplicate IPN/refresh of success page → no double deduction.
5. Tampered client price/delivery fee → ignored/rejected.
6. Out-of-stock during checkout → graceful error.
7. Coupon valid/expired/limit reached.
8. Manual MFS order stays pending until admin verification.
9. Tracking with wrong phone → generic not found; rate limit triggers.
10. Review submit → pending → approve → appears; aggregate rating updates.
11. Cancel/return flows restore stock appropriately.
12. Admin staff cannot access settings/users.
13. Cart persistence across reload; cookie consent gates analytics.

CI runs lint, typecheck, unit/integration tests on each PR; E2E on main/preview.

---

> **Implementation notes (Phase 10):** the security checklist in §14 was verified item by item — see `SECURITY_REVIEW.md`; the §17 test matrix, the 13 E2E scenarios, commands and results are in `TESTING.md`. Differences from the written spec: no payment gateway (so §14 "payment verification / webhook" and E2E scenarios 2–3 are covered by their manual-payment equivalents); jest-axe covers component accessibility while colour contrast and page-level accessibility are checked with Lighthouse in a real browser; the website's CSP is defined in `client/security-headers.ts` and must be sent by the host (generated `dist/_headers`).

## 18. Deployment Architecture

| Component | Service |
|---|---|
| Frontend | **Vercel** (SPA rewrite to `index.html`, prerendered public routes, security headers via `vercel.json`) |
| Backend | **Render or Railway** (always-on paid instance recommended; free tiers sleep — hurts IPN reliability; **paid service requires owner approval**) |
| Database | **MongoDB Atlas** (replica set; M10+ recommended for backups/transactions reliability; M0 acceptable only for staging) |
| Images | **Cloudinary** |
| DNS/Domain | Custom domain; `www` + apex; `api.` subdomain for backend (same-site cookies) |

- **Environments:** `development`, `staging`, `production` (live only after sign-off).
- **HTTPS:** Enforced everywhere; HSTS; redirects HTTP→HTTPS.
- **CORS:** Production allow-list = production frontend origin(s) only.
- **Process:** Git → CI (lint, typecheck, tests) → preview deploy → staging verification → owner approval → production deploy → smoke tests → rollback plan (redeploy previous build).
- **Backups:** Atlas continuous/daily snapshots, tested restore; export of orders weekly (optional); Cloudinary assets retained.
- **Monitoring:** Uptime monitor on `/health`; Sentry (frontend + backend); structured logs; alerts on payment `needs_review`, 5xx spikes, failed notifications, low stock.
- **Error logging:** Pino JSON logs, request IDs, no PII/secrets.
- **Jobs:** Reservation expiry and payment reconciliation via node-cron in a single instance or an external scheduler endpoint (secured).

---

## 19. Environment Variables (`.env.example` specification)

No real values. Server validates all at boot.

```dotenv
# ---------- App ----------
NODE_ENV=development
PORT=5001                   # 5000 is taken by macOS AirPlay Receiver
APP_NAME="Beauty Organic Hair Oil"
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5001
CORS_ORIGINS=http://localhost:5173
TRUST_PROXY=false

# ---------- MongoDB ----------
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DB_NAME=beauty_organic

# ---------- JWT / Security ----------
JWT_ACCESS_SECRET=change_me_min_32_chars
JWT_REFRESH_SECRET=change_me_min_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=14d
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false
BCRYPT_SALT_ROUNDS=12
ORDER_TOKEN_SECRET=change_me_min_32_chars
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=


# ---------- Cloudinary ----------
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=beauty-organic

# ---------- Email ----------
EMAIL_PROVIDER=smtp            # smtp | resend | sendgrid
EMAIL_FROM="Beauty Organic <no-reply@example.com>"
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_API_KEY=

# ---------- SMS (configurable provider) ----------
SMS_PROVIDER=none              # none | <provider-key>
SMS_API_URL=
SMS_API_KEY=
SMS_SENDER_ID=

# ---------- WhatsApp ----------
WHATSAPP_NUMBER=8801XXXXXXXXX  # public click-to-chat number (placeholder)

# ---------- Observability ----------
SENTRY_DSN=
LOG_LEVEL=info

# ---------- Frontend (client/.env) — PUBLIC values only ----------
VITE_API_BASE_URL=http://localhost:5001/api/v1
VITE_SITE_URL=http://localhost:5173
VITE_GA4_MEASUREMENT_ID=
VITE_META_PIXEL_ID=
VITE_CLOUDINARY_CLOUD_NAME=
```

Rules: only `VITE_*` variables reach the browser; none may be secret. Production values live in Vercel/Render/Railway dashboards only.

---

## 20. Development Roadmap

> Each phase ends with a **stop-and-ask checkpoint**: Claude reports and waits for the owner's explicit permission before starting the next phase.

### Phase 1 — Project setup & architecture
**Deliverables:** Monorepo (client/server/shared), TypeScript configs, ESLint/Prettier, Vite+Tailwind setup with design tokens, Express skeleton with env validation, health route, centralized error handler, `.env.example`, `.gitignore`, `DEVELOPMENT_PROGRESS.md`, Git init, README, brand assets organized.
**Acceptance:** `npm run dev` starts both apps; lint/typecheck/test scripts run clean; `/health` returns OK; no secrets committed.

### Phase 2 — UI/UX & landing page
**Deliverables:** Design system components, all 14 landing sections (content from settings defaults), cart-drawer UI shell, responsive layouts, animations, accessibility pass, provided images integrated (optimized).
**Acceptance:** Matches §4–§5 at all breakpoints; Lighthouse mobile targets met on static data; keyboard navigable; no horizontal scroll.

### Phase 3 — Database & backend
**Deliverables:** Mongoose schemas/indexes (§12), auth (customer/admin), RBAC, validation, rate limiting, security middleware, seed script, audit log, API test harness.
**Acceptance:** Auth tests pass; schema validation and unique constraints verified; admin seed works; protected routes deny correctly.

### Phase 4 — Product management
**Deliverables:** Product/category/ingredient APIs, Cloudinary signed upload, admin product & inventory screens (minimal admin shell), landing page wired to live product data.
**Acceptance:** Admin edits appear on storefront; stock adjustments logged; SKU/slug uniqueness enforced.

### Phase 5 — Shopping cart & checkout
**Deliverables:** Cart state, `/cart/quote`, coupons, delivery zones, checkout form with Zod validation, COD order creation with atomic stock, idempotency, order success page.
**Acceptance:** Tampered prices rejected; concurrency test passes; COD order end-to-end works; totals match server quote.

### Phase 6 — Payments (manual)
**Delivered (revised):** manual bKash/Nagad/Rocket and bank transfer with admin verification, expiry job, payment admin screens (a payment gateway was removed by owner decision).
**Acceptance:** no order paid without admin verification; duplicate submissions safe; COD separate.

### Phase 7 — Order management & tracking
**Deliverables:** Status workflow, history, cancellation/return, invoice PDF, tracking page, notifications (email/SMS adapters, WhatsApp links), reviews submission.
**Acceptance:** Valid transitions only; stock restore rules verified; tracking privacy/rate limit tested; notifications logged.

### Phase 8 — Admin dashboard
**Deliverables:** Analytics, all management modules (§11.2), search/filter/pagination/export, content/settings/SEO editors, review moderation, audit log view.
**Acceptance:** Owner can run the business without code changes; role matrix enforced; exports correct.

### Phase 9 — SEO & marketing
**Deliverables:** Meta/OG, JSON-LD, sitemap, robots, canonical, prerendering, image optimization, GA4 + Meta Pixel with consent, conversion events, legal pages.
**Acceptance:** Rich-result validator passes; events verified in debug tools; analytics blocked before consent; SEO Lighthouse ≥ 95.

### Phase 10 — Testing & security
**Deliverables:** Full test suites (§17), E2E scenarios, security review, dependency audit, load/concurrency test, accessibility audit, bug fixes.
**Acceptance:** All tests green; no high/critical vulnerabilities; checklist in §14 verified item by item.

### Phase 11 — Deployment
**Deliverables:** Vercel/Render(or Railway)/Atlas/Cloudinary setup, domain + HTTPS, staging with sandbox, production config, monitoring/backups, runbook
**Acceptance:** Smoke tests on production; real small COD and live payment test order succeed; backups/restores verified; owner sign-off.

---

## 21. Acceptance Criteria (project complete when…)

1. A real customer can order on a mobile phone via COD, manual bKash and bank transfer and receive confirmation.
2. Prices, totals, delivery fees, coupons, and stock are enforced server-side; tampering tests fail safely.
3. No oversell under concurrent orders; stock restored correctly on cancel/failure.
4. Payments are marked paid only after server-side validation; duplicate callbacks are harmless; manual MFS stays pending until admin verification.
5. Admin can manage products, inventory, orders, payments, customers, reviews, coupons, content, delivery, business settings, and SEO; with search, filter, pagination, export.
6. Order tracking works with order ID + phone, is rate limited, and leaks no extra data.
7. All 8 order statuses work with valid transitions and history; invoices generate.
8. Landing page implements all 14 sections, responsive at all target widths, accessible (WCAG AA), and meets performance/SEO targets.
9. Analytics/Pixel events fire correctly and only after consent; SEO assets (sitemap, robots, structured data, OG) are in place.
10. Legal pages are present with owner-supplied business data and no invented claims.
11. All tests in §17 pass; security checklist in §14 is complete; `npm audit` shows no high/critical issues.
12. Production deployed on HTTPS with monitoring, error logging, and verified backups; no secrets in repository or client bundle.
13. `DEVELOPMENT_PROGRESS.md` is accurate and the owner has signed off each phase.

---

## 22. Open Questions for the Owner (must be answered before the relevant phase)

| # | Question | Needed by |
|---|---|---|
| 1 | ~~Powder/comb relationship, prices, sizes~~ **Answered (§0.1): powder 225 g, oil 200 ml.** Still open: ~~product name~~ **"Hair Powder"**. Which packaging is current (cream label/yellow cap vs light-green label/clear cap)? | Phase 2 |
| 2 | ~~Oil size~~ answered. Still open: ingredients list for oil and powder, stock quantities, SKUs. Is the combo limited in time or quantity? Can a customer buy the comb alone (price ৳150)? | Phase 2/4 |
| 3 | May we use the label's "100% organic" / "Natural" claims, and do you hold any certification? Do you own the rights to the model photo on the label? | Phase 2 |
| 13 | What counts as "Inside Dhaka" for the ৳60 delivery fee: Dhaka city only, or also Gazipur / Narayanganj / Savar etc.? (Seeded as district "Dhaka" only.) | Phase 5 |
| 14 | Current stock quantities for oil, powder and comb — **enter them in Admin → Inventory**, then publish the products (they are seeded as drafts). | Phase 4 |
| 16 | ~~Order-confirmation process~~ **Answered: orders are accepted/confirmed via WhatsApp.** (Phase 7: WhatsApp click-to-chat for the owner on new orders.) Original question: who confirms it and how (phone call / WhatsApp)? The confirmation page currently says "Our team will confirm your order and arrange delivery." | Phase 7 |
| 15 | Create a (free) Cloudinary account and give me the cloud name, API key and API secret (put them in `server/.env`, never in chat) to enable image upload. Until then images can be added by URL. | Phase 4 |
| 4 | ~~Bangla requirement~~ **Resolved:** owner's offer copy is Bangla, so Bangla + English at launch (confirm default language). | Phase 2 |
| 5 | WhatsApp/phone **01857164863 provided**. Still open: legal business name, email, address, social links, logo files. | Phase 2 |
| 6 | ~~Delivery charges~~ **Answered:** ৳60 inside Dhaka, ৳120 outside, combo ships free. Still open: estimated delivery days, couriers used. | Phase 5 |
| 7 | ~~Payment gateway~~ **Answered: no gateway; manual bKash + bank transfer + COD.** Still open: your real bKash/bank details (enter in Admin → Payments). | Phase 6 |
| 8 | Return/refund window and policy text; privacy and terms (legal review). | Phase 9 |
| 9 | Email and SMS providers to use; approval of paid services (hosting, SMS, Sentry, domain). | Phase 7/11 |
| 10 | GA4 and Meta Pixel IDs; domain name. | Phase 9/11 |
| 11 | Real customer reviews available for launch? | Phase 7 |
| 12 | ~~Prerendering~~ **Decided (Phase 9): no prerender dependency now**; baseline static tags + client-rendered meta/JSON-LD; revisit with the real domain in Phase 11 (needs owner approval). | Phase 9 |
