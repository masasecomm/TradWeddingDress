const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

function isInstagramPermalink(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (url.hostname === "instagram.com" || url.hostname === "www.instagram.com" || url.hostname === "m.instagram.com")
      && /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?/.test(url.pathname);
  } catch {
    return false;
  }
}

async function authenticate(request: Request, supabaseUrl: string, anonKey: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Sign in to the extension before creating a draft.");
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization }
  });
  if (!response.ok) throw new Error("Your sign-in has expired. Sign in again and retry.");
  const user = await response.json();
  if (typeof user.id !== "string") throw new Error("Could not verify your account.");
  return user.id as string;
}

function isInstagramImageHost(hostname: string) {
  return hostname === "cdninstagram.com"
    || hostname.endsWith(".cdninstagram.com")
    || hostname === "fbcdn.net"
    || hostname.endsWith(".fbcdn.net");
}

async function getInstagramThumbnail(permalink: string, token: string) {
  const endpoint = new URL("https://graph.facebook.com/v22.0/instagram_oembed");
  endpoint.searchParams.set("url", permalink);
  endpoint.searchParams.set("access_token", token);
  const response = await fetch(endpoint);
  const result = await response.json();
  if (!response.ok) {
    console.error("Instagram oEmbed request failed", result);
    throw new Error("Instagram could not provide a preview for this post. Upload an image file instead.");
  }
  if (typeof result.thumbnail_url !== "string") {
    throw new Error("Instagram did not provide an image preview for this post. Upload an image file instead.");
  }
  const thumbnail = new URL(result.thumbnail_url);
  if (thumbnail.protocol !== "https:" || !isInstagramImageHost(thumbnail.hostname)) {
    throw new Error("Instagram returned an unsupported image address. Upload an image file instead.");
  }
  return thumbnail;
}

async function saveInstagramImage(permalink: string, userId: string, projectUrl: string, serviceKey: string) {
  const token = Deno.env.get("INSTAGRAM_OEMBED_ACCESS_TOKEN");
  if (!token) throw new Error("Choose an image file or configure Instagram oEmbed in Supabase.");
  const thumbnail = await getInstagramThumbnail(permalink, token);
  const response = await fetch(thumbnail);
  if (!response.ok) throw new Error("The Instagram preview image could not be downloaded. Upload an image file instead.");
  const mimeType = response.headers.get("content-type")?.split(";")[0].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType ?? "")) {
    throw new Error("Instagram returned an unsupported image format. Upload a JPG, PNG, or WebP image instead.");
  }
  const image = await response.arrayBuffer();
  if (image.byteLength > 8 * 1024 * 1024) throw new Error("The Instagram preview image exceeds the 8 MB limit.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
  const upload = await fetch(`${projectUrl}/storage/v1/object/wedding-dress-images/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": mimeType!,
      "x-upsert": "false"
    },
    body: image
  });
  if (!upload.ok) {
    console.error("Featured image storage upload failed", await upload.text());
    throw new Error("The featured image could not be saved to Supabase Storage.");
  }
  return `${projectUrl}/storage/v1/object/public/wedding-dress-images/${objectPath}`;
}

function verifyUploadedImage(value: unknown, userId: string, projectUrl: string) {
  if (typeof value !== "string") throw new Error("Choose an image file or configure Instagram oEmbed.");
  const imageUrl = new URL(value);
  const projectOrigin = new URL(projectUrl).origin;
  const expectedPrefix = `/storage/v1/object/public/wedding-dress-images/${userId}/`;
  if (imageUrl.origin !== projectOrigin || !imageUrl.pathname.startsWith(expectedPrefix)) {
    throw new Error("The image must be uploaded to your own wedding-dress image folder.");
  }
  return imageUrl.toString();
}

function makeExcerpt(body: string): string {
  const plainText = body.replace(/\s+/g, " ").trim();
  return plainText.length > 500 ? `${plainText.slice(0, 497).trimEnd()}...` : plainText;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST to create a draft." }, 405);
  try {
    const projectUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ownerId = await authenticate(request, projectUrl, anonKey);
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "Enter your article title and text." }, 400);
    }
    if (!isInstagramPermalink(payload.instagramUrl)) {
      return json({ error: "Enter a valid Instagram post or reel link." }, 400);
    }
    if (payload.imageRightsConfirmed !== true) {
      return json({ error: "Confirm that you own or have permission to reuse this image." }, 400);
    }
    if (typeof payload.title !== "string" || typeof payload.body !== "string") {
      return json({ error: "Enter your article title and text." }, 400);
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
    const imageAlt = typeof payload.imageAlt === "string" && payload.imageAlt.trim()
      ? payload.imageAlt.trim()
      : title;
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
    if (imageAlt.length < 5 || imageAlt.length > 250) {
      return json({ error: "The featured image description must be between 5 and 250 characters." }, 400);
    }
    const imageUrl = payload.featuredImageUrl
      ? verifyUploadedImage(payload.featuredImageUrl, ownerId, projectUrl)
      : await saveInstagramImage(payload.instagramUrl, ownerId, projectUrl, serviceKey);
    const insertResponse = await fetch(`${projectUrl}/rest/v1/posts`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        owner_id: ownerId,
        title,
        excerpt,
        body,
        category: "Bridal style",
        image_alt: imageAlt,
        featured_image_url: imageUrl,
        source_url: payload.instagramUrl,
        image_rights_confirmed: true,
        trend_queries: [],
        status,
        published_at: status === "published" ? new Date().toISOString() : null
      })
    });
    if (!insertResponse.ok) {
      console.error("Draft insert failed", await insertResponse.text());
      throw new Error("Your article could not be saved. Check the posts table setup.");
    }
    const [post] = await insertResponse.json();
    return json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected draft-generation error.";
    console.error("create-draft failed:", message);
    return json({ error: message }, 400);
  }
});
