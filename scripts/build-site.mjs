import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const siteOrigin = "https://traditionalweddingdress.com";
const publicFiles = [
  "index.html",
  "about.html",
  "contact.html",
  "admin.html",
  "article.html",
  "404.html",
  "app.js",
  "article.js",
  "admin.js",
  "contact.js",
  "config.js",
  "styles.css",
  "turnstile.html",
  "CNAME",
  "google48d0f696ee319326.html"
];
const postFields = [
  "id",
  "title",
  "excerpt",
  "body",
  "category",
  "featured_image_url",
  "image_alt",
  "source_url",
  "created_at",
  "published_at",
  "status"
].join(",");

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function plainText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value, maximum) {
  const text = plainText(value);
  if (text.length <= maximum) return text;
  const clipped = text.slice(0, maximum - 1);
  const wordBoundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, wordBoundary > maximum * 0.7 ? wordBoundary : maximum - 1).trimEnd()}…`;
}

export function postSlug(post) {
  const title = String(post.title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "wedding-dress";
  const id = String(post.id ?? "");
  if (!/^[a-z0-9-]{8,64}$/i.test(id)) throw new Error(`Post has an invalid id: ${id}`);
  return `${title}-${id.toLowerCase()}`;
}

export function postUrl(post) {
  return `${siteOrigin}/posts/${encodeURIComponent(postSlug(post))}/`;
}

export function postDescription(post) {
  const excerpt = plainText(post.excerpt);
  const description = excerpt.length >= 50 ? excerpt : `${excerpt} ${plainText(post.body)}`;
  return clipText(description, 160);
}

function articleBody(body) {
  const content = String(body ?? "").trim();
  return content.split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function publishedDate(post) {
  const value = post.published_at || post.created_at;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Post "${post.title}" has an invalid publish date.`);
  return date.toISOString();
}

