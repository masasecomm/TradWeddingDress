import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateSite, postDescription, postSlug, postUrl } from "./build-site.mjs";

const validPost = {
  id: "12345678-1234-4234-8234-123456789abc",
  title: "Brown Shweshwe Traditional Wedding Dress",
  excerpt: "Explore the details, colours, and styling ideas behind this brown Shweshwe traditional wedding dress.",
  body: "A thoughtful introduction to this traditional wedding dress and its distinctive print.\n\nPair the skirt with coordinated accessories for a celebration look.",
  category: "Shweshwe",
  featured_image_url: "https://birfyvrtkmzgghaspodx.supabase.co/storage/v1/object/public/wedding-dress-images/test/featured.webp",
  image_alt: "Brown Shweshwe wedding dress with a coordinated traditional skirt",
  source_url: "https://www.instagram.com/p/Abc123/",
  created_at: "2026-10-06T12:00:00.000Z",
  published_at: "2026-10-06T12:10:00.000Z",
  status: "published"
};

test("post URLs are stable, readable, and slug-safe", () => {
  assert.equal(
    postSlug(validPost),
    "brown-shweshwe-traditional-wedding-dress-12345678-1234-4234-8234-123456789abc"
  );
  assert.equal(postUrl(validPost), "https://traditionalweddingdress.com/posts/brown-shweshwe-traditional-wedding-dress-12345678-1234-4234-8234-123456789abc/");
  assert.throws(() => postSlug({ ...validPost, id: "../private" }), /invalid id/);
});

test("article description is plain text, bounded, and uses useful body text as fallback", () => {
  assert.equal(postDescription({ ...validPost, excerpt: "<b>Beautiful</b> brown Shweshwe dress inspiration with colour and detail." }), "Beautiful brown Shweshwe dress inspiration with colour and detail.");
  const description = postDescription({ ...validPost, excerpt: "Short", body: "Traditional dress ideas and colours for a beautiful Shweshwe wedding celebration. " + "Details ".repeat(40) });
  assert.ok(description.length <= 160);
  assert.match(description, /^Short Traditional dress ideas/);
});

test("site generation emits indexable, escaped article pages and a published-only sitemap", async () => {
  const root = process.cwd();
  const destination = await mkdtemp(path.join(root, ".seo-test-"));
  const posts = [
    validPost,
    { ...validPost, id: "deadbeef-0000-4000-8000-000000000000", title: "<script>alert(1)</script>", status: "published" },
    { ...validPost, id: "30000000-0000-4000-8000-000000000000", title: "Tsonga Traditional Wedding Dress Ideas", status: "published" },
    { ...validPost, id: "40000000-0000-4000-8000-000000000000", title: "Tshivenda Attire for a Wedding", status: "published" },
    { ...validPost, id: "50000000-0000-4000-8000-000000000000", title: "Brown and Cream Shweshwe Dress", status: "published" },
    { ...validPost, id: "draft000-0000-4000-8000-000000000000", status: "draft" }
  ];
  try {
    const result = await generateSite(posts, destination);
    assert.equal(result.postCount, 5);
    const article = await readFile(path.join(destination, "posts", postSlug(validPost), "index.html"), "utf8");
    assert.match(article, /<title>Brown Shweshwe Traditional Wedding Dress \| Traditional Wedding Dress<\/title>/);
    assert.match(article, /<link rel="canonical" href="https:\/\/traditionalweddingdress\.com\/posts\//);
    assert.match(article, /property="og:image:alt"/);
    assert.match(article, /<h1 itemprop="headline">Brown Shweshwe Traditional Wedding Dress<\/h1>/);
    assert.match(article, /"@type":"BlogPosting"/);
    assert.match(article, /<p>A thoughtful introduction/);
    assert.doesNotMatch(article, /<script>alert\(1\)<\/script>/);
    const sitemap = await readFile(path.join(destination, "sitemap.xml"), "utf8");
    assert.match(sitemap, /posts\/brown-shweshwe-traditional-wedding-dress-/);
    assert.doesNotMatch(sitemap, /draft000/);
    const robots = await readFile(path.join(destination, "robots.txt"), "utf8");
    assert.match(robots, /Sitemap: https:\/\/traditionalweddingdress\.com\/sitemap\.xml/);
    const index = await readFile(path.join(destination, "index.html"), "utf8");
    assert.match(index, /posts\/brown-shweshwe-traditional-wedding-dress-/);
    assert.match(index, /<h1>Brown Shweshwe Traditional Wedding Dress<\/h1>/);
    assert.match(index, /fetchpriority="high"/);
    assert.match(index, /alt="Brown Shweshwe wedding dress with a coordinated traditional skirt"/);
    assert.match(index, /Tshivenda Attire for a Wedding/);
    assert.match(index, /Brown and Cream Shweshwe Dress/);
    assert.doesNotMatch(index, /<!-- (?:FEATURED_POSTS|RECENT_POSTS|LATEST_POSTS|TRENDING_POSTS)_START -->/);
    const homeScript = await readFile(path.join(destination, "app.js"), "utf8");
    assert.doesNotMatch(homeScript, /supabase|fetch\(/i);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
