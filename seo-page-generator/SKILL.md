---
name: seo-page-generator
description: Generate SEO-optimized pages for Next.js projects. Creates new feature pages with unique SEO metadata, proper routing, i18n translations, and component reuse. Prevents duplicate content penalties by ensuring each page has unique title, description, H1, and content. Use when adding new landing pages, feature pages, tool pages, or content pages to a project. Triggers - "new page", "add page", "generate page", "create page", "new feature", "add feature", "SEO page".
---

# SEO Page Generator Skill

Generate production-ready, SEO-optimized pages for Next.js projects with proper i18n, unique metadata, and component reuse.

## Core Principle

**Every page must have 100% unique SEO content.** Google penalizes duplicate/templated content. Even if pages share the same UI components, all SEO-critical text must be uniquely written.

## What Counts as SEO-Critical (Must Be Unique Per Page)

1. `<title>` tag / metadata title
2. `<meta name="description">` / metadata description
3. `<h1>` heading (one per page)
4. First paragraph of visible content
5. Image alt text
6. URL slug
7. Open Graph title + description
8. JSON-LD structured data

## Workflow

### Step 1: Gather Requirements

Ask the user for:
- **Page purpose**: What does this page do?
- **Target keyword**: Primary SEO keyword for this page
- **Route/path**: URL path (e.g., `/tools/voice-to-piano`)
- **Template reference**: Existing page to base the layout on (for component reuse)
- **Locale support**: Which languages? (default: en, zh)

### Step 2: Generate Page Files

For a page at `/tools/my-feature`:

```
src/app/[locale]/(landing)/tools/my-feature/page.tsx    # Page component
src/config/locale/messages/en/pages/my-feature.json     # English SEO + content
src/config/locale/messages/zh/pages/my-feature.json     # Chinese SEO + content
```

### Step 3: SEO Metadata Structure

Each locale JSON file must include:

```json
{
  "metadata": {
    "title": "Unique Page Title | Brand Name",
    "description": "Unique 150-160 char description with target keyword.",
    "keywords": "keyword1, keyword2, keyword3"
  },
  "page": {
    // Page-specific content
  }
}
```

### Step 4: Page Component Pattern

```tsx
import { setRequestLocale } from 'next-intl/server';
import { getMetadata } from '@/shared/lib/seo';

export const generateMetadata = getMetadata({
  metadataKey: 'pages.my-feature.metadata',
  canonicalUrl: '/tools/my-feature',
});

export default async function MyFeaturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { default: ClientComponent } = await import(
    '@/shared/blocks/my-feature/page'
  );

  return <ClientComponent />;
}
```

### Step 5: Anti-Duplication Rules

When creating multiple similar pages (e.g., voice-to-piano, voice-to-violin):

- **DO**: Write unique descriptions for each instrument
- **DO**: Use different H1 phrasing for each page
- **DO**: Include instrument-specific details in content
- **DON'T**: Use `${instrument}` template substitution across pages
- **DON'T**: Copy-paste descriptions and only change the instrument name
- **DON'T**: Use the same meta description with just one word swapped

**Bad (will be penalized):**
```
"Voice to Piano - Convert voice to piano"
"Voice to Violin - Convert voice to violin"
```

**Good (unique per page):**
```
"Transform Your Voice into Piano Melodies | AI Music"
"Sing and Hear It as a Violin Performance | AI Music"
```

### Step 6: Sitemap and Navigation

After creating the page:
1. Verify it appears in `sitemap.ts`
2. Add to navigation if needed (header nav, footer links)
3. Add internal links from related pages

### Step 7: Component Reuse

Reuse existing UI components but with unique content:
- Share layout components, form components, result displays
- Each page passes its own unique props/data
- Keep the visual consistency but vary the content

## Quick Reference

```bash
# Files to create/modify for a new page:
1. src/app/[locale]/(landing)/tools/{slug}/page.tsx     # Route
2. messages/en/pages/{slug}.json                         # English i18n
3. messages/zh/pages/{slug}.json                         # Chinese i18n
4. src/app/sitemap.ts                                    # Add to sitemap
5. Landing JSON nav items                                # Add to navigation
```
