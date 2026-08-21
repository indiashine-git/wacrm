# Research: SuperProfile teardown + WATU customer-storefront opportunity

**Date:** 2026-08-22
**Status:** Research / future-project reference — not yet approved for build
**Trigger:** Exploring whether WATU should offer customers a public-facing storefront/link-in-bio/payment-page product, modeled on (and eventually improving on) SuperProfile.bio (cosmofeed.com).

This doc captures everything learned from a live walkthrough of a real, logged-in SuperProfile account (Store, Payments, Bookings, and a full Payment Page editor including Advanced Settings), plus web research on SuperProfile's positioning/pricing and on Postiz (an open-source social scheduling tool that came up in the same conversation). Nothing here is scoped/approved yet — it's the reference material for when this becomes a real spec.

---

## 1. What SuperProfile actually is

A creator/SMB monetization platform: one public page (`superprofile.bio/{slug}`) that hosts links, a storefront, and several sellable "product types," with Instagram DM automation as its main growth/acquisition engine. Featured in Forbes/ThePrint/YourStory/Entrepreneur. Not hype — real product, real usage, but built around Instagram, not WhatsApp.

**Pricing (as seen in the live account + review sources):**
- Free tier: basic link-in-bio, limited leads, AutoDM for post replies, 10% platform fee on sales, unpublished/locked products until upgrade
- Creator: ₹99 first month then ~₹499/month (or ~₹11,999/year per a competitor's comparison page), unlimited AutoDM, multiple IG accounts, unlimited leads, lower/no platform fee
- Pro: custom pricing, dedicated growth manager, ads manager, custom landing pages
- No commission model as a selling point ("keep all your revenue" once upgraded)

---

## 2. Core architecture — the actual lesson

SuperProfile is **not** a pile of unrelated features. It's one shared "sellable page" shell reused by every product type, plus a thin type-specific data module, plus a Store that's just an ordered list of references to these pages. This is the single most useful thing to copy — the pattern, not any one feature.

### Layer 1 — Page shell (identical for every product type: Payment Page, Event, Lead Magnet, Course)

**Page Details tab** (same fields regardless of product type):
- Title, cover image/video, rich-text description (bold/underline/italic/lists/align/link/image/embed), button text
- Optional sections, each independently toggled on/off: **Gallery** ("See in Action" — multi-image), **FAQs**, **Testimonials**, **About Me**, **Showcase Products** (cross-sell other items from the same store)

**Advanced Settings tab** (the real shared engine — built once, reused everywhere):
- **Theme & Styling** — 3 preset templates (1 free "Default", 2 paid-locked "Dawn"/"Dusk" or "Sunset"/"Dusk" depending on product type), plus a **Style editor** with two sub-tabs:
  - *Background*: solid color, gradient, **pattern** (8 preset textured swatches), **animated** (4 animated background presets, e.g. moving stripes/dots), or a custom uploaded **image**
  - *Buttons*: separate color/style control from background
  - A note clarifies: "the default style uses the same styling as your store" — i.e. styling is normally inherited from the account-level Store theme, and only overridden per-page if you choose to
- **Checkout Experience** — explicit choice: *Same Page Checkout* (popup/modal on the same page) vs *Next Page Checkout* (redirect to a dedicated checkout page). Note shown: same-page/one-click only works on desktop/tablet — mobile always gets Next Page Checkout for optimization.
- **Customer information** — Email ID field with an OTP "Verification Code" toggle (on by default)
- **Ask additional questions** — a dynamic form builder: "+ Add Question" lets the creator add arbitrary fields (phone number, name, custom text), each individually togglable for OTP verification and for visibility (eye icon = show/hide on the public form). Fields are drag-reorderable (drag handle shown).
- **Pricing**
  - GST toggle (enable/disable tax on the displayed price)
  - **Purchasing Power Parity** — toggle to auto-adjust price by visitor's region (only seen on the Event product type, may be type-specific)
  - Pricing model itself (seen on Payment Page Details tab, not Advanced Settings): *Fixed Price* vs *Customers decide price* (pay-what-you-want), with an optional "Offer discounted price" struck-through original price + auto-computed % off
  - **Limit Quantity** toggle — cap total number of purchases (stock-style)
- **Boost Sales** (marketing add-ons, all per-page):
  - *Bump Offer* — an add-on product offered during checkout, edited as its own 2-step wizard: **Content** tab (cover image/video, heading, rich description, button text) and **Fulfilment** tab (what the buyer actually gets)
  - *Automated Email* — a trigger picker with exactly two options: "When someone purchases this product" or "When the purchase is abandoned" (abandoned-cart email, built in). A standing note: a purchase-confirmation email is always sent by default regardless — these automations are explicitly for marketing on top of that.
  - *Discount Coupons* — simple coupon manager (code, % off, expiry date), "+ New Coupon"
- **Terms and Policies** — three independent per-page text blocks, each with its own "Setup": Terms and Conditions, Refund Policy, Privacy Policy
- **Page URL** — custom slug editor (`superprofile.bio/vp/{slug}` for payment pages, `superprofile.bio/event` for events, etc.)
- **Post-Purchase Behaviour** — a toggle + editor defining what happens immediately after a successful purchase (redirect / message / next step) — present on every product type
- **Tracking**
  - *Meta Pixel* — Pixel ID field + checkboxes for which events to send: Page Views, Initiate Payment, Payment Complete
  - *Google Analytics* — GA tracking ID field
- **Live preview** — every editor screen has a real-time desktop/mobile-toggle preview pane on the right, rendering the actual page as you edit

### Layer 2 — Product-type module (the only part that genuinely differs per type)

- **Payment Page** (single digital product/service):
  - Upload digital files (unlimited files, 100MB total on free tier) or add a resource link instead
  - Pricing: Fixed Price or Customer-decides-price, optional discounted price, optional quantity limit
- **Event**:
  - One or more sessions, each with date + start/end time, timezone picker; "+ New session" and "+ Recurring Series" (repeat pattern) supported
  - Location: Virtual (external meeting link — Google Meet/Zoom/Teams) or in-person address
  - Multiple **ticket tiers** per event (e.g. "One Ticket" — name, description, on-sale status, price, stock count), "+ New Ticket" to add more
- **Lead Magnet** (free-gated content used purely for list-building):
  - Cover image, title, description, button text
  - Custom question fields (name/phone/email by default, extensible), each with OTP-verification toggle and visibility toggle
  - "Want to include free resource(s)?" — attach a downloadable unlocked after form submission
  - "Want to share this lead magnet as a re-usable template?" — publish it for reuse
  - Its own Advanced Settings: **Add Email Automation** (trigger: "When Lead Form is Submitted" or "When user selects a specific response" to a question — with a callout that automations lift conversion ~43%), a note that collected leads can be piped to third-party marketing tools via Account Settings integrations, a **Custom Post Submission Message** editor (title/description/button text shown right after the form is submitted), and the same Theme/Style picker as every other type
- **Course** (the deepest product type):
  - Structure: Modules → Lessons (module = "+ New Module", each needs ≥1 active lesson)
  - Lesson types, chosen per lesson via a picker: **Video**, **Text & Images**, **Audio**, **Quiz**, **Assignment**
  - Quiz has its own sub-builder: quiz title, rich-text instructions, then per-question: question type (seen: "Single correct"), rich-text question body, 2-4 answer options (A-D, addable/removable), select the correct answer, optional rich-text explanation, "+ Add question" to add more
  - Optional **Live Classes** section — separate setup flow for scheduled live sessions tied to the course
  - Pricing: Fixed Price, Customer-decides-price, or Free

### Layer 3 — Store (the account-level composition)

- One header (avatar, name, bio line, social icon row — Instagram/Facebook/X/YouTube/LinkedIn etc.)
- A flat, reorderable, toggle-able list of **content blocks**, added via a single "+ Add Content" picker with two groups:
  - *Quick adds*: Carousel (a titled card-row that can embed external links, other SuperProfile products, or affiliate links), Existing Products (pull one already created elsewhere in), Lead Magnet, WhatsApp link, Referral Link, CJ Affiliate Link
  - *Create and sell*: Sell Digital Files, Offer 1-on-1 Session (Bookings), Recurring Membership (Telegram/Discord paid community), Host Event or Webinar, Sell a Course, Locked Content (paywall any single file), Sell Affiliate Products (resell others' courses for commission)
- **Appearance tab** (account-wide, distinct from per-page style override): a theme carousel (multiple visual templates beyond just the 3 seen per-page), a global color/Style picker, and a **Font** picker (seen: "Hind Madurai")
- **Payments tab**: earnings line chart, payout status (Active/Inactive), and an orders table (Date / Customer Email / Product / Amount)
- **Analytics tab**: not deeply explored this session — flagged for a follow-up look if this becomes a real build
- **Bookings app** (1-on-1 scheduling, its own left-nav item, separate from a generic "Payment Page"): session list, each row showing Views / Bookings / Conversion % / Total Earned, "+ New session," standalone landing copy ("Book appointments, sessions, and consultations instantly")

### Sidebar apps (top-level, outside the Store list)

AutoDM, SuperLinks, Lead Magnet, Payment Pages, Bookings, Events, Telegram, Discord, Courses, Locked Content — each of these is really just a dedicated management list view over Layer-2 objects of that type, plus "Explore All Apps" for anything not pinned to the sidebar.

---

## 3. What's genuinely good here (worth learning from, not just copying)

1. **Shared infrastructure written once, reused across every sellable thing.** Checkout, coupons, bump-offers, tracking, legal text, and post-purchase hooks are Layer-1 concerns — a new product type only ever needs to define its own thin data + a rendering block. This is why they can ship so many "product types" without the codebase becoming N separate systems.
2. **The style system (background: solid/gradient/pattern/animated/image, decoupled button styling) plus 3 ready templates is what makes setup feel instant.** This — not the number of product types — is most of the "80% of small-business setup needs solved" feeling.
3. **Dynamic question builder with per-field verification** is reused identically across Payment Page, Event, and Lead Magnet — one form-builder component, not three.
4. **Post-Purchase Behaviour + Automated Email (purchase/abandoned trigger) is a real, useful, small piece** — most competitors skip the abandoned-purchase case entirely.
5. **AutoDM (Instagram comment/story/DM automation)** is a genuinely good acquisition engine for creators already living on Instagram — but it's IG-specific and not directly transferable. WATU's rough equivalent (WhatsApp automation engine + broadcast) is already a stronger primitive for a WhatsApp-first audience — this is a real WATU advantage, not a gap.

---

## 4. Postiz (raised in the same conversation, different category — logged separately here for completeness)

Not a SuperProfile competitor — a **social media post scheduler/publisher**, came up because the user asked about "social media automation" open-source tools generally.

- Open source, **AGPL-3.0**, ~32.6k GitHub stars, actively maintained (multiple releases/month) — `github.com/gitroomhq/postiz-app`
- Stack: Next.js (frontend) + NestJS (backend) + Prisma/PostgreSQL + Temporal (job scheduling) + Resend (email) — TypeScript monorepo (pnpm workspaces)
- Features: schedule/publish across 28+ platforms (Instagram, LinkedIn, X, TikTok, YouTube, Facebook, Pinterest, Threads, Discord, Slack, Bluesky, Mastodon, Reddit, Dribbble...), AI caption/image generation, team collaboration + comments, analytics, a post marketplace
- Integrations: N8N custom node, native Make.com integration, Zapier, a published NodeJS SDK — API-first, matching WATU's own "raw fetch, no heavy SDK" integration style
- **No DM/comment automation** — pure scheduling/publishing, does not overlap with SuperProfile's AutoDM
- **Relevance to WATU:** if a future "schedule posts across our customers' social channels" module is ever wanted, self-hosting or forking Postiz is a legitimate starting point rather than building a scheduler from scratch. Not related to the storefront/payment-page work below — noted here only so the research isn't lost.

---

## 5. Two tracks going forward

### Track A — Fast, bounded: what WATU can ship now (reuses infra already live)

Goal: give WATU customers a public-facing page good enough to replace "nothing" or a raw Meta catalog link, without building a page-builder or new product-type subsystems.

| Piece | WATU reuse | Notes |
|---|---|---|
| Public unauthenticated page renderer at `/s/{slug}` | new — the one foundational piece everything else needs | logo/name/socials + product grid from existing `products`/commerce tables |
| Theme/background picker (3-4 presets, not full pattern/animated editor) | new, small `store_config` table | don't over-build — presets, not a full style engine, for v1 |
| Links block (WhatsApp/referral/socials) | trivial, stored in `store_config` | |
| Lead Magnet block | reuses existing contact-capture + `source` field | |
| Checkout style (embedded vs redirect) | extends existing Razorpay payment-link flow | currently redirect-only |
| Discount coupons | new, small table | |
| Bump offer | new, moderate — second order line item | |
| Pixel/GA tracking fields | new, trivial — per-account fields | |
| T&C/Refund/Privacy text blocks | trivial content fields | |
| Post-purchase automation trigger | **already exists** — automation engine's `order_created`/payment-confirmed trigger, and unlike SuperProfile's email-only version, ours can fire straight to **WhatsApp** | this is WATU's real differentiator vs. SuperProfile — call it out explicitly in any future pitch |
| Sell Digital Files | needs file storage + delivery — deliver via WhatsApp message after Razorpay webhook confirms payment, reusing the existing `sendPaymentLinkMessage` pattern | moderate effort, high leverage given infra already built |

Explicitly **not** in Track A: theme's full pattern/animated/gradient editor (ship simple presets first), full drag-drop page builder, custom domains.

### Track B — Full future product: "WATU Storefront" (large, speculative, park until Track A proves demand)

Everything SuperProfile has that Track A skips, scoped as its own future product using the same Layer-1/Layer-2/Layer-3 pattern documented above:
- Full Course LMS (modules/lessons/5 lesson types/quiz engine/live classes)
- Full Event ticketing (recurring sessions, multiple tiers, virtual/physical)
- Recurring Membership (paid Telegram/Discord community gating)
- Locked Content (single-file paywall)
- Affiliate reselling
- Full style engine (pattern/animated backgrounds, custom fonts, multiple theme templates)
- Bookings/1-on-1 scheduling as its own subsystem
- Analytics dashboard equivalent to SuperProfile's

**Do not start Track B speculatively.** Revisit only once Track A is live and either (a) customers are explicitly asking for course/event/community features, or (b) this becomes an intentional separate paid module decision, not a roadmap default.

---

## 6. Open questions / things not yet checked

- SuperProfile's Analytics tab — not explored live, unknown depth
- Exact Bump Offer "Fulfilment" tab contents — only the "Content" tab was screenshotted
- Whether Purchasing Power Parity is Event-only or available on all product types
- Real payout/settlement mechanics (India-specific compliance, TDS handling, GST invoicing specifics) — worth checking before Track B pricing decisions
- Postiz's real limits at scale (rate limits, self-hosted resource requirements) — only README-level research done, no live test

---

*This document is a research snapshot, not an approved spec. Before building any of Track A, this needs to go through the normal brainstorm → design → plan flow and get explicit user sign-off on scope.*
