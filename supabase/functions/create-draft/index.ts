const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const imageHosts = (hostname: string) =>
  hostname === "media.fastdl.app"
  || isCdnImageHost(hostname);

function isCdnImageHost(hostname: string) {
  return hostname === "cdninstagram.com"
  || hostname.endsWith(".cdninstagram.com")
  || hostname === "fbcdn.net"
  || hostname.endsWith(".fbcdn.net");
}
const maxImageBytes = 8 * 1024 * 1024;
const maxPhotos = 10;

type SubmittedPhoto = {
  url: string;
  alt: string;
  afterParagraph?: number;
  rightsConfirmed: boolean;
};

type SavedPhoto = {
  url: string;
  alt: string;
  afterParagraph?: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

function validatePhotoUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4000) {
    throw new Error("Enter a valid direct photo link.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid direct photo link.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || !imageHosts(url.hostname)
    || (url.hostname === "media.fastdl.app" && url.pathname !== "/get")
  ) {
    throw new Error("Use an HTTPS FastDL photo link or a direct Instagram/Facebook CDN image link.");
  }
  if (url.hostname === "media.fastdl.app") {
    const target = url.searchParams.get("uri");
    if (!target || !isCdnImageHost(new URL(target).hostname)) {
      throw new Error("The FastDL link must point to an Instagram or Facebook CDN photo.");
    }
  }
  return url;
}

function isMoreInfoUrl(value: unknown): value is string | undefined {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function authenticate(request: Request, supabaseUrl: string, anonKey: string, editorId: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Sign in to the extension before creating a draft.");
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization }
  });
  if (!response.ok) throw new Error("Your sign-in has expired. Sign in again and retry.");
  const user = await response.json();
  if (typeof user.id !== "string" || user.id !== editorId) {
    throw new Error("This account is not authorized to publish website articles.");
  }
  return user.id;
}

async function fetchPhoto(url: URL): Promise<{ bytes: Uint8Array; extension: string }> {
  const signal = AbortSignal.timeout(30000);
  let currentUrl = url;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    response = await fetch(currentUrl, { redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirects === 5) throw new Error("The photo link redirected too many times.");
    currentUrl = validatePhotoUrl(new URL(location, currentUrl).href);
  }
  if (!response || !response.ok) throw new Error(`The photo could not be downloaded (HTTP ${response?.status ?? "unknown"}).`);

  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  if (!mimeType || (!extensions[mimeType] && mimeType !== "application/octet-stream")) {
    throw new Error("Photo links must return a JPG, PNG, or WebP image.");
  }
  const statedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(statedLength) && statedLength > maxImageBytes) {
    throw new Error("Each photo must be smaller than 8 MB.");
  }
  if (!response.body) throw new Error("The photo response was empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxImageBytes) {
      await reader.cancel();
      throw new Error("Each photo must be smaller than 8 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const detectedType = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? "image/jpeg"
    : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      ? "image/png"
      : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
        ? "image/webp"
        : null;
  if (!detectedType || (extensions[mimeType] && extensions[mimeType] !== extensions[detectedType])) {
    throw new Error("The downloaded photo content does not match its image format.");
  }
  return { bytes, extension: extensions[detectedType] };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function filenameSlug(title: string): string {
  return title.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "wedding-dress";
}

function hostedPhotoPath(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.origin !== "https://traditionalweddingdress.com"
    || url.search
    || url.hash
    || !/^\/images\/posts\/[0-9a-f-]{36}\/[a-z0-9-]+-(?:featured|[0-9]{2})\.(?:jpg|png|webp)$/.test(url.pathname)
  ) {
    return null;
  }
  return url.pathname.slice(1);
}

async function uploadPhotoToGitHub(
  photo: SubmittedPhoto,
  title: string,
  postId: string,
  index: number,
  isFeatured: boolean,
  token: string
): Promise<SavedPhoto> {
  const existingPath = hostedPhotoPath(photo.url);
  if (existingPath) {
    const encodedPath = existingPath.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`https://api.github.com/repos/masasecomm/TradWeddingDress/contents/${encodedPath}?ref=main`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!response.ok) {
      throw new Error(`The saved photo could not be verified in the website repository (GitHub HTTP ${response.status}).`);
    }
    const file = await response.json();
    if (file.type !== "file" || file.path !== existingPath) {
      throw new Error("The photo link is not a saved image in the website repository.");
    }
    return { url: `https://traditionalweddingdress.com/${existingPath}`, alt: photo.alt.trim(), afterParagraph: photo.afterParagraph };
  }
  const source = validatePhotoUrl(photo.url);
  const { bytes, extension } = await fetchPhoto(source);
  const suffix = isFeatured ? "featured" : String(index).padStart(2, "0");
  const filename = `${filenameSlug(title)}-${suffix}.${extension}`;
  const repositoryPath = `images/posts/${postId}/${filename}`;
  const encodedPath = repositoryPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/masasecomm/TradWeddingDress/contents/${encodedPath}`, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      message: `Add article photo: ${filename}`,
      content: base64(bytes),
      branch: "main"
    })
  });
  if (!response.ok) {
    console.error("GitHub photo upload failed", response.status, await response.text());
    throw new Error(`Could not save photo ${index + 1} into the website repository (GitHub HTTP ${response.status}).`);
  }
  return {
    url: `https://traditionalweddingdress.com/${repositoryPath}`,
    alt: photo.alt.trim(),
    afterParagraph: photo.afterParagraph
  };
}

