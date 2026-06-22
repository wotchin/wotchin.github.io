'use strict';

function languageOf(post) {
  const declared = String(post.lang || post.language || '').toLowerCase();
  if (declared.startsWith('zh')) return 'zh';
  if (declared.startsWith('en')) return 'en';

  const categories = post.categories && post.categories.toArray ? post.categories.toArray() : [];
  for (const category of categories) {
    const name = String(category.name || '').toLowerCase();
    if (name === 'chinese') return 'zh';
    if (name === 'english') return 'en';
  }

  return 'en';
}

hexo.extend.generator.register('language_pages', function languagePages(locals) {
  const zhPosts = locals.posts.sort('-date').toArray().filter(post => languageOf(post) === 'zh');
  const tagMap = new Map();

  for (const post of zhPosts) {
    const tags = post.tags && post.tags.toArray ? post.tags.toArray() : [];
    for (const tag of tags) {
      const slug = tag.slug || tag.name;
      if (!tagMap.has(slug)) {
        tagMap.set(slug, { tag, posts: [] });
      }
      tagMap.get(slug).posts.push(post);
    }
  }

  const routes = [
    {
      path: 'zh/index.html',
      layout: ['index'],
      data: {
        title: '中文文章',
        lang_filter: 'zh',
        posts: zhPosts
      }
    },
    {
      path: 'zh/archives/index.html',
      layout: ['archive'],
      data: {
        title: '中文归档',
        archive: true,
        lang_filter: 'zh',
        posts: zhPosts
      }
    },
    {
      path: 'zh/tags/index.html',
      layout: ['tagcloud'],
      data: {
        title: '中文主题',
        lang_filter: 'zh'
      }
    }
  ];

  for (const [slug, data] of tagMap.entries()) {
    routes.push({
      path: `zh/tags/${slug}/index.html`,
      layout: ['archive'],
      data: {
        title: data.tag.name,
        tag: data.tag.name,
        lang_filter: 'zh',
        posts: data.posts
      }
    });
  }

  return routes;
});