function renderPost(post) {
  const title = plainText(post.title);
  const description = postDescription(post);
  const url = postUrl(post);
  const image = String(post.featured_image_url ?? "");
  const imageAlt = plainText(post.image_alt) || title;
  const date = publishedDate(post);
  const category = plainText(post.category) || "Bridal style";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteOrigin}/#organization`,
        name: "Traditional Wedding Dress",
        url: `${siteOrigin}/`
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteOrigin}/` },
          { "@type": "ListItem", position: 2, name: title, item: url }
        ]
      },
      {
        "@type": "BlogPosting",
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        headline: title,
        description,
        image: [image],
        datePublished: date,
        dateModified: date,
        author: { "@type": "Organization", name: "Traditional Wedding Dress", url: `${siteOrigin}/about.html` },
        publisher: { "@id": `${siteOrigin}/#organization` },
        articleSection: category,
        inLanguage: "en-ZA"
      }
    ]
  };

  return `<!doctype html>
<html lang="en-ZA">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <title>${escapeHtml(title)} | Traditional Wedding Dress</title>
    <link rel="canonical" href="${escapeHtml(url)}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Traditional Wedding Dress">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(url)}">
    <meta property="og:image" content="${escapeHtml(image)}">
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">
    <meta property="article:published_time" content="${escapeHtml(date)}">
    <meta property="article:section" content="${escapeHtml(category)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(image)}">
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">
    <script type="application/ld+json">${safeJson(structuredData)}</script>
    <script>
      window.addEventListener("load", () => window.setTimeout(() => {
        const ads = document.createElement("script");
        ads.async = true;
        ads.crossOrigin = "anonymous";
        ads.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3860151941190347";
        document.head.append(ads);
      }, 8000), { once: true });
    </script>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="editorial-page">
    <header class="site-header">
      <a class="header-menu" href="/#recent-posts"><span aria-hidden="true">←</span><span>Posts</span></a>
      <a class="brand" href="/" aria-label="Traditional Wedding Dress home"><span>TRADITIONAL<span class="brand-accent"> WEDDING</span><span class="brand-period"> DRESS</span></span></a>
      <a class="header-link" href="/about.html">About us <span aria-hidden="true">↗</span></a>
    </header>
    <main class="article-shell">
      <article class="article-body" itemscope itemtype="https://schema.org/BlogPosting">
        <a class="article-back" href="/#recent-posts">← Back to the blog</a>
        <header class="article-heading">
          <p class="plain-kicker">${escapeHtml(category)}</p>
          <h1 itemprop="headline">${escapeHtml(title)}</h1>
          <p class="article-deck" itemprop="description">${escapeHtml(description)}</p>
          <p class="article-byline">Traditional Wedding Dress <span aria-hidden="true">|</span> <time datetime="${escapeHtml(date)}" itemprop="datePublished">${new Date(date).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}</time></p>
        </header>
        <figure>
          <img class="article-image" src="${escapeHtml(image)}" alt="${escapeHtml(imageAlt)}" fetchpriority="high" itemprop="image">
        </figure>
        <div class="article-copy" itemprop="articleBody">
          ${articleBody(post.body)}
        </div>
        ${post.source_url ? `<p class="source-note">Image inspiration: <a href="${escapeHtml(post.source_url)}" target="_blank" rel="noopener noreferrer">view the original Instagram post ↗</a></p>` : ""}
      </article>
    </main>
    <footer class="site-footer editorial-footer">
      <div class="footer-main content-width">
        <div class="footer-about"><a class="footer-brand" href="/">TRADITIONAL<span> WEDDING</span> DRESS</a><p>A blog celebrating traditional wedding dresses and the stories woven into every look.</p></div>
        <div><h2>Explore</h2><a href="/#recent-posts">Recent posts</a><a href="/#latest-news">Latest posts</a></div>
        <div><h2>About</h2><a href="/about.html">About us</a><a href="/contact.html">Contact us</a><a href="/admin.html">Editor sign in</a></div>
        <div class="footer-social"><h2>Follow</h2><a href="https://www.facebook.com/traditionalweddingdress/" target="_blank" rel="noopener noreferrer">Facebook ↗</a><a href="https://za.pinterest.com/traditionalweddingdress/" target="_blank" rel="noopener noreferrer">Pinterest ↗</a></div>
      </div>
      <div class="footer-bottom content-width"><span>© ${new Date(date).getUTCFullYear()} Traditional Wedding Dress</span><span>Celebrating the traditions we wear.</span></div>
    </footer>
  </body>
</html>`;
}

function sitemapXml(posts) {
  const staticUrls = [
    `${siteOrigin}/`,
    `${siteOrigin}/about.html`,
    `${siteOrigin}/contact.html`
  ];
  const entries = [
    ...staticUrls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`),
    ...posts.map((post) => {
      const date = publishedDate(post).slice(0, 10);
      const image = String(post.featured_image_url ?? "");
      const imageEntry = image
        ? `<image:image><image:loc>${escapeHtml(image)}</image:loc><image:title>${escapeHtml(plainText(post.title))}</image:title></image:image>`
        : "";
      return `  <url><loc>${escapeHtml(postUrl(post))}</loc><lastmod>${date}</lastmod>${imageEntry}</url>`;
    })
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`;
}

function homePostLinks(posts) {
  if (posts.length === 0) return '<p class="empty-message">The blog is getting ready. Published posts will appear here.</p>';
  return posts.slice(0, 3).map((post) => {
    const url = postUrl(post);
    const image = post.featured_image_url
      ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(plainText(post.image_alt) || plainText(post.title))}" loading="lazy">`
      : '<span class="image-placeholder-mark" aria-hidden="true">T&amp;T</span>';
    return `<article class="recent-card"><a class="recent-image zoom-img" href="${escapeHtml(url)}" aria-label="Read ${escapeHtml(post.title)}">${image}</a><div class="recent-meta"><span class="plain-kicker">${escapeHtml(plainText(post.category) || "Bridal style")}</span><time datetime="${escapeHtml(publishedDate(post))}">${new Date(publishedDate(post)).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}</time></div><h3><a href="${escapeHtml(url)}">${escapeHtml(post.title)}</a></h3><p>${escapeHtml(postDescription(post))}</p></article>`;
  }).join("\n");
}

