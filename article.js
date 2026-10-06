const articleRoot = document.querySelector("#article-content");

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
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
      select: "title,body,excerpt,category,featured_image_url,image_alt,source_url,created_at",
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
