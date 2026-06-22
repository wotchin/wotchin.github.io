---
name: jacks-ai-studio-blog
description: Maintain and extend the Jack's AI Studio Hexo blog. Use when editing posts, translating Chinese/English versions, adding images, changing the Maupassant theme, troubleshooting Hexo generation, or preserving this blog's professional AI/data-infrastructure positioning and bilingual language-switching behavior.
---

# Jack's AI Studio Blog

Use this skill for work in the Hexo blog repository for **Jack's AI Studio**. Treat the site as a professional, international, consulting-ready technical blog focused on AI systems, data infrastructure, database systems, agent infrastructure, and systems engineering.

For detailed rules and common pitfalls, read [references/blog-rules.md](references/blog-rules.md) before substantial edits.

## Core Workflow

1. Inspect the existing post, theme, and config before editing.
2. Preserve user changes in the dirty working tree; do not revert unrelated files.
3. For content work, keep the author's technical voice: experienced engineer, research-aware, precise, and practical.
4. For theme work, preserve the lightweight bilingual model: English is default; Chinese lives under `/zh/`.
5. Validate with Hexo generation and targeted `rg` checks before reporting done.

## Bilingual Rules

Use this model unless the user explicitly asks to redesign i18n:

- English posts:
  - `category: English`
  - `lang: en`
  - filename usually ends with `-en.md` when translating an existing Chinese post
  - `translation_url` points to the Chinese article URL
- Chinese posts:
  - `category: Chinese`
  - `lang: zh-CN`
  - `translation_url` points to the English article URL
- Use the same original `date` for translations, and set `updated` to the current edit date when materially updated.
- Do not use categories as the main language UX. The theme filters lists by language and exposes a language switch.

English translations should read like natural English technical writing, not literal Chinese-to-English conversion. Preserve technical accuracy, rewrite sentence structure when needed, and avoid generic AI-sounding prose.

## Content Standards

When expanding or rewriting posts:

- Add depth from the perspective of a data/AI infrastructure practitioner.
- Prefer systems thinking: trade-offs, failure modes, operational implications, architecture boundaries, and production constraints.
- Keep claims calibrated. Avoid overclaiming and avoid marketing language.
- Preserve useful existing diagrams and images.
- Keep code snippets realistic and technically valid.
- Keep Chinese posts readable in Chinese while preserving important English technical terms.

## Image Rules

The repo uses Hexo `post_asset_folder: true`.

- For an original post, store images in `source/_posts/<post-slug>/`.
- In the same post, prefer:
  ```md
  {% asset_img image-name.png "Alt text" %}
  ```
- For an English translation with a different slug that reuses the Chinese article's image, prefer an absolute site path:
  ```md
  ![Alt text](/YYYY/MM/DD/original-post-slug/image-name.png)
  ```
- Avoid ad hoc shared image folders such as `source/_posts/images/` unless the site is intentionally redesigned for shared assets.
- Always verify generated HTML references the expected image path.

## Theme and Routing Rules

Current bilingual behavior depends on these files:

- `_config.yml`: English default; home/archive pagination disabled to avoid mixed-language pagination artifacts.
- `scripts/language-pages.js`: generates `/zh/`, `/zh/archives/`, `/zh/tags/`, and Chinese tag archives.
- `themes/maupassant/layout/base.pug`: language switch and localized nav paths.
- `themes/maupassant/layout/index.pug`, `archive.pug`, `tagcloud.pug`: language-filtered listing pages.
- `themes/maupassant/layout/_widget/recent_posts.pug`, `_widget/tag.pug`: language-filtered sidebar widgets.
- `themes/maupassant/layout/post.pug`: article-level translation link.
- `themes/maupassant/layout/_partial/tag.pug`: language-aware article tag links.

When editing Pug templates:

- In templates that `extends base`, put executable JavaScript inside named blocks, not at the top level.
- Partial templates do not automatically inherit mixins; include helpers explicitly or render simple fields directly.
- Disable partial caching for language-sensitive widgets.
- Handle both Hexo Query objects and plain arrays (`toArray()` may or may not exist).

## Validation

Use the bundled Node runtime if the shell cannot find `node` or `npx`:

```powershell
C:\Users\Loaner\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\hexo\bin\hexo clean
C:\Users\Loaner\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\hexo\bin\hexo generate
```

For Chinese file reads in PowerShell, use UTF-8 explicitly:

```powershell
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Get-Content path\to\file.md -Raw -Encoding UTF8
```

After bilingual or image changes, check:

- English home/archive/topic pages do not show Chinese titles.
- `/zh/`, `/zh/archives/`, and `/zh/tags/` show Chinese content.
- Article language links point to the counterpart version.
- Reused images render from the intended generated path.
