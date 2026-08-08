# Jack's AI Studio Blog Rules

## Repository Identity

This repository is a Hexo blog for **Jack's AI Studio** at `blog.thejackstudio.com`.

Position the site as:

- Professional, international, and consulting-ready.
- Written by a practitioner who understands AI systems, database systems, data platforms, agent infrastructure, reliability, operating systems, and production engineering.
- More like a technical studio notebook than a personal diary or generic content site.

Do not make the tone overly promotional. The blog should earn trust through clear reasoning, systems depth, and practical judgment.

## Language and Translation Principles

English is the default language for the public-facing first impression. Chinese remains fully supported through `/zh/`.

When translating Chinese posts into English:

- Translate by meaning, not sentence order.
- Prefer natural English paragraph structure.
- Remove awkward repetition that is acceptable in drafts but weak in English.
- Preserve important terms such as `MVCC`, `SLO`, `Error Budget`, `HTAP`, `epoll`, `Tabular Representation Learning`, and `agent runtime`.
- Expand context when an international reader may not share the same background.
- Keep the article technically conservative. Do not add unsupported hype.
- Avoid phrases that read like generic AI output, such as "delve into", "in today's rapidly evolving landscape", "unlock the full potential", and repetitive "it is important to note".
- Use concrete nouns and active verbs.

When editing Chinese posts:

- Keep Chinese prose natural and concise.
- Preserve English technical terms where they are standard in industry.
- Avoid replacing precise engineering terms with vague Chinese paraphrases.
- Keep the author's point of view visible: practical, analytical, and systems-oriented.

## Required Frontmatter Patterns

Chinese source post:

```yaml
---
title: 中文标题
description: 中文摘要
category: Chinese
date: YYYY-MM-DD
updated: YYYY-MM-DD
lang: zh-CN
translation_url: /YYYY/MM/DD/english-slug/
tags:
  - database
---
```

English translation:

```yaml
---
title: "English Title"
description: "English summary."
category: English
date: YYYY-MM-DD
updated: YYYY-MM-DD
lang: en
translation_url: /YYYY/MM/DD/chinese-slug/
tags:
  - database
---
```

Rules:

- Use the same `date` for both language versions.
- Use `updated` for the date of the rewrite/translation.
- Add `mathjax2: true` if the article contains LaTeX formulas and the source used it.
- Keep `translation_url` absolute from the site root.

## URL and File Naming

Current permalink:

```yaml
permalink: :year/:month/:day/:title/
```

Practical convention:

- Chinese original: `source/_posts/<slug>.md`
- English translation: `source/_posts/<slug>-en.md`
- Do not rename existing slugs casually; URLs are already published.
- If a title changes, keep the filename stable unless the user explicitly asks to change the URL.

## Image Storage and References

The blog uses:

```yaml
post_asset_folder: true
```

For a post with slug `large-scale-data-processing`, store images in:

```text
source/_posts/large-scale-data-processing/
```

From the same post, reference with:

```md
{% asset_img large-scale-data-processing-0.png "CAP theorem as a visual guide to consistency, availability, and partition tolerance" %}
```

For a translated post such as `large-scale-data-processing-en.md`, Hexo would look for assets under `large-scale-data-processing-en/` if `asset_img` is used. To reuse the original images without duplication, use:

```md
![CAP theorem as a visual guide to consistency, availability, and partition tolerance](/2019/08/21/large-scale-data-processing/large-scale-data-processing-0.png)
```

Avoid:

- `source/_posts/images/` for post-local images.
- Broken relative Markdown paths such as `./image.png` unless verified.
- Removing old images without checking generated HTML references.

Validation:

```powershell
rg -n "image-name|original-slug" public\YYYY\MM\DD\translated-slug\index.html
```

## Bilingual Theme Architecture

The blog intentionally uses a lightweight bilingual architecture instead of a full Hexo i18n plugin.

Expected behavior:

- `/` shows English posts.
- `/archives/` shows English posts.
- `/tags/` shows English topics and English posts.
- `/zh/` shows Chinese posts.
- `/zh/archives/` shows Chinese posts.
- `/zh/tags/` and `/zh/tags/<tag>/` show Chinese topics and Chinese posts.
- Article pages have an `EN / 中文` language switch and an article-level counterpart link.