function featuredCard(post, size) {
  const titleTag = size === "main" ? "h1" : "h2";
  const image = post.featured_image_url
    ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(plainText(post.image_alt) || plainText(post.title))}" loading="${size === "main" ? "eager" : "lazy"}"${size === "main" ? ' fetchpriority="high"' : ""}>`
    : "";
  const url = postUrl(post);
  const date = publishedDate(post);
  return `<a class="feature-card feature-card-${size}${image ? "" : " feature-placeholder"}" href="${escapeHtml(url)}">${image}<div class="feature-overlay"></div><div class="feature-content"><span class="category-chip">${escapeHtml(plainText(post.category) || "Bridal style")}</span><${titleTag}>${escapeHtml(plainText(post.title))}</${titleTag}><p class="feature-byline">From the blog <span aria-hidden="true">|</span> ${new Date(date).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}</p></div></a>`;
}

function featureNote(category, title, description, alternate = false) {
  return `<div class="feature-card feature-card-small feature-placeholder${alternate ? " feature-placeholder-alt" : ""} feature-note"><div class="feature-overlay"></div><div class="feature-content"><span class="category-chip">${category}</span><h2>${title}</h2><p>${description}</p></div></div>`;
}

function homeFeaturePosts(posts) {
  const featured = posts.slice(0, 3);
  if (featured.length === 0) return null;
  const side = featured.slice(1).map((post) => featuredCard(post, "small"));
  if (side.length < 2) {
    side.push(featureNote(
      featured.length === 1 ? "The details" : "Heritage & celebration",
      featured.length === 1 ? "Beadwork, colour & craft" : "Every celebration has its own style",
      featured.length === 1 ? "A closer look at what makes a bridal look memorable." : "Find inspiration in the details that feel like you.",
      featured.length === 1
    ));
  }
  if (side.length < 2) {
    side.push(featureNote("Heritage & celebration", "Every celebration has its own style", "Find inspiration in the details that feel like you.", true));
  }
  return `${featuredCard(featured[0], "main")}<div class="feature-side">${side.join("")}</div>`;
}

function latestPostRows(posts) {
  const latest = posts.slice(3);
  if (latest.length === 0) return '<p class="empty-message">More blog posts will appear here as they are published.</p>';
  return latest.map((post) => {
    const url = escapeHtml(postUrl(post));
    const image = post.featured_image_url
      ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(plainText(post.image_alt) || plainText(post.title))}" loading="lazy">`
      : '<span class="image-placeholder-mark" aria-hidden="true">T&amp;T</span>';
    return `<article class="news-row"><a class="news-image zoom-img" href="${url}" aria-label="Read ${escapeHtml(post.title)}">${image}</a><div class="news-copy"><span class="plain-kicker">${escapeHtml(plainText(post.category) || "Bridal style")}</span><h3><a href="${url}">${escapeHtml(plainText(post.title))}</a></h3><p>${escapeHtml(postDescription(post))}</p><a class="read-link" href="${url}">Read article <span aria-hidden="true">↗</span></a></div></article>`;
  }).join("\n");
}

function trendingPosts(posts) {
  if (posts.length === 0) return '<li class="aside-empty">New posts will appear here as they are published.</li>';
  return posts.slice(0, 4).map((post) => {
    const url = escapeHtml(postUrl(post));
    const image = post.featured_image_url
      ? `<img src="${escapeHtml(post.featured_image_url)}" alt="" loading="lazy">`
      : "<span aria-hidden=\"true\">T&amp;T</span>";
    const date = publishedDate(post);
    return `<li class="trending-item"><a class="trending-image" href="${url}" aria-label="Read ${escapeHtml(post.title)}">${image}</a><div><a class="trending-title" href="${url}">${escapeHtml(plainText(post.title))}</a><time datetime="${escapeHtml(date)}">${new Date(date).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}</time></div></li>`;
  }).join("\n");
}

