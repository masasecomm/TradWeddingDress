const articleRoot = document.querySelector("#article-content");

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function updateArticleMetadata(post) {
  const title = `${post.title} | Traditional Wedding Dress`;
  const description = String(post.excerpt || post.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const image = post.featured_image_url || "";
  const imageAlt = post.image_alt || post.title;

  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
  for (const [selector, content] of [
    ['meta[property="og:type"]', "article"],
    ['meta[property="og:title"]', title],
    ['meta[property="og:description"]', description],
    ['meta[property="og:url"]', location.href],
    ['meta[property="og:image"]', image],
    ['meta[property="og:image:alt"]', imageAlt],
    ['meta[name="twitter:title"]', title],
    ['meta[name="twitter:description"]', description],
    ['meta[name="twitter:image"]', image],
    ['meta[name="twitter:image:alt"]', imageAlt]
  ]) {
    let tag = document.querySelector(selector);
    if (!tag) {
      const [, attribute, value] = selector.match(/\[(name|property)="([^"]+)"\]/);
      tag = document.createElement("meta");
      tag.setAttribute(attribute, value);
      document.head.append(tag);
    }
    tag.content = content;
  }
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = location.href;
  const oldSchema = document.querySelector("#article-structured-data");
  if (oldSchema) oldSchema.remove();
  const schema = document.createElement("script");
  schema.id = "article-structured-data";
  schema.type = "application/ld+json";
  schema.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    image: image ? [image] : [],
    datePublished: post.published_at || post.created_at,
    author: { "@type": "Organization", name: "Traditional Wedding Dress" },
    mainEntityOfPage: location.href
  }).replace(/</g, "\\u003c");
  document.head.append(schema);
}

async function loadArticle() {
  const config = window.APP_CONFIG;
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !config?.supabaseUrl || !config?.supabaseAnonKey || config.supabaseUrl.includes("YOUR_PROJECT")) {
    articleRoot.innerHTML = '<p class="empty-message">This post could not be found. <a href="./">Return to the blog</a>.</p>';
    return;
  }
  try {
    const query = new URLSearchParams({
      select: "title,body,excerpt,category,featured_image_url,image_alt,source_url,created_at,published_at,status",
      id: `eq.${id}`,
      limit: "1"
    });
    let authorization = "";
    try {
      const editorSession = JSON.parse(sessionStorage.getItem("threadTraditionEditorSession") || "null");
      if (editorSession?.access_token) authorization = `Bearer ${editorSession.access_token}`;
    } catch {
      authorization = "";
    }
    const response = await fetch(`${config.supabaseUrl}/rest/v1/posts?${query}`, {
      headers: {
        apikey: config.supabaseAnonKey,
        ...(authorization ? { Authorization: authorization } : {})
      }
    });
    if (!response.ok) throw new Error("The blog post could not be loaded.");
    const [post] = await response.json();
    if (!post) {
      articleRoot.innerHTML = '<p class="empty-message">This post is not available. <a href="./">Return to the blog</a>.</p>';
      return;
    }
    updateArticleMetadata(post);
    const paragraphs = post.body.split(/\n{2,}/).map((paragraph) => `<p>${safeText(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
    articleRoot.innerHTML = `
      <article class="article-body">
        <a class="article-back" href="./#recent-posts">← Back to the blog</a>
        <header class="article-heading">
          <p class="plain-kicker">${safeText(post.category || "Bridal style")}</p>
          <h1>${safeText(post.title)}</h1>
          <p class="article-deck">${safeText(post.excerpt)}</p>
          <p class="article-byline">From the blog <span aria-hidden="true">|</span> ${new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
        </header>
        ${post.featured_image_url ? `<img class="article-image" src="${safeText(post.featured_image_url)}" alt="${safeText(post.image_alt || post.title)}">` : ""}
        <div class="article-copy">${paragraphs}</div>
        ${post.source_url ? `<p class="source-note">Image inspiration: <a href="${safeText(post.source_url)}" target="_blank" rel="noopener noreferrer">view the original Instagram post ↗</a></p>` : ""}
      </article>`;
  } catch (error) {
    articleRoot.innerHTML = `<p class="empty-message">${safeText(error.message)} <a href="./">Return to the blog</a>.</p>`;
  }
}

loadArticle();
