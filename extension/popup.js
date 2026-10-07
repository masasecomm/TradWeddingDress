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
const photoUploadPromises = new WeakMap();

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
  return `https://traditionalweddingdress.com/article.html?id=${encodeURIComponent(post.id)}`;
}

function isHostedPhotoUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://traditionalweddingdress.com"
      && /^\/images\/posts\/[0-9a-f-]{36}\/[a-z0-9-]+-(?:featured|[0-9]{2})\.(?:jpg|png|webp)$/.test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
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

function addPhotoItem() {
  const item = document.createElement("fieldset");
  item.className = "photo-item";
  item.innerHTML = `
    <legend>Photo</legend>
    <label>Photo link
      <input type="url" data-photo-url placeholder="https://media.fastdl.app/get?..." required>
    </label>
    <p class="photo-upload-status" data-photo-status role="status" aria-live="polite"></p>
    <label>Image description
      <input type="text" data-photo-alt minlength="5" maxlength="250" placeholder="Describe the dress and visible details." required>
    </label>
    <label>Place after paragraph
      <input type="number" data-photo-paragraph min="1" value="1" required>
    </label>
    <label class="rights-check">
      <input type="checkbox" data-photo-rights required>
      <span>I own this photo or have permission to copy and publish it.</span>
    </label>
    <button class="text-button" type="button" data-remove-photo>Remove photo</button>`;
  byId("photo-items").append(item);
  item.querySelector("[data-photo-paragraph]").max = String(Math.max(articleParagraphCount(byId("post-body").value), 1));
}

function articleParagraphCount(body) {
  return body.trim().split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length;
}

function uploadPhotoIfReady(container) {
  const urlInput = container.querySelector("[data-photo-url]");
  const altInput = container.querySelector("[data-photo-alt]");
  const rightsInput = container.querySelector("[data-photo-rights]");
  const status = container.querySelector("[data-photo-status]");
  if (!urlInput || !altInput || !rightsInput || !status || !urlInput.value.trim()) return Promise.resolve();
  if (isHostedPhotoUrl(urlInput.value.trim())) {
    urlInput.dataset.uploadedUrl = urlInput.value.trim();
    return Promise.resolve();
  }
  if (photoUploadPromises.has(container)) return photoUploadPromises.get(container);
  if (urlInput.dataset.uploadedUrl) return Promise.resolve();
  if (!session?.access_token) {
    status.textContent = "Sign in to automatically save this photo to your website.";
    status.dataset.state = "error";
    return Promise.resolve();
  }
  if (byId("post-title").value.trim().length < 5 || altInput.value.trim().length < 5 || !rightsInput.checked) {
    status.textContent = "Add the article title and image description, and confirm photo rights to save this image.";
    status.dataset.state = "";
    return Promise.resolve();
  }

  urlInput.dataset.uploading = "true";
  status.textContent = "Saving a permanent copy to your website...";
  status.dataset.state = "";
  const uploadPromise = (async () => {
    const sourceUrl = urlInput.value.trim();
    const isFeatured = container.classList.contains("photo-list");
    const photoNumber = isFeatured
      ? 0
      : [...byId("photo-items").querySelectorAll(".photo-item")].indexOf(container) + 1;
    try {
      const result = await api("/functions/v1/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload-photo",
          title: byId("post-title").value.trim(),
          photoNumber,
          photo: {
            url: sourceUrl,
            alt: altInput.value.trim(),
            rightsConfirmed: rightsInput.checked
          }
        })
      });
      if (urlInput.value.trim() !== sourceUrl) {
        status.textContent = "The previous photo link was saved. Blur the updated link to save that one too.";
        status.dataset.state = "error";
        return;
      }
      urlInput.value = result.photo.url;
      urlInput.dataset.uploadedUrl = result.photo.url;
      status.textContent = "Saved to your website. This permanent link will be used in the article.";
      status.dataset.state = "success";
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
    } finally {
      delete urlInput.dataset.uploading;
      photoUploadPromises.delete(container);
    }
  })();
  photoUploadPromises.set(container, uploadPromise);
  return uploadPromise;
}

byId("draft-form").addEventListener("input", (event) => {
  const urlInput = event.target.closest("[data-photo-url]");
  if (urlInput && !isHostedPhotoUrl(urlInput.value.trim())) {
    delete urlInput.dataset.uploadedUrl;
    const status = urlInput.closest("fieldset").querySelector("[data-photo-status]");
    status.textContent = "";
    status.dataset.state = "";
  }
});
byId("draft-form").addEventListener("focusout", (event) => {
  const photoContainer = event.target.closest(".photo-list, .photo-item");
  if (photoContainer && event.target.matches("[data-photo-url], [data-photo-alt], [data-photo-rights]")) {
    uploadPhotoIfReady(photoContainer);
  }
});
byId("draft-form").addEventListener("change", (event) => {
  if (event.target.matches("[data-photo-rights]")) {
    uploadPhotoIfReady(event.target.closest(".photo-list, .photo-item"));
  }
});
byId("post-title").addEventListener("change", () => {
  byId("draft-form").querySelectorAll(".photo-list, .photo-item").forEach(uploadPhotoIfReady);
});

