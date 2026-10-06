const byId = (id) => document.getElementById(id);
const settingsFormUrl = byId("project-url");
const settingsFormKey = byId("anon-key");
const statusLine = byId("status");
const captchaFrame = byId("captcha-frame");
const captchaFrameOrigin = "https://traditionalweddingdress.com";
const defaultSettings = {
  url: "https://birfyvrtkmzgghaspodx.supabase.co",
  anonKey: "sb_publishable_NWEihHYNsnlJJxvIcj9VDw_8YAB-yE_"
};
let settings = null;
let session = null;
let captchaToken = "";

const chromeStorageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const chromeStorageSet = (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve));

function resetCaptcha() {
  captchaToken = "";
  captchaFrame.contentWindow?.postMessage({ type: "reset-turnstile" }, captchaFrameOrigin);
}

window.addEventListener("message", (event) => {
  if (
    event.origin !== captchaFrameOrigin
    || event.source !== captchaFrame.contentWindow
    || event.data?.type !== "turnstile-token"
    || typeof event.data.token !== "string"
  ) {
    return;
  }
  captchaToken = event.data.token;
});

async function refreshSession() {
  if (!session?.refresh_token) {
    session = null;
    await chromeStorageSet({ session: null });
    throw new Error("Your sign-in expired. Please sign in again.");
  }
  const response = await fetch(`${settings.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: settings.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  const refreshed = await response.json();
  if (!response.ok) {
    session = null;
    await chromeStorageSet({ session: null });
    throw new Error("Your sign-in expired. Please sign in again.");
  }
  session = refreshed;
  await chromeStorageSet({ session });
}

async function ensureFreshSession() {
  if (session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    await refreshSession();
  }
}

function validProjectUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") && url.pathname === "/";
  } catch {
    return false;
  }
}

function publishedPostUrl(post) {
  const slug = String(post.title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "wedding-dress";
  return `https://traditionalweddingdress.com/posts/${slug}-${encodeURIComponent(post.id)}/`;
}

async function api(path, options = {}, retry = true) {
  if (!settings?.url || !settings?.anonKey) throw new Error("Save your Supabase connection first.");
  await ensureFreshSession();
  const headers = {
    apikey: settings.anonKey,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options.headers
  };
  const response = await fetch(`${settings.url}${path}`, { ...options, headers });
  if (response.status === 401 && retry && session?.refresh_token) {
    await refreshSession();
    return api(path, options, false);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Request failed (${response.status}).`);
  return data;
}

function displaySignedIn() {
  byId("signed-out").hidden = Boolean(session?.access_token);
  byId("signed-in").hidden = !session?.access_token;
  if (session?.access_token) byId("account-email").textContent = session.user?.email || "your account";
}

async function loadSettings() {
  const saved = await chromeStorageGet(["settings", "session"]);
  settings = saved.settings || defaultSettings;
  session = saved.session || null;
  if (!saved.settings) await chromeStorageSet({ settings });
  if (settings) {
    settingsFormUrl.value = settings.url;
    settingsFormKey.value = settings.anonKey;
  }
  if (!validProjectUrl(settings?.url || "")) {
    settings = null;
    session = null;
    await chromeStorageSet({ session: null });
    byId("connection-settings").open = true;
    statusLine.textContent = "Add and save your Supabase project URL and anon key before signing in.";
  }
  displaySignedIn();
}

byId("save-settings").addEventListener("click", async () => {
  const url = settingsFormUrl.value.trim().replace(/\/+$/, "");
  const anonKey = settingsFormKey.value.trim();
  if (!validProjectUrl(`${url}/`) || !anonKey) {
    statusLine.textContent = "Enter a valid https://<project>.supabase.co URL and its anon key.";
    return;
  }
  settings = { url, anonKey };
  session = null;
  await chromeStorageSet({ settings, session: null });
  displaySignedIn();
  statusLine.textContent = "Connection saved.";
});

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  statusLine.textContent = "Signing in…";
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    if (!settings) throw new Error("Save your Supabase connection first.");
    if (!captchaToken) throw new Error("Complete the Cloudflare security check before signing in.");
    const response = await fetch(`${settings.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: settings.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: byId("email").value.trim(),
        password: byId("password").value,
        gotrue_meta_security: { captcha_token: captchaToken }
      })
    });
    resetCaptcha();
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || "Sign-in failed.");
    session = data;
    await chromeStorageSet({ session });
    event.currentTarget.reset();
    statusLine.textContent = "";
    displaySignedIn();
  } catch (error) {
    resetCaptcha();
    statusLine.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

byId("sign-out").addEventListener("click", async () => {
  session = null;
  await chromeStorageSet({ session: null });
  statusLine.textContent = "Signed out.";
  displaySignedIn();
});

async function uploadFeaturedImage(file) {
  await ensureFreshSession();
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("The image must be smaller than 8 MB.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const request = () => fetch(`${settings.url}/storage/v1/object/wedding-dress-images/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: settings.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false"
    },
    body: file
  });
  let response = await request();
  if (response.status === 401 && session?.refresh_token) {
    await refreshSession();
    response = await request();
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Image upload failed. Check the Supabase image-storage setup.");
  }
  return `${settings.url}/storage/v1/object/public/wedding-dress-images/${objectPath}`;
}

