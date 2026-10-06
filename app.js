const featureGrid = document.querySelector("#featured");
const recentGrid = document.querySelector("#recent-grid");
const storyCount = document.querySelector("#story-count");
const newsList = document.querySelector("#news-list");
const trendingList = document.querySelector("#trending-list");
const menuToggle = document.querySelector(".header-menu");
const siteMenu = document.querySelector("#site-menu");

menuToggle.addEventListener("click", () => {
  const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isExpanded));
  siteMenu.hidden = isExpanded;
});

siteMenu.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuToggle.setAttribute("aria-expanded", "false");
  siteMenu.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || siteMenu.hidden) return;
  menuToggle.setAttribute("aria-expanded", "false");
  siteMenu.hidden = true;
  menuToggle.focus();
});

document.querySelector("#year").textContent = new Date().getFullYear();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function articleUrl(post) {
  return `article.html?id=${encodeURIComponent(post.id)}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function featureCard(post, size) {
  const titleTag = size === "main" ? "h1" : "h2";
  const image = post.featured_image_url
    ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(post.image_alt || post.title)}" loading="${size === "main" ? "eager" : "lazy"}">`
    : "";
  return `
    <a class="feature-card feature-card-${size}${image ? "" : " feature-placeholder"}" href="${articleUrl(post)}">
      ${image}
      <div class="feature-overlay"></div>
      <div class="feature-content">
        <span class="category-chip">${escapeHtml(post.category || "Bridal style")}</span>
        <${titleTag}>${escapeHtml(post.title)}</${titleTag}>
        <p class="feature-byline">From the blog <span aria-hidden="true">|</span> ${formatDate(post.created_at)}</p>
      </div>
    </a>`;
}

function recentCard(post) {
  return `
    <article class="recent-card">
      <a class="recent-image zoom-img" href="${articleUrl(post)}" aria-label="Read ${escapeHtml(post.title)}">
        ${post.featured_image_url
          ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(post.image_alt || post.title)}" loading="lazy">`
          : '<span class="image-placeholder-mark" aria-hidden="true">T&T</span>'}
      </a>
      <div class="recent-meta">
        <span class="plain-kicker">${escapeHtml(post.category || "Bridal style")}</span>
        <time datetime="${escapeHtml(post.created_at)}">${formatDate(post.created_at)}</time>
      </div>
      <h3><a href="${articleUrl(post)}">${escapeHtml(post.title)}</a></h3>
      <p>${escapeHtml(post.excerpt)}</p>
    </article>`;
}

function newsRow(post) {
  return `
    <article class="news-row">
      <a class="news-image zoom-img" href="${articleUrl(post)}" aria-label="Read ${escapeHtml(post.title)}">
        ${post.featured_image_url
          ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(post.image_alt || post.title)}" loading="lazy">`
          : '<span class="image-placeholder-mark" aria-hidden="true">T&T</span>'}
      </a>
      <div class="news-copy">
        <span class="plain-kicker">${escapeHtml(post.category || "Bridal style")}</span>
        <h3><a href="${articleUrl(post)}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <a class="read-link" href="${articleUrl(post)}">Read article <span aria-hidden="true">↗</span></a>
      </div>
    </article>`;
}

function trendingItem(post) {
  return `
    <li class="trending-item">
      <a class="trending-image" href="${articleUrl(post)}" aria-label="Read ${escapeHtml(post.title)}">
        ${post.featured_image_url
          ? `<img src="${escapeHtml(post.featured_image_url)}" alt="" loading="lazy">`
          : '<span aria-hidden="true">T&T</span>'}
      </a>
      <div>
        <a class="trending-title" href="${articleUrl(post)}">${escapeHtml(post.title)}</a>
        <time datetime="${escapeHtml(post.created_at)}">${formatDate(post.created_at)}</time>
      </div>
    </li>`;
}

function renderStories(posts) {
  if (posts.length === 0) {
    storyCount.textContent = "THE FIRST POST IS WAITING";
    recentGrid.innerHTML = '<p class="empty-message">The blog is getting ready. Published posts will appear here.</p>';
    newsList.innerHTML = '<p class="empty-message">Our first wedding-dress blog post is on its way.</p>';
    trendingList.innerHTML = '<li class="aside-empty">New posts will appear here as they are published.</li>';
    return;
  }

  storyCount.textContent = `${String(posts.length).padStart(2, "0")} ${posts.length === 1 ? "POST" : "POSTS"}`;
  const featured = posts.slice(0, 3);
  if (featured.length === 3) {
    featureGrid.innerHTML = `${featureCard(featured[0], "main")}<div class="feature-side">${featureCard(featured[1], "small")}${featureCard(featured[2], "small")}</div>`;
  } else if (featured.length === 2) {
    featureGrid.innerHTML = `${featureCard(featured[0], "main")}<div class="feature-side">${featureCard(featured[1], "small")}<div class="feature-card feature-card-small feature-placeholder feature-note"><div class="feature-overlay"></div><div class="feature-content"><span class="category-chip">Heritage & celebration</span><h2>Every celebration has its own style</h2><p>Find inspiration in the details that feel like you.</p></div></div></div>`;
  } else {
    featureGrid.innerHTML = `${featureCard(featured[0], "main")}<div class="feature-side"><div class="feature-card feature-card-small feature-placeholder feature-note"><div class="feature-overlay"></div><div class="feature-content"><span class="category-chip">The details</span><h2>Beadwork, colour & craft</h2><p>A closer look at what makes a bridal look memorable.</p></div></div><div class="feature-card feature-card-small feature-placeholder feature-placeholder-alt feature-note"><div class="feature-overlay"></div><div class="feature-content"><span class="category-chip">Heritage & celebration</span><h2>Every celebration has its own style</h2><p>Find inspiration in the details that feel like you.</p></div></div></div>`;
  }
  recentGrid.innerHTML = posts.slice(0, 3).map(recentCard).join("");
  const moreStories = posts.slice(3);
  newsList.innerHTML = moreStories.length
    ? moreStories.map(newsRow).join("")
    : '<p class="empty-message">More blog posts will appear here as they are published.</p>';
  trendingList.innerHTML = posts.slice(0, 4).map(trendingItem).join("");
}

async function loadStories() {
  const config = window.APP_CONFIG;
  if (!config?.supabaseUrl || !config?.supabaseAnonKey || config.supabaseUrl.includes("YOUR_PROJECT")) {
    storyCount.textContent = "BLOG SETUP IN PROGRESS";
    recentGrid.innerHTML = '<p class="empty-message">Connect the blog to Supabase to show published wedding-dress posts.</p>';
    newsList.innerHTML = '<p class="empty-message">New posts will appear here once your site is connected.</p>';
    return;
  }

  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/posts?select=id,title,excerpt,category,featured_image_url,image_alt,created_at&status=eq.published&order=created_at.desc`, {
      headers: { apikey: config.supabaseAnonKey }
    });
    if (!response.ok) throw new Error(`Could not load blog posts (${response.status}).`);
    renderStories(await response.json());
  } catch (error) {
    const message = escapeHtml(error.message);
    recentGrid.innerHTML = `<p class="empty-message">${message} Check your site configuration and Supabase connection.</p>`;
    newsList.innerHTML = "";
    storyCount.textContent = "BLOG UNAVAILABLE";
  }
}

loadStories();
