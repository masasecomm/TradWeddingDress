# Traditional Wedding Dress blog

A static HTML wedding-dress blog for GitHub Pages, a Chrome extension for saving your own article drafts with Instagram pictures, and a Supabase backend for accounts, draft storage, and featured images.

## How it works

1. Sign in to the extension with an editor account created in Supabase.
2. Paste an Instagram post/reel URL, write a specific article title and original article, add a 50–160 character search description and descriptive image alt text, and either select a photo or use the configured Instagram oEmbed integration.
3. Choose **Save as draft** or **Publish now**. The extension saves the article and featured image, then updates the article's status if you choose to publish.
4. Sign in at `admin.html` on the website to preview the article, then publish or delete it.
5. Only published posts appear in public pages, the homepage, and the sitemap. A GitHub Actions workflow rebuilds the static article pages and homepage after repository updates and about every five minutes.

Each published post has its own search-friendly URL and pre-rendered HTML with its full article text, title, search description, canonical URL, sharing metadata, image alt text, and `BlogPosting` structured data. The homepage's featured, recent, latest, and trending post sections are also generated into the initial HTML; the home page does not wait for a browser-side Supabase request to display them. Drafts are excluded from the public sitemap and generated article pages. Search engines decide how and when to index content; technical SEO cannot guarantee search rankings.

The image-rights checkbox is required. Only use images you own or have permission to republish. Write useful, original descriptions; avoid repeating keywords unnaturally, and only describe details that are actually present in the dress and image.

## Contact form and Google Sheets

The contact form is connected to the `TradWedDress` tab in the supplied Google Sheet through a dedicated Apps Script web app. Valid submissions are also emailed to `masasecomm@gmail.com`. Its source is [`google-apps-script/Code.gs`](./google-apps-script/Code.gs), and the deployed web app URL is configured in `config.js`. If you edit the handler, save it and deploy a new version from the Apps Script project's **Deploy → Manage deployments** page.

The form stores names, email addresses, optional phone numbers, messages, and submission time. It does not request or store visitor locality. The Apps Script validates submissions, includes a hidden anti-spam field, and limits repeat submissions from the same email address.

## Cloudflare Turnstile login

The website editor and Chrome extension use the supplied Turnstile site key and send challenge tokens to Supabase. The extension loads its challenge from `turnstile.html` on the website, so keep `traditionalweddingdress.com` in the widget's allowed hostnames. In the Supabase dashboard, configure CAPTCHA under **Authentication → Bot and Abuse Protection** with provider **Turnstile by Cloudflare** and enter the matching Turnstile **secret key** there. Never put the secret in `config.js`, the extension, or the website. The secret key is not required in this repository.

Supabase CAPTCHA enforcement applies to extension sign-ins too. Load the updated extension and confirm its Cloudflare security check is available before enabling CAPTCHA in Supabase. Existing extension sessions do not need to be refreshed.

## Google AdSense

The AdSense loader for publisher `ca-pub-3860151941190347` is included on public pages. It starts about eight seconds after the page finishes loading so third-party ad scripts do not delay the initial content or mobile performance measurement. This loads AdSense but does not place visible ads by itself. After your site is approved, create ad units in AdSense and add their provided ad-unit markup where you want ads to appear. Do not add ads to the editor or Chrome extension.

## Supabase setup

1. Create a Supabase project and copy its project URL and anon key.
2. In the Supabase SQL Editor, run [`supabase/migrations/20261006000000_create_editorial_posts.sql`](./supabase/migrations/20261006000000_create_editorial_posts.sql).
3. In Authentication, create an editor user with an email and password. The same account is used by the extension and site editor.
4. Install the Supabase CLI, log in, link this project, and deploy the function:

   ```text
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy create-draft
   ```

5. No AI key is needed. The Instagram token is optional if you always upload the image yourself:

   ```text
   supabase secrets set INSTAGRAM_OEMBED_ACCESS_TOKEN=YOUR_META_OEMBED_TOKEN
   ```

   The optional token must be issued for an app with Instagram oEmbed access. Instagram may not return a photo preview for every post; the extension reports this and you can upload an image instead. Meta controls token access and supported embeds.

6. Edit `config.js` and fill in the project URL and anon key. Both are public browser configuration values: the anon key is protected by the database's row-level security policies. Commit these two values with the static website so GitHub Pages can load them. Never put a service-role key or Meta access token in this file.

## Search indexing and GitHub Pages

The site is built by `.github/workflows/seo-pages.yml`. It reads only published posts through Supabase's public, row-level-secured API and builds their complete static pages, homepage cards, `robots.txt`, and XML image sitemap. The workflow runs after pushes to `main`, on a five-minute schedule to pick up new posts published from the extension, and when manually started in GitHub Actions. A failed Supabase request fails the build instead of deploying an incomplete site.

For the first setup, open the repository's **Settings → Pages**, change **Source** to **GitHub Actions**, and save it. This is required because Pages currently uses a branch-based Jekyll deployment; the SEO workflow publishes a generated `_site` artifact. Check the workflow's build/deploy status after enabling it.

After deployment, check `https://traditionalweddingdress.com/sitemap.xml` and `https://traditionalweddingdress.com/robots.txt`. In [Google Search Console](https://search.google.com/search-console/), add and verify the `traditionalweddingdress.com` domain property, submit `https://traditionalweddingdress.com/sitemap.xml`, then use URL Inspection to request indexing for the homepage and new article pages. Google indexing and ranking are not immediate or guaranteed.

GitHub Pages serves `404.html` for unknown page URLs, and it redirects visitors to the home page. Unknown routes (including deleted-post URLs) therefore go home; links to removed articles are omitted from the generated sitemap.

## Load the Chrome extension

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Select **Load unpacked** and choose the repository's `extension` folder. The extension is named **Traditional Wedding Dress Website**.
3. Open the extension popup. The Supabase project connection is prefilled; expand **Website connection** only if you need to change it.
4. Complete the Cloudflare security check and sign in with the editor account. Paste a valid Instagram post or reel link, enter your title and article, add its search description and an accurate featured-image description, select an authorized image if needed, and confirm your image rights.
5. Choose **Save as draft** to review it later in `admin.html`, or **Publish now** to make it live immediately.

The extension stores the Supabase URL, anon key, and sign-in session in Chrome extension storage. The password and CAPTCHA token are not stored. Its current connection setting expects a standard `*.supabase.co` project URL. After replacing extension files, open `chrome://extensions` and select **Reload** for the unpacked extension.

Write or paste your article directly into the extension. It saves your title, description, article, and image description without using an AI service. Instagram photo retrieval requires an eligible Meta oEmbed token; otherwise, upload the image file yourself.