function makeExcerpt(body: string): string {
  const plainText = body.replace(/\s+/g, " ").trim();
  return plainText.length > 500 ? `${plainText.slice(0, 497).trimEnd()}...` : plainText;
}

async function triggerSiteBuild(token: string): Promise<string | null> {
  const response = await fetch("https://api.github.com/repos/masasecomm/TradWeddingDress/actions/workflows/seo-pages.yml/dispatches", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ ref: "main" })
  });
  if (!response.ok) {
    console.error("GitHub Pages rebuild dispatch failed", response.status, await response.text());
    return `The article is published, but GitHub could not start the website rebuild (HTTP ${response.status}).`;
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST to create a draft." }, 405);
  try {
    const projectUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const editorId = requireEnv("EDITOR_USER_ID");
    const ownerId = await authenticate(request, projectUrl, anonKey, editorId);
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "Enter your article title and text." }, 400);
    }
    if (payload.action === "rebuild-site") {
      const githubToken = requireEnv("GITHUB_TOKEN");
      const siteBuildError = await triggerSiteBuild(githubToken);
      if (siteBuildError) return json({ error: siteBuildError }, 502);
      return json({ siteBuildTriggered: true });
    }
    if (payload.action === "upload-photo") {
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const photo = payload.photo as SubmittedPhoto | undefined;
      if (title.length < 5 || title.length > 160) {
        return json({ error: "Enter an article title between 5 and 160 characters before saving a photo." }, 400);
      }
      if (!photo || typeof photo !== "object" || typeof photo.url !== "string") {
        return json({ error: "Enter a valid direct photo link." }, 400);
      }
      validatePhotoUrl(photo.url);
      if (typeof photo.alt !== "string" || photo.alt.trim().length < 5 || photo.alt.trim().length > 250) {
        return json({ error: "Add an image description between 5 and 250 characters before saving the photo." }, 400);
      }
      if (photo.rightsConfirmed !== true) {
        return json({ error: "Confirm you own this photo or have permission to republish it." }, 400);
      }
      const photoNumber = payload.photoNumber;
      if (!Number.isInteger(photoNumber) || photoNumber < 0 || photoNumber > maxPhotos - 1) {
        return json({ error: "Choose a valid photo position before saving the photo." }, 400);
      }
      const token = requireEnv("GITHUB_TOKEN");
      const savedPhoto = await uploadPhotoToGitHub(photo, title, crypto.randomUUID(), photoNumber, photoNumber === 0, token);
      return json({ photo: savedPhoto });
    }
    if (typeof payload.title !== "string" || typeof payload.body !== "string") {
      return json({ error: "Enter your article title and text." }, 400);
    }
    if (!isMoreInfoUrl(payload.moreInfoUrl)) {
      return json({ error: "The more information link must be a valid HTTPS URL." }, 400);
    }
    const status = payload.status === undefined ? "draft" : payload.status;
    if (status !== "draft" && status !== "published") {
      return json({ error: "Choose whether to save the article as a draft or publish it." }, 400);
    }
    const title = payload.title.trim();
    const body = payload.body.trim();
    const excerpt = typeof payload.excerpt === "string" && payload.excerpt.trim()
      ? payload.excerpt.trim()
      : makeExcerpt(body);
    if (title.length < 5 || title.length > 160) {
      return json({ error: "The title must be between 5 and 160 characters." }, 400);
    }
    if (body.length < 100 || body.length > 12000) {
      return json({ error: "The article must be between 100 and 12,000 characters." }, 400);
    }
    if (excerpt.length < 20 || excerpt.length > 500) {
      return json({ error: "The search description must be between 20 and 500 characters." }, 400);
    }
    if (typeof payload.excerpt === "string" && payload.excerpt.trim().length > 160) {
      return json({ error: "Keep the search description to 160 characters or fewer." }, 400);
    }
    const category = typeof payload.category === "string" && payload.category.trim()
      ? payload.category.trim()
      : "Bridal style";
    if (category.length < 2 || category.length > 80) {
      return json({ error: "Choose a category between 2 and 80 characters." }, 400);
    }
    const categoryResponse = await fetch(
      `${projectUrl}/rest/v1/categories?${new URLSearchParams({ select: "name", name: `eq.${category}`, limit: "1" })}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!categoryResponse.ok) throw new Error("The category list could not be checked.");
    const matchingCategories = await categoryResponse.json();
    if (!Array.isArray(matchingCategories) || matchingCategories.length !== 1) {
      return json({ error: "Create or select an available category before saving this article." }, 400);
    }

    const paragraphs = body.split(/\n\s*\n/).filter((paragraph: string) => paragraph.trim());
    if (!payload.featuredPhoto || typeof payload.featuredPhoto !== "object" || Array.isArray(payload.featuredPhoto)) {
      return json({ error: "Add a featured image with a direct photo link." }, 400);
    }
    if (!Array.isArray(payload.photos) || payload.photos.length + 1 > maxPhotos) {
      return json({ error: `Add no more than ${maxPhotos - 1} additional article photos.` }, 400);
    }
    const photos = [payload.featuredPhoto, ...payload.photos] as SubmittedPhoto[];
    for (const [index, photo] of photos.entries()) {
      if (!photo || typeof photo !== "object" || typeof photo.url !== "string") {
        return json({ error: `Enter a valid photo link for photo ${index + 1}.` }, 400);
      }
      validatePhotoUrl(photo.url);
      if (typeof photo.alt !== "string" || photo.alt.trim().length < 5 || photo.alt.trim().length > 250) {
        return json({ error: `Photo ${index + 1} needs a 5–250 character image description.` }, 400);
      }
      if (index > 0) {
        const afterParagraph = photo.afterParagraph;
        if (typeof afterParagraph !== "number" || !Number.isInteger(afterParagraph) || afterParagraph < 1 || afterParagraph > paragraphs.length) {
          return json({ error: `Choose a valid paragraph number for photo ${index + 1}.` }, 400);
        }
      }
      if (photo.rightsConfirmed !== true) {
        return json({ error: `Confirm you own photo ${index + 1} or have permission to republish it.` }, 400);
      }
    }

    const githubToken = requireEnv("GITHUB_TOKEN");
    const postId = crypto.randomUUID();
    const savedPhotos: SavedPhoto[] = [];
    for (const [index, photo] of photos.entries()) {
      savedPhotos.push(await uploadPhotoToGitHub(photo, title, postId, index, index === 0, githubToken));
    }
    const insertResponse = await fetch(`${projectUrl}/rest/v1/posts`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        id: postId,
        owner_id: ownerId,
        title,
        excerpt,
        body,
        category,
        image_alt: savedPhotos[0].alt,
        featured_image_url: savedPhotos[0].url,
        body_images: savedPhotos.slice(1),
        source_url: payload.moreInfoUrl || null,
        trend_queries: [],
        status,
        published_at: status === "published" ? new Date().toISOString() : null
      })
    });
    if (!insertResponse.ok) {
      console.error("Post insert failed", await insertResponse.text());
      throw new Error("Your article could not be saved. Check the posts table setup.");
    }
    const [post] = await insertResponse.json();
    let siteBuildError: string | null = null;
    try {
      siteBuildError = await triggerSiteBuild(githubToken);
    } catch (error) {
      console.error("Could not start the website rebuild", error);
      siteBuildError = "The article was saved, but the website rebuild could not be started.";
    }
    return json({ post, siteBuildTriggered: siteBuildError === null, siteBuildError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected article-creation error.";
    console.error("create-draft failed:", message);
    return json({ error: message }, 400);
  }
});
