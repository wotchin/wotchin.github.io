# Jack's AI Studio Theme

A custom Hexo theme for [Jack's AI Studio](https://blog.thejackstudio.com), designed and maintained by [wotchin](https://github.com/wotchin).

The theme is tailored for a bilingual (English / Chinese) technical blog covering AI systems, databases, data infrastructure, and agent infrastructure.

## Features

- Lightweight bilingual architecture: English at `/`, Chinese at `/zh/`, with an article-level language switch.
- Slim sticky header with frosted-glass effect and segmented language switcher.
- Collapsible floating table of contents that never disturbs the reading column.
- Reading-first typography with a restrained, professional color palette.
- Language-filtered home, archive, and tag pages.
- Sidebar widgets: search, author info, recent posts, tags.

## Structure

- `layout/` — Pug templates (`base.pug`, `index.pug`, `post.pug`, `archive.pug`, `tagcloud.pug`, partials and widgets).
- `source/css/` — SCSS sources, compiled to `public/css/`.
- `source/js/` — Client-side scripts (TOC toggle, code block tools, back-to-top, etc.).
- `languages/` — i18n strings.
- `_config.yml` — Theme configuration.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 wotchin.