function replaceGeneratedContent(html, name, content) {
  const startMarker = `<!-- ${name}_START -->`;
  const endMarker = `<!-- ${name}_END -->`;
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start || html.indexOf(startMarker, start + startMarker.length) !== -1 || html.indexOf(endMarker, end + endMarker.length) !== -1) {
    throw new Error(`The home page must contain exactly one ordered ${name} marker pair.`);
  }
  const blockContent = content === null
    ? html.slice(start + startMarker.length, end)
    : content;
  return `${html.slice(0, start)}${blockContent}${html.slice(end + endMarker.length)}`;
}

export async function generateSite(posts, outputDirectory) {
  const root = process.cwd();
  const destination = path.resolve(outputDirectory);
  const resolvedRoot = path.resolve(root);
  if (destination === resolvedRoot || !destination.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("The generated site directory must be inside the repository.");
  }
  const visiblePosts = posts.filter((post) => post.status === "published");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of publicFiles) {
    await cp(path.join(root, file), path.join(destination, file));
  }
  await writeFile(path.join(destination, ".nojekyll"), "", "utf8");
  const indexPath = path.join(destination, "index.html");
  let indexHtml = await readFile(indexPath, "utf8");
  const featured = homeFeaturePosts(visiblePosts);
  indexHtml = replaceGeneratedContent(indexHtml, "FEATURED_POSTS", featured);
  indexHtml = replaceGeneratedContent(indexHtml, "RECENT_POSTS", homePostLinks(visiblePosts));
  indexHtml = replaceGeneratedContent(indexHtml, "LATEST_POSTS", latestPostRows(visiblePosts));
  indexHtml = replaceGeneratedContent(indexHtml, "TRENDING_POSTS", trendingPosts(visiblePosts));
  const storyCountMarker = "<!-- GENERATED_STORY_COUNT -->";
  if (!indexHtml.includes(storyCountMarker)) throw new Error(`The home page is missing ${storyCountMarker}.`);
  const storyCount = visiblePosts.length ? `${String(visiblePosts.length).padStart(2, "0")} ${visiblePosts.length === 1 ? "POST" : "POSTS"}` : "THE FIRST POST IS WAITING";
  await writeFile(indexPath, indexHtml.replace(storyCountMarker, storyCount), "utf8");
  for (const post of visiblePosts) {
    const folder = path.join(destination, "posts", postSlug(post));
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "index.html"), renderPost(post), "utf8");
  }
  await writeFile(path.join(destination, "sitemap.xml"), sitemapXml(visiblePosts), "utf8");
  await writeFile(path.join(destination, "robots.txt"), [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin.html",
    "Disallow: /article.html",
    "Disallow: /turnstile.html",
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    ""
  ].join("\n"), "utf8");
  return { outputDirectory: destination, postCount: visiblePosts.length };
}

async function loadPublicConfig(repositoryRoot) {
  const configSource = await readFile(path.join(repositoryRoot, "config.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(configSource, context, { timeout: 1000 });
  const config = context.window?.APP_CONFIG;
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    throw new Error("config.js must define the public Supabase URL and anon key.");
  }
  const projectUrl = new URL(config.supabaseUrl);
  if (projectUrl.protocol !== "https:" || !projectUrl.hostname.endsWith(".supabase.co")) {
    throw new Error("config.js must point to a trusted Supabase HTTPS project URL.");
  }
  return config;
}

export async function fetchPublishedPosts(config) {
  const posts = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    const query = new URLSearchParams({
      select: postFields,
      status: "eq.published",
      order: "published_at.desc"
    });
    const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/posts?${query}`, {
      headers: {
        apikey: config.supabaseAnonKey,
        Range: `${offset}-${offset + batchSize - 1}`,
        Prefer: "count=exact"
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status} while loading published posts.`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("Supabase returned an unexpected posts response.");
    posts.push(...batch);
    if (batch.length < batchSize) break;
  }
  return posts;
}

async function main() {
  const repositoryRoot = process.cwd();
  const outputDirectory = path.join(repositoryRoot, "_site");
  const config = await loadPublicConfig(repositoryRoot);
  const posts = await fetchPublishedPosts(config);
  const result = await generateSite(posts, outputDirectory);
  console.log(`Generated ${result.postCount} static article pages in ${result.outputDirectory}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
