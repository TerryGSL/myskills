---
name: design-systems
description: Generate UI that matches the look-and-feel of specific brands (Stripe, Apple, Linear, Figma, Notion, Vercel, Tesla, Claude, Spotify, Airbnb, Cursor, Raycast, and 46 more). Use when the user asks to build/style a page, component, or app "like [brand]", "in the style of [brand]", "matching [brand]'s design", or references a popular product's visual identity as the target for what they're building. Each brand has a detailed DESIGN.md covering colors, typography, spacing, shadows, motion, and component patterns.
---

# Design Systems

## What this skill does

When the user wants UI that looks like a specific brand, load that brand's `references/<brand>.md` — a 300-800 line design-system document covering colors, type scale, spacing rhythm, shadows, radii, motion, and component patterns — and use it as the style reference for what you build.

Files come from VoltAgent's awesome-design-md collection (getdesign.md). They are **inspired-by**, not official, design systems.

## Workflow

1. **Identify the target brand** from the user's request. Match against the catalog below. Common aliases: "linear" → `linear.app`, "x" or "xAI" or "Grok" → `x.ai`, "mistral" → `mistral.ai`, "opencode" → `opencode.ai`, "together" → `together.ai`. If the user names a brand not in the catalog, say so and offer the closest stylistic match.
2. **Read the reference**: `references/<brand>.md`. Do NOT guess at the design system from memory — always load the file, even for brands you think you know.
3. **Extract the parts you need** for this specific task. A landing page needs hero + CTA + typography. A dashboard needs tables + cards + data-density rules. Don't dump the whole reference into the output.
4. **Build the UI**. Apply the colors, type, spacing, shadows, radii, and component patterns from the reference. Prefer CSS variables or Tailwind arbitrary values with the exact hex codes from the reference — don't approximate.
5. **Cite the reference** briefly in your response so the user knows which design system you applied ("built using the Stripe reference: weight-300 headlines, #533afd accent, blue-tinted shadows").

## Combining with other skills

- If `frontend-design` is also available and the user wants a polished webapp scaffold, use `frontend-design` for structure/stack and this skill for visual language. Load the brand reference BEFORE generating code so the design tokens flow through the whole build.
- For multi-brand comparison ("show me Stripe-style vs Linear-style"), load both references and produce two variants.

## Important caveats

- These are **fan-made inspirations**, not official brand guidelines. Don't tell the user this is "the official Stripe design system." Don't commit trademarked logos or copyrighted imagery.
- Each reference is opinionated about one surface of the brand (usually the marketing site). If the user wants an app shell but the reference covers the landing page, extrapolate reasonably and call out what you inferred.
- Files live under `references/` with the exact slug from the catalog. Brand names containing dots (`linear.app`, `mistral.ai`, `x.ai`, `opencode.ai`, `together.ai`) use the full slug as the filename.

## Catalog (58 brands)

### AI & ML
- `claude` — Anthropic's AI assistant. Warm terracotta accent, clean editorial layout.
- `cohere` — Enterprise AI platform. Vibrant gradients, data-rich dashboard aesthetic.
- `cursor` — AI-first code editor. Sleek dark interface, gradient accents.
- `elevenlabs` — AI voice platform. Dark cinematic UI, audio-waveform aesthetics.
- `lovable` — AI full-stack builder. Playful gradients, friendly dev aesthetic.
- `minimax` — AI model provider. Bold dark interface with neon accents.
- `mistral.ai` — Open-weight LLM provider. French-engineered minimalism, purple-toned.
- `ollama` — Run LLMs locally. Terminal-first, monochrome simplicity.
- `opencode.ai` — AI coding platform. Developer-centric dark theme.
- `replicate` — Run ML models via API. Clean white canvas, code-forward.
- `runwayml` — AI video generation. Cinematic dark UI, media-rich layout.
- `together.ai` — Open-source AI infrastructure. Technical, blueprint-style design.
- `voltagent` — AI agent framework. Void-black canvas, emerald accent, terminal-native.
- `x.ai` — Elon Musk's AI lab. Stark monochrome, futuristic minimalism.

