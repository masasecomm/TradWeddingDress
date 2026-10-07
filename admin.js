const appConfig = window.APP_CONFIG;
const loginPanel = document.querySelector("#login-panel");
const studioPanel = document.querySelector("#studio-panel");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const studioStatus = document.querySelector("#studio-status");
const postList = document.querySelector("#post-list");
const categoryList = document.querySelector("#category-list");
const sessionKey = "threadTraditionEditorSession";
const postFields = "id,title,excerpt,body,category,featured_image_url,image_alt,body_images,source_url,created_at,published_at,status";
let activeFilter = "all";
let pollTimer = null;
let posts = [];
let categories = [];
let analytics = new Map();
const photoUploads = new WeakMap();

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function postUrl(post) {
  const slug = String(post.title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "wedding-dress";
  return `/posts/${slug}-${encodeURIComponent(post.id)}/`;
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
}

function setStudioVisible(visible) {
  loginPanel.hidden = visible;
  studioPanel.hidden = !visible;
}

function configured() {
  return appConfig?.supabaseUrl && appConfig?.supabaseAnonKey && !appConfig.supabaseUrl.includes("YOUR_PROJECT");
}

async function request(path, options = {}) {
  const session = getSession();
  if (!session?.access_token) throw new Error("Please sign in again.");
  const response = await fetch(`${appConfig.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: appConfig.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  if (response.status === 401) {
    sessionStorage.removeItem(sessionKey);
    setStudioVisible(false);
    throw new Error("Your session expired. Please sign in again.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.details || data.error || `Request failed (${response.status}).`);
  return data;
}

async function loadCategories() {
  const params = new URLSearchParams({ select: "name", order: "name.asc" });
  categories = await request(`/rest/v1/categories?${params}`);
  const options = categories.map((category) =>
    `<option value="${escapeText(category.name)}">${escapeText(category.name)}</option>`
  ).join("");
  document.querySelector("#article-category").innerHTML = options;
  document.querySelectorAll("[data-field='category']").forEach((select) => {
    const selected = select.dataset.value || select.value;
    select.innerHTML = options;
    if (categories.some((category) => category.name === selected)) select.value = selected;
  });
  categoryList.innerHTML = categories.length
    ? categories.map(({ name }) => `<span class="category-chip">${escapeText(name)}</span>`).join("")
    : '<p class="empty-message">Add a category to organize your articles.</p>';
}

async function loadAnalytics() {
  const rows = await request("/rest/v1/rpc/get_editor_analytics", {
    method: "POST",
    body: "{}"
  });
  analytics = new Map(rows.map((row) => [row.post_id, row]));
  const totals = rows.reduce((sum, row) => ({
    views: sum.views + Number(row.total_views || 0),
    today: sum.today + Number(row.views_today || 0),
    live: sum.live + Number(row.active_viewers || 0)
  }), { views: 0, today: 0, live: 0 });
  document.querySelector("#total-views").textContent = totals.views.toLocaleString();
  document.querySelector("#today-views").textContent = totals.today.toLocaleString();
  document.querySelector("#live-viewers").textContent = totals.live.toLocaleString();
  document.querySelector("#post-count").textContent = posts.length.toLocaleString();
}

function displayDate(post) {
  const date = post.status === "published" && post.published_at ? post.published_at : post.created_at;
  const prefix = post.status === "published" ? "Published" : "Created";
  return `${prefix} ${new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

function renderPosts() {
  const shown = posts.filter((post) => activeFilter === "all" || post.status === activeFilter);
  if (!shown.length) {
    postList.innerHTML = `<p class="empty-message">No ${activeFilter === "all" ? "articles" : `${activeFilter} articles`} yet.</p>`;
    return;
  }
  postList.innerHTML = shown.map((post) => {
    const stats = analytics.get(post.id) || {};
    return `
      <article class="draft-item studio-post" data-post-id="${escapeText(post.id)}">
        ${post.featured_image_url ? `<img src="${escapeText(post.featured_image_url)}" alt="">` : '<div class="story-image story-placeholder">✳</div>'}
        <div class="post-editor">
          <div class="post-meta">
            <span class="status-pill ${post.status === "published" ? "published" : "draft"}">${escapeText(post.status)}</span>
            <span>${escapeText(displayDate(post))}</span>
            <span>${Number(stats.total_views || 0).toLocaleString()} views</span>
            <span>${Number(stats.views_today || 0).toLocaleString()} today</span>
            ${post.status === "published" && Number(stats.active_viewers || 0) ? `<span class="live-pill"><i class="live-dot"></i>${Number(stats.active_viewers)} viewing</span>` : ""}
          </div>
          <label class="form-label">Title<input class="text-input" data-field="title" value="${escapeText(post.title)}" minlength="5" maxlength="160" required></label>
          <label class="form-label">Category<select class="text-input" data-field="category" data-value="${escapeText(post.category || "")}"></select></label>
          <label class="form-label">Search description<textarea class="text-input draft-textarea" data-field="excerpt" minlength="20" maxlength="500" required>${escapeText(post.excerpt)}</textarea></label>
          <label class="form-label">Article<textarea class="text-input draft-textarea draft-body" data-field="body" minlength="100" maxlength="12000" required>${escapeText(post.body)}</textarea></label>
          <label class="form-label">Featured image URL<input class="text-input" data-field="featured_image_url" type="url" value="${escapeText(post.featured_image_url || "")}" required></label>
          <label class="form-label">Featured image description<input class="text-input" data-field="image_alt" value="${escapeText(post.image_alt || post.title)}" minlength="5" maxlength="250" required></label>
          <label class="form-label">More information link<input class="text-input" data-field="source_url" type="url" value="${escapeText(post.source_url || "")}"></label>
          <div class="draft-actions">
            <button class="small-button" type="button" data-action="save">Save edits</button>
            ${post.status === "draft"
              ? '<button class="small-button primary" type="button" data-action="publish">Publish</button>'
              : '<button class="small-button" type="button" data-action="unpublish">Move to drafts</button>'}
            ${post.status === "published" ? `<a class="small-button" href="${postUrl(post)}" target="_blank" rel="noopener">View article ↗</a>` : `<a class="small-button" href="article.html?id=${encodeURIComponent(post.id)}" target="_blank" rel="noopener">Preview ↗</a>`}
            <button class="small-button danger-button" type="button" data-action="delete">Delete</button>
          </div>
        </div>
      </article>`;
  }).join("");
  document.querySelectorAll("[data-field='category']").forEach((select) => {
    const selected = select.dataset.value;
    select.innerHTML = categories.map(({ name }) =>
      `<option value="${escapeText(name)}">${escapeText(name)}</option>`
    ).join("");
    if (categories.some((category) => category.name === selected)) select.value = selected;
  });
}

async function loadDashboard({ refreshPosts = true } = {}) {
  if (refreshPosts) {
    const params = new URLSearchParams({
      select: postFields,
      order: "created_at.desc"
    });
    posts = await request(`/rest/v1/posts?${params}`);
  }
  await loadAnalytics();
  renderPosts();
}

function safeAlert(error) {
  studioStatus.textContent = error instanceof Error ? error.message : "An unexpected editor error occurred.";
}

async function signIn(email, password, captchaToken) {
  const response = await fetch(`${appConfig.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: appConfig.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      gotrue_meta_security: { captcha_token: captchaToken }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.message || "Sign-in failed.");
  sessionStorage.setItem(sessionKey, JSON.stringify(data));
  return data;
}

async function startDashboard(session) {
  document.querySelector("#editor-email").textContent = session.user?.email || "Editor";
  setStudioVisible(true);
  studioStatus.textContent = "Loading your articles and analytics…";
  try {
    await loadCategories();
    await loadDashboard();
    studioStatus.textContent = "";
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => loadDashboard({ refreshPosts: false }).catch(safeAlert), 10000);
  } catch (error) {
    safeAlert(error);
  }
}

function addExtraPhoto() {
  const number = document.querySelectorAll(".extra-photo").length + 1;
  if (number > 9) {
    studioStatus.textContent = "An article can have up to nine additional photos.";
    return;
  }
  const fieldset = document.createElement("fieldset");
  fieldset.className = "studio-photo-group extra-photo";
  fieldset.innerHTML = `
    <legend>Article photo ${number}</legend>
    <label class="form-label">Photo link<input class="text-input" data-photo-url data-photo-number="${number}" type="url" placeholder="https://media.fastdl.app/get?..." required></label>
    <p class="photo-status" data-photo-status role="status"></p>
    <label class="form-label">Image description<input class="text-input" data-photo-alt minlength="5" maxlength="250" placeholder="Describe visible details." required></label>
    <label class="form-label">Place after paragraph<input class="text-input" data-photo-paragraph type="number" min="1" value="1" required></label>
    <label class="photo-rights"><input type="checkbox" data-photo-rights required> I own this photo or have permission to publish it.</label>
    <button class="small-button danger-button" type="button" data-remove-photo>Remove photo</button>`;
  document.querySelector("#extra-photos").append(fieldset);
}

function isHostedPhotoUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://traditionalweddingdress.com"
      && /^\/images\/posts\/[0-9a-f-]{36}\/[a-z0-9-]+-(?:featured|[0-9]{2})\.(?:jpg|png|webp)$/.test(url.pathname)
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function uploadPhotoIfReady(container) {
  const urlInput = container.querySelector("[data-photo-url]");
  const altInput = container.querySelector("[data-photo-alt]");
  const rightsInput = container.querySelector("[data-photo-rights]");
  const status = container.querySelector("[data-photo-status]");
  if (!urlInput || !altInput || !rightsInput || !status || !urlInput.value.trim()) return Promise.resolve();
  if (isHostedPhotoUrl(urlInput.value.trim())) return Promise.resolve();
  if (photoUploads.has(container)) return photoUploads.get(container);
  if (!getSession()?.access_token || document.querySelector("#article-title").value.trim().length < 5
    || altInput.value.trim().length < 5 || !rightsInput.checked) {
    status.textContent = "Enter the article title and image description, and confirm photo rights to save the photo.";
    return Promise.resolve();
  }
  const sourceUrl = urlInput.value.trim();
  const upload = (async () => {
    status.textContent = "Saving a permanent copy to GitHub…";
    try {
      const result = await request("/functions/v1/create-draft", {
        method: "POST",
        body: JSON.stringify({
          action: "upload-photo",
          title: document.querySelector("#article-title").value.trim(),
          photoNumber: Number(urlInput.dataset.photoNumber),
          photo: { url: sourceUrl, alt: altInput.value.trim(), rightsConfirmed: rightsInput.checked }
        })
      });
      if (urlInput.value.trim() !== sourceUrl) {
        status.textContent = "The previous link was saved. Blur the changed link to save it too.";
        return;
      }
      urlInput.value = result.photo.url;
      status.textContent = "Saved to GitHub. This permanent website URL will be used.";
      status.classList.add("success");
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
    } finally {
      photoUploads.delete(container);
    }
  })();
  photoUploads.set(container, upload);
  return upload;
}

if (!configured()) {
  loginStatus.textContent = "The Supabase project connection is not configured.";
  loginForm.querySelector("button").disabled = true;
} else {
  const existingSession = getSession();
  if (existingSession?.access_token) startDashboard(existingSession);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Signing in…";
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    const form = new FormData(loginForm);
    const captchaToken = form.get("cf-turnstile-response");
    if (typeof captchaToken !== "string" || !captchaToken) throw new Error("Complete the security check before signing in.");
    const session = await signIn(form.get("email"), form.get("password"), captchaToken);
    loginStatus.textContent = "";
    loginForm.reset();
    await startDashboard(session);
  } catch (error) {
    loginStatus.textContent = error.message;
    if (window.turnstile) window.turnstile.reset();
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", () => {
  if (pollTimer) clearInterval(pollTimer);
  sessionStorage.removeItem(sessionKey);
  setStudioVisible(false);
  loginForm.reset();
});

document.querySelector("#category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#new-category").value.trim();
  try {
    await request("/rest/v1/categories", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ name })
    });
    document.querySelector("#new-category").value = "";
    await loadCategories();
    renderPosts();
    studioStatus.textContent = `Category “${name}” created.`;
  } catch (error) {
    safeAlert(error);
  }
});

document.querySelector("#add-extra-photo").addEventListener("click", addExtraPhoto);
document.querySelector("#extra-photos").addEventListener("click", (event) => {
  if (event.target.closest("[data-remove-photo]")) event.target.closest(".extra-photo").remove();
});

document.querySelector("#article-form").addEventListener("focusout", (event) => {
  const container = event.target.closest(".studio-photo-group");
  if (container && event.target.matches("[data-photo-url], [data-photo-alt], [data-photo-rights]")) uploadPhotoIfReady(container);
});
document.querySelector("#article-form").addEventListener("change", (event) => {
  if (event.target.matches("[data-photo-rights]")) uploadPhotoIfReady(event.target.closest(".studio-photo-group"));
});
document.querySelector("#article-title").addEventListener("change", () => {
  document.querySelectorAll("#article-form .studio-photo-group").forEach(uploadPhotoIfReady);
});
document.querySelector("#article-form").addEventListener("input", (event) => {
  if (event.target.matches("[data-photo-url]")) {
    const status = event.target.closest(".studio-photo-group").querySelector("[data-photo-status]");
    status.textContent = "";
    status.classList.remove("success", "error");
  }
});

document.querySelector("#article-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const buttons = [...form.querySelectorAll('button[type="submit"]')];
  buttons.forEach((button) => { button.disabled = true; });
  const status = event.submitter?.value === "published" ? "published" : "draft";
  studioStatus.textContent = status === "published" ? "Saving photos and publishing…" : "Saving your draft and photos…";
  try {
    const title = document.querySelector("#article-title").value.trim();
    const excerpt = document.querySelector("#article-excerpt").value.trim();
    const body = document.querySelector("#article-body").value.trim();
    const photoContainers = [...form.querySelectorAll(".studio-photo-group")];
    await Promise.all(photoContainers.map(uploadPhotoIfReady));
    const unresolved = photoContainers.find((container) => !isHostedPhotoUrl(container.querySelector("[data-photo-url]")?.value.trim() || ""));
    if (unresolved) throw new Error(unresolved.querySelector("[data-photo-status]")?.textContent || "Wait for all photos to save to GitHub before continuing.");
    const photoInputs = photoContainers.map((container) => ({
      url: container.querySelector("[data-photo-url]").value.trim(),
      alt: container.querySelector("[data-photo-alt]").value.trim(),
      afterParagraph: Number(container.querySelector("[data-photo-paragraph]")?.value),
      rightsConfirmed: container.querySelector("[data-photo-rights]").checked
    }));
    if (photoInputs.length > 10) throw new Error("An article can have up to ten photos in total.");
    const paragraphCount = body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length;
    if (photoInputs.slice(1).some((photo) => !Number.isInteger(photo.afterParagraph) || photo.afterParagraph < 1 || photo.afterParagraph > paragraphCount)) {
      throw new Error(`Choose a paragraph from 1 to ${paragraphCount} for each additional photo.`);
    }
    const result = await request("/functions/v1/create-draft", {
      method: "POST",
      body: JSON.stringify({
        title,
        excerpt,
        body,
        category: document.querySelector("#article-category").value,
        moreInfoUrl: document.querySelector("#article-source").value.trim(),
        featuredPhoto: photoInputs[0],
        photos: photoInputs.slice(1),
        status
      })
    });
    form.reset();
    document.querySelector("#extra-photos").replaceChildren();
    await loadDashboard();
    studioStatus.textContent = result.post.status === "published" ? "Article published. The website rebuild has started." : "Draft saved.";
  } catch (error) {
    safeAlert(error);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
});

document.querySelector(".post-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((filter) => filter.classList.toggle("active", filter === button));
  renderPosts();
});
document.querySelector("#refresh-posts").addEventListener("click", () => loadDashboard().catch(safeAlert));

postList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-post-id]");
  const post = posts.find((item) => item.id === card.dataset.postId);
  if (!post) return;
  const action = button.dataset.action;
  if (action === "delete" && !window.confirm(`Permanently delete “${post.title}”? This cannot be undone.`)) return;
  button.disabled = true;
  try {
    if (action === "delete") {
      studioStatus.textContent = "Deleting article…";
      await request(`/rest/v1/posts?id=eq.${encodeURIComponent(post.id)}`, { method: "DELETE" });
      await request("/functions/v1/create-draft", { method: "POST", body: JSON.stringify({ action: "rebuild-site" }) });
      studioStatus.textContent = "Article deleted.";
    } else {
      const update = {
        title: card.querySelector("[data-field='title']").value.trim(),
        category: card.querySelector("[data-field='category']").value,
        excerpt: card.querySelector("[data-field='excerpt']").value.trim(),
        body: card.querySelector("[data-field='body']").value.trim(),
        featured_image_url: card.querySelector("[data-field='featured_image_url']").value.trim(),
        image_alt: card.querySelector("[data-field='image_alt']").value.trim(),
        source_url: card.querySelector("[data-field='source_url']").value.trim() || null
      };
      if (action === "publish") {
        update.status = "published";
        update.published_at = new Date().toISOString();
      } else if (action === "unpublish") {
        update.status = "draft";
        update.published_at = null;
      }
      studioStatus.textContent = action === "publish" ? "Saving edits and publishing…" : action === "unpublish" ? "Moving article to drafts…" : "Saving article edits…";
      await request(`/rest/v1/posts?id=eq.${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(update)
      });
      if (post.status === "published" || action === "publish" || action === "unpublish") {
        await request("/functions/v1/create-draft", { method: "POST", body: JSON.stringify({ action: "rebuild-site" }) });
      }
      studioStatus.textContent = action === "publish" ? "Article published." : action === "unpublish" ? "Article moved to drafts." : "Edits saved.";
    }
    await loadDashboard();
  } catch (error) {
    safeAlert(error);
    button.disabled = false;
  }
});