byId("draft-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const buttons = [...form.querySelectorAll('button[type="submit"]')];
  const publishStatus = event.submitter?.value === "published" ? "published" : "draft";
  buttons.forEach((button) => { button.disabled = true; });
  statusLine.textContent = publishStatus === "published" ? "Saving and publishing your article…" : "Saving your article as a draft…";
  try {
    if (!session?.access_token) throw new Error("Sign in before creating a draft.");
    const instagramUrl = byId("instagram-url").value.trim();
    const title = byId("post-title").value.trim();
    const excerpt = byId("post-description").value.trim();
    const body = byId("post-body").value.trim();
    const imageAlt = byId("image-alt").value.trim();
    const imageFile = byId("featured-image").files[0];
    if (title.length < 5 || title.length > 160) throw new Error("The title must be between 5 and 160 characters.");
    if (excerpt.length < 50 || excerpt.length > 160) throw new Error("The search description must be between 50 and 160 characters.");
    if (body.length < 100 || body.length > 12000) throw new Error("The article must be between 100 and 12,000 characters.");
    if (imageAlt.length < 5 || imageAlt.length > 250) throw new Error("The featured image description must be between 5 and 250 characters.");
    const featuredImageUrl = imageFile ? await uploadFeaturedImage(imageFile) : undefined;
    const result = await api("/functions/v1/create-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instagramUrl,
        featuredImageUrl,
        title,
        excerpt,
        imageAlt,
        body,
        status: publishStatus,
        imageRightsConfirmed: byId("image-rights").checked
      })
    });
    let published = false;
    let publishMessage = "";
    if (publishStatus === "published") {
      try {
        const updatedPosts = await api(`/rest/v1/posts?id=eq.${encodeURIComponent(result.post.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: "published", published_at: new Date().toISOString() })
        });
        published = Array.isArray(updatedPosts)
          && updatedPosts.length === 1
          && updatedPosts[0].status === "published";
        if (!published) publishMessage = "Your article was saved as a draft, but the website did not confirm publication. Open your website editor to publish it.";
      } catch (error) {
        publishMessage = `Your article was saved as a draft, but could not be published: ${error.message}`;
      }
    }
    byId("success-title").textContent = result.post.title;
    byId("success-status").textContent = published ? "PUBLISHED" : "DRAFT SAVED";
    const publishedLink = byId("published-link");
    publishedLink.hidden = !published;
    if (published) publishedLink.href = publishedPostUrl(result.post);
    byId("success-message").textContent = published
      ? "Your article is now live on your website."
      : publishMessage || "Your article and featured image are saved as a draft. Review it in your website editor before publishing.";
    byId("draft-form").reset();
    byId("signed-in").hidden = true;
    byId("success-panel").hidden = false;
    statusLine.textContent = "";
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
});

byId("new-draft").addEventListener("click", () => {
  byId("success-panel").hidden = true;
  byId("signed-in").hidden = false;
});

loadSettings().catch((error) => { statusLine.textContent = error.message; });