Do not reintroduce the category widget as the main language selector. Categories `English` and `Chinese` are metadata, not the primary UX.

Important files:

- `_config.yml`
- `scripts/language-pages.js`
- `themes/jas-studio/_config.yml`
- `themes/jas-studio/layout/base.pug`
- `themes/jas-studio/layout/index.pug`
- `themes/jas-studio/layout/archive.pug`
- `themes/jas-studio/layout/tagcloud.pug`
- `themes/jas-studio/layout/post.pug`
- `themes/jas-studio/layout/_partial/tag.pug`
- `themes/jas-studio/layout/_widget/recent_posts.pug`
- `themes/jas-studio/layout/_widget/tag.pug`
- `themes/jas-studio/source/css/style.scss`

## Hexo and Pug Pitfalls Already Encountered

Pug `extends` rule:

- Do not put executable JavaScript at the top level of a template that starts with `extends base`.
- Put code inside `block content` or another named block.
- Otherwise Pug can throw: `Only named blocks and mixins can appear at the top level of an extending template`.

Partial mixin scope:

- Widget partials do not automatically have mixins from parent templates.
- Avoid calling `+title(post)` in a widget unless the helper is included there.
- Safer fallback: `= post.title || _p('no-title')`.

Language-sensitive partial caching:

- Sidebar widgets that depend on `page.lang_filter` or current page language must not be cached across pages.
- In `base.pug`, language-sensitive widget partials should use `{cache: false}`.

Hexo Query vs array:

- `site.posts` and `page.posts` may be Hexo Query objects in some contexts and arrays in generated custom pages.
- Use defensive handling:

```js
var posts = page.posts ? (page.posts.toArray ? page.posts.toArray() : page.posts) : [];
```

Pagination and filtering:

- Mixed-language pagination can create sparse or confusing pages after filtering.
- Home and archive pagination are disabled in `_config.yml` to keep filtered language views clean.

PowerShell encoding:

- Chinese may display as mojibake unless UTF-8 is set explicitly.

```powershell
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Get-Content file.md -Raw -Encoding UTF8
```

## Content Expansion Checklist

When improving an older/simple article:

- Identify the original useful core; preserve it if possible.
- Add the underlying model or theory, not just more examples.
- Add production trade-offs and failure modes.
- Add concrete SQL, shell, Rust, or system examples when relevant.
- Preserve original diagrams if they still help.
- Add references when the post depends on specific external facts or named papers.
- Keep the conclusion opinionated but measured.

Examples:

- Database locking articles should connect business invariants, MVCC, isolation levels, lock scope, retry behavior, and operational risks.
- Data processing articles should connect ACID, CAP, BASE, PACELC, MapReduce, Spark, lakehouse, streaming, HTAP, governance, and AI-era data infrastructure.
- Linux IO articles should explain both API behavior and kernel-level mechanisms such as wait queues, callbacks, and ready lists.
- SRE/availability articles should connect metrics to user experience, observability, mathematical aggregation, and operational governance.

## Build and Verification Commands

Preferred generation commands on this Windows workstation:

```powershell
C:\Users\Loaner\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\hexo\bin\hexo clean
C:\Users\Loaner\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\hexo\bin\hexo generate
```

Useful checks:

```powershell
rg -n "Chinese title pattern" public\index.html public\archives\index.html
rg -n "English Title" public\index.html public\archives\index.html
rg -n "Read in English|阅读中文版" public\YYYY\MM\DD\slug\index.html
rg -n "/YYYY/MM/DD/original-slug/image-name" public\YYYY\MM\DD\translated-slug\index.html
```

For local manual review, use the existing Hexo workflow or dev server already configured by the user. Do not start extra long-running servers unless the user asks or live visual verification is needed.

## Editing Discipline

- Use `rg` / `rg --files` for search.
- Use `apply_patch` for manual edits.
- Do not edit generated `public/` as source of truth.
- Do not overwrite unrelated dirty working-tree changes.
- Run `git status --short` before and after substantial edits.
- Mention generated-file verification in the final answer, but do not stage or commit unless asked.
