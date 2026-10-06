const appConfig = window.APP_CONFIG;
const loginPanel = document.querySelector("#login-panel");
const draftsPanel = document.querySelector("#drafts-panel");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const draftStatus = document.querySelector("#draft-status");
const draftList = document.querySelector("#draft-list");
const sessionKey = "threadTraditionEditorSession";

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function configured() {
  return appConfig?.supabaseUrl && appConfig?.supabaseAnonKey && !appConfig.supabaseUrl.includes("YOUR_PROJECT");
}

function setEditorVisible(isVisible) {
  loginPanel.hidden = isVisible;
  draftsPanel.hidden = !isVisible;
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
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
    setEditorVisible(false);
    throw new Error("Your session expired. Please sign in again.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.details || `Request failed (${response.status}).`);
  return data;
}

async function loadDrafts() {
  draftStatus.textContent = "Loading drafts…";
  draftList.replaceChildren();
  const params = new URLSearchParams({
    select: "id,title,excerpt,body,featured_image_url,created_at",
    status: "eq.draft",
    order: "created_at.desc"
  });
  const drafts = await request(`/rest/v1/posts?${params}`);
  draftStatus.textContent = drafts.length ? "" : "No drafts yet. Use the Chrome extension to create your first one.";
  draftList.innerHTML = drafts.map((draft) => `
    <article class="draft-item">
      ${draft.featured_image_url ? `<img src="${escapeText(draft.featured_image_url)}" alt="">` : '<div class="story-image story-placeholder">✳</div>'}
      <div>
        <label class="form-label">Title
          <input class="text-input" data-field="title" value="${escapeText(draft.title)}" minlength="5" maxlength="160" required>
        </label>
        <label class="form-label">Excerpt
          <textarea class="text-input draft-textarea" data-field="excerpt" minlength="20" maxlength="500" required>${escapeText(draft.excerpt)}</textarea>
        </label>
        <label class="form-label">Article
          <textarea class="text-input draft-textarea draft-body" data-field="body" minlength="100" maxlength="12000" required>${escapeText(draft.body)}</textarea>
        </label>
        <div class="draft-actions">
          <button class="small-button" type="button" data-action="save" data-id="${escapeText(draft.id)}">Save edits</button>
          <button class="small-button primary" type="button" data-action="publish" data-id="${escapeText(draft.id)}">Publish</button>
          <button class="small-button" type="button" data-action="delete" data-id="${escapeText(draft.id)}">Delete</button>
          <a class="small-button" href="article.html?id=${encodeURIComponent(draft.id)}">Preview</a>
        </div>
      </div>
    </article>`).join("");
}

if (!configured()) {
  loginStatus.textContent = "Add your Supabase project URL and anon key to config.js first.";
  loginForm.querySelector("button").disabled = true;
} else {
  const session = getSession();
  if (session?.access_token) {
    setEditorVisible(true);
    loadDrafts().catch((error) => { draftStatus.textContent = error.message; });
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Signing in…";
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    const form = new FormData(loginForm);
    const captchaToken = form.get("cf-turnstile-response");
    if (typeof captchaToken !== "string" || !captchaToken) {
      throw new Error("Complete the security check before signing in.");
    }
    await signIn(form.get("email"), form.get("password"), captchaToken);
    setEditorVisible(true);
    loginStatus.textContent = "";
    await loadDrafts();
  } catch (error) {
    loginStatus.textContent = error.message;
    if (window.turnstile) window.turnstile.reset();
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", () => {
  sessionStorage.removeItem(sessionKey);
  setEditorVisible(false);
  loginForm.reset();
});

draftList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  button.disabled = true;
  draftStatus.textContent = action === "publish" ? "Saving edits and publishing…" : action === "save" ? "Saving edits…" : "Deleting draft…";
  try {
    if (action === "save" || action === "publish") {
      const card = button.closest(".draft-item");
      const update = {
        title: card.querySelector('[data-field="title"]').value.trim(),
        excerpt: card.querySelector('[data-field="excerpt"]').value.trim(),
        body: card.querySelector('[data-field="body"]').value.trim()
      };
      if (action === "publish") {
        update.status = "published";
        update.published_at = new Date().toISOString();
      }
      await request(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(update)
      });
    } else if (action === "delete" && window.confirm("Delete this draft permanently?")) {
      await request(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    await loadDrafts();
  } catch (error) {
    draftStatus.textContent = error.message;
    button.disabled = false;
  }
});
