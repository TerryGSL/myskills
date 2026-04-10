---
name: i18n-translator
description: Automate multi-language translation for Next.js projects using next-intl or similar i18n frameworks. Handles JSON translation files, inline ternary translations, and ensures parity between all supported locales. Use when adding new pages, features, or text that need translation, or when auditing i18n coverage. Triggers - "translate", "add language", "i18n", "multi-language", "localize".
---

# i18n Translation Skill

Automate and standardize multi-language support in Next.js projects. This skill handles both JSON-based translations (next-intl) and inline ternary patterns (`isZh ? '...' : '...'`).

## When to Use

- Adding a new page or feature that needs translation
- Adding a new language to the project
- Auditing existing pages for missing translations
- Converting hardcoded strings to i18n

## Workflow

### 1. Detect Project i18n Setup

Before any translation work, detect the project's i18n configuration:

```
1. Check for next-intl, react-intl, i18next, or similar in package.json
2. Find the locale message directory (typically src/config/locale/messages/ or locales/)
3. Identify supported locales (check locale directories or config)
4. Check if the project uses JSON files, TS files, or MDX for translations
5. Check for inline patterns like `isZh ? '...' : '...'`
```

### 2. Adding Translations to Existing Pages

When a page needs new translated strings:

**For JSON-based i18n (next-intl):**
1. Add the key to the English JSON file first
2. Add the same key with translated value to ALL other locale JSON files
3. In the component, use `useTranslations('namespace')` or `getTranslations('namespace')`
4. Replace hardcoded strings with `t('key')`

**For inline ternary patterns (client components):**
1. Use `const isZh = locale === 'zh'` pattern
2. Replace every user-visible string with `isZh ? '中文' : 'English'`
3. Ensure ALL strings are covered - labels, placeholders, error messages, empty states

### 3. Adding a New Language

When adding a new locale (e.g., Japanese):

```
1. Create the locale directory: messages/ja/
2. Copy ALL JSON files from messages/en/ to messages/ja/
3. Translate every value (keep keys identical)
4. Update next-intl config to include the new locale
5. Update locale routing configuration
6. Check for inline ternary patterns and extend them
7. Verify MDX content files have locale variants
```

### 4. Translation Quality Rules

**CRITICAL - These rules prevent SEO penalties for duplicate content:**

- Never use template substitution (e.g., replacing `${instrument}` across pages)
- Each translation must be uniquely written, not a mechanical find-replace
- Translations should be natural and idiomatic, not literal word-for-word
- Preserve the meaning and tone, but adapt to cultural context
- For SEO metadata (title, description, keywords), each must be unique per page AND per locale

### 5. Audit Checklist

When auditing i18n coverage:

```
- [ ] All user-visible text is translated (no hardcoded English in non-EN locale)
- [ ] All JSON translation files have key parity across locales
- [ ] All page metadata (title, description) is translated
- [ ] Error messages are translated
- [ ] Empty states and loading text are translated
- [ ] Button labels and form placeholders are translated
- [ ] SEO metadata is unique per page (not templated)
- [ ] MDX content files have locale variants
- [ ] No untranslated alt text on images
```

### 6. File Naming Conventions

```
# JSON translation files
messages/en/pages/pricing.json
messages/zh/pages/pricing.json

# MDX content with locale
content/posts/my-article.mdx        (English)
content/posts/my-article.zh.mdx     (Chinese)

# Page components (shared across locales)
src/app/[locale]/(landing)/page.tsx  (auto-detects locale)
```

### 7. Common Patterns

**Server Component (next-intl):**
```tsx
const t = await getTranslations('pages.pricing');
return <h1>{t('title')}</h1>;
```

**Client Component (next-intl):**
```tsx
const t = useTranslations('pages.pricing');
return <h1>{t('title')}</h1>;
```

**Client Component (inline - when i18n JSON is impractical):**
```tsx
const locale = useLocale();
const isZh = locale === 'zh';
return <h1>{isZh ? '定价' : 'Pricing'}</h1>;
```

**Dynamic keys:**
```tsx
// DON'T: t(variable) - breaks static extraction
// DO: use explicit key mappings
const labels = { free: t('plan_free'), pro: t('plan_pro') };
return <span>{labels[plan]}</span>;
```