byId("add-photo").addEventListener("click", addPhotoItem);
byId("photo-items").addEventListener("click", (event) => {
  if (!event.target.closest("[data-remove-photo]")) return;
  event.target.closest(".photo-item").remove();
});
byId("post-body").addEventListener("input", () => {
  const count = articleParagraphCount(byId("post-body").value);
  byId("photo-items").querySelectorAll("[data-photo-paragraph]").forEach((input) => {
    input.max = String(Math.max(count, 1));
  });
});
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
  const form = event.currentTarget;
  const button = form.querySelector("button");
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
    form.reset();
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

byId("draft-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const buttons = [...form.querySelectorAll('button[type="submit"]')];
  const publishStatus = event.submitter?.value === "published" ? "published" : "draft";
  buttons.forEach((button) => { button.disabled = true; });
  statusLine.textContent = publishStatus === "published" ? "Saving and publishing your article…" : "Saving your article as a draft…";
  try {
    if (!session?.access_token) throw new Error("Sign in before creating a draft.");
    const title = byId("post-title").value.trim();
    const excerpt = byId("post-description").value.trim();
    const body = byId("post-body").value.trim();
    const paragraphCount = articleParagraphCount(body);
    const featuredPhoto = {
      url: byId("featured-photo-url").value.trim(),
      alt: byId("featured-photo-alt").value.trim(),
      rightsConfirmed: byId("featured-photo-rights").checked
    };
    const photos = [...byId("photo-items").querySelectorAll(".photo-item")].map((item) => ({
      url: item.querySelector("[data-photo-url]").value.trim(),
      alt: item.querySelector("[data-photo-alt]").value.trim(),
      afterParagraph: Number(item.querySelector("[data-photo-paragraph]").value),
      rightsConfirmed: item.querySelector("[data-photo-rights]").checked
    }));
    if (title.length < 5 || title.length > 160) throw new Error("The title must be between 5 and 160 characters.");
    if (excerpt.length < 50 || excerpt.length > 160) throw new Error("The search description must be between 50 and 160 characters.");
    if (body.length < 100 || body.length > 12000) throw new Error("The article must be between 100 and 12,000 characters.");
    if (featuredPhoto.alt.length < 5 || featuredPhoto.alt.length > 250) {
      throw new Error("The featured image description must be between 5 and 250 characters.");
    }
    if (!featuredPhoto.rightsConfirmed) throw new Error("Confirm you own the featured photo or have permission to republish it.");
    if (photos.length > 9) throw new Error("Add no more than nine additional article photos.");
    if (photos.some((photo) => !Number.isInteger(photo.afterParagraph) || photo.afterParagraph < 1 || photo.afterParagraph > paragraphCount)) {
      throw new Error(`Choose a paragraph number from 1 to ${paragraphCount} for every photo.`);
    }
    const photoContainers = [byId("featured-photo-url").closest(".photo-list"), ...byId("photo-items").querySelectorAll(".photo-item")];
    await Promise.all(photoContainers.map(uploadPhotoIfReady));
    const pendingPhoto = photoContainers.find((container) => {
      const input = container.querySelector("[data-photo-url]");
      return input?.dataset.uploading === "true" || !isHostedPhotoUrl(input?.value.trim() || "");
    });
    if (pendingPhoto) {
      throw new Error(pendingPhoto.querySelector("[data-photo-status]")?.textContent || "Wait for every photo to finish saving to your website before publishing.");
    }
    featuredPhoto.url = byId("featured-photo-url").value.trim();
    photos.forEach((photo, index) => {
      photo.url = byId("photo-items").querySelectorAll(".photo-item")[index].querySelector("[data-photo-url]").value.trim();
    });
    const result = await api("/functions/v1/create-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moreInfoUrl: byId("more-info-url").value.trim(),
        title,
        excerpt,
        body,
        featuredPhoto,
        photos,
        status: publishStatus
      })
    });
    const published = publishStatus === "published" && result.post.status === "published";
    const publishMessage = publishStatus === "published" && !published
      ? "Your article was saved, but publication was not confirmed. Open your website editor to check its status."
      : "";
    byId("success-title").textContent = result.post.title;
    byId("success-status").textContent = published ? "PUBLISHED" : "DRAFT SAVED";
    const publishedLink = byId("published-link");
    publishedLink.hidden = !published;
    if (published) publishedLink.href = publishedPostUrl(result.post);
    byId("success-message").textContent = published
      ? result.siteBuildTriggered
        ? "Your article is live now. The website and sitemap rebuild has started."
        : `Your article is live now. ${result.siteBuildError || "The search-friendly page and sitemap will update on the next site build."}`
      : publishMessage || "Your article and featured image are saved as a draft. Review it in your website editor before publishing.";
    byId("draft-form").reset();
    byId("photo-items").replaceChildren();
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