### Developer tools
- `cal` — Open-source scheduling. Clean neutral UI, developer-oriented simplicity.
- `clickhouse` — Fast analytics database. Yellow-accented, technical documentation style.
- `composio` — Tool integration platform. Modern dark with colorful integration icons.
- `expo` — React Native platform. Dark theme, tight letter-spacing, code-centric.
- `hashicorp` — Infrastructure automation. Enterprise-clean, black and white.
- `linear.app` — Project management. Ultra-minimal, precise, purple accent.
- `mintlify` — Documentation platform. Clean, green-accented, reading-optimized.
- `mongodb` — Document database. Green leaf branding, developer documentation focus.
- `posthog` — Product analytics. Playful hedgehog branding, developer-friendly dark UI.
- `raycast` — Productivity launcher. Sleek dark chrome, vibrant gradient accents.
- `resend` — Email API. Minimal dark theme, monospace accents.
- `sentry` — Error monitoring. Dark dashboard, data-dense, pink-purple accent.
- `supabase` — Open-source Firebase alternative. Dark emerald theme, code-first.
- `vercel` — Frontend deployment. Black and white precision, Geist font.
- `warp` — Modern terminal. Dark IDE-like interface, block-based command UI.
- `zapier` — Automation platform. Warm orange, friendly illustration-driven.

### Infrastructure & SaaS
- `airtable` — Spreadsheet-database hybrid. Colorful, friendly, structured data aesthetic.
- `ibm` — Enterprise technology. Carbon design system, structured blue palette.
- `intercom` — Customer messaging. Friendly blue palette, conversational UI patterns.
- `nvidia` — GPU computing. Green-black energy, technical power aesthetic.
- `sanity` — Headless CMS. Red accent, content-first editorial layout.
- `stripe` — Payment infrastructure. Signature purple gradients, weight-300 elegance.
- `webflow` — Visual web builder. Blue-accented, polished marketing site aesthetic.

### Design & productivity
- `clay` — Creative agency. Organic shapes, soft gradients, art-directed layout.
- `figma` — Collaborative design tool. Vibrant multi-color, playful yet professional.
- `framer` — Website builder. Bold black and blue, motion-first, design-forward.
- `miro` — Visual collaboration. Bright yellow accent, infinite canvas aesthetic.
- `notion` — All-in-one workspace. Warm minimalism, serif headings, soft surfaces.
- `superhuman` — Fast email client. Premium dark UI, keyboard-first, purple glow.

### Fintech & crypto
- `coinbase` — Crypto exchange. Clean blue identity, trust-focused, institutional feel.
- `kraken` — Crypto trading. Purple-accented dark UI, data-dense dashboards.
- `revolut` — Digital banking. Sleek dark interface, gradient cards, fintech precision.
- `wise` — Money transfer. Bright green accent, friendly and clear.

### Consumer & media
- `airbnb` — Travel marketplace. Warm coral accent, photography-driven, rounded UI.
- `apple` — Consumer electronics. Premium white space, SF Pro, cinematic imagery.
- `pinterest` — Visual discovery. Red accent, masonry grid, image-first.
- `spotify` — Music streaming. Vibrant green on dark, bold type, album-art-driven.
- `uber` — Mobility platform. Bold black and white, tight type, urban energy.

### Automotive & aerospace
- `bmw` — Luxury automotive. Dark premium surfaces, precise German engineering aesthetic.
- `ferrari` — Luxury automotive. Chiaroscuro editorial, Ferrari Red accents, cinematic black.
- `lamborghini` — Supercar brand. True black surfaces, gold accents, dramatic uppercase typography.
- `renault` — French automotive. Vibrant aurora gradients, NouvelR typography, bold energy.
- `spacex` — Space technology. Stark black and white, full-bleed imagery, futuristic.
- `tesla` — Electric automotive. Radical subtraction, full-viewport photography, near-zero UI.

## Anti-patterns

- **Don't skip reading the reference.** Even for brands you "know" (Stripe, Apple), the reference has specific tokens (exact hex codes, font weights, shadow stacks) you won't get right from memory.
- **Don't mix brands unless asked.** A page that's "70% Linear, 30% Stripe" isn't design — it's mush.
- **Don't re-quote the whole reference in your output.** Use it to inform the code you write; cite a few specific tokens in the prose.
- **Don't use this skill for accessibility, performance, or component-architecture guidance.** These references cover visual language only.
