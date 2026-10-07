# Traditional Wedding Dress blog

A static HTML wedding-dress blog for GitHub Pages, a Chrome extension for publishing articles with user-authorized photo links, and a Supabase backend for accounts and post content.

## How it works

1. Sign in to the extension with an editor account created in Supabase.
2. Add an optional HTTPS more-information link, a title, original article, search description, and a featured photo link. Add accurate descriptions and confirm the rights for every photo. Additional photos can be placed after a selected paragraph.
3. The featured image appears at the top of the article. The Supabase function downloads authorized JPG, PNG, or WebP photo links from FastDL or Instagram/Facebook CDNs to `images/posts/<post-id>/` in this GitHub repository. File names use the article title and a featured/numbered suffix. Signed FastDL links are downloaded while valid.
4. Choose **Save as draft** or **Publish now**. Publishing makes the article available immediately at its direct article link and starts a GitHub Pages rebuild. That build adds the search-friendly page, homepage listing, and sitemap entries for all its pictures. Drafts can be reviewed in `admin.html`.
5. Only published posts appear in public pages, the homepage, and the sitemap. A GitHub Actions workflow rebuilds the static article pages and homepage after repository updates and about every five minutes.

Each published post has its own search-friendly URL and pre-rendered HTML with its full article text, title, search description, canonical URL, sharing metadata, image alt text, and `BlogPosting` structured data. The homepage's featured, recent, latest, and trending post sections are also generated into the initial HTML; the home page does not wait for a browser-side Supabase request to display them. Drafts are excluded from the public sitemap and generated article pages. Search engines decide how and when to index content; technical SEO cannot guarantee search rankings.

Photo downloads are restricted to HTTPS FastDL and Instagram/Facebook CDN links, capped at 8 MB each, and stored in this site's GitHub repository. Each photo needs its own rights confirmation. Write useful, original descriptions; avoid repeating keywords unnaturally, and only describe details that are actually present in the dress and image.

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
2. In the Supabase SQL Editor, run [`supabase/migrations/20261006000000_create_editorial_posts.sql`](./supabase/migrations/20261006000000_create_editorial_posts.sql), [`supabase/migrations/20261006000001_remove_image_rights_confirmation.sql`](./supabase/migrations/20261006000001_remove_image_rights_confirmation.sql), [`supabase/migrations/20261007000000_add_article_photos.sql`](./supabase/migrations/20261007000000_add_article_photos.sql), and [`supabase/migrations/20261007000001_add_editor_categories_analytics.sql`](./supabase/migrations/20261007000001_add_editor_categories_analytics.sql), in that order.
3. In Authentication, create an editor user with an email and password. The same account is used by the extension and site editor.
4. Install the Supabase CLI, log in, and link this project:

   ```text
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

5. In Supabase Authentication → Users, copy the editor account's user UUID. Add `EDITOR_USER_ID` and `GITHUB_TOKEN` under Supabase **Edge Function Secrets**. Create a fine-grained GitHub token restricted to `masasecomm/TradWeddingDress` with **Contents: Read and write** and **Actions: Read and write** permissions. The function only accepts that editor UUID and uses the token to save photos and request the site rebuild. Never put the token in the extension, website files, or Git.

6. Deploy the function:

   ```text
   supabase functions deploy create-draft
   ```

7. Edit `config.js` and fill in the project URL and anon key. Both are public browser configuration values: the anon key is protected by the database's row-level security policies. Commit these two values with the static website so GitHub Pages can load them. Never put the GitHub token in this file.

## Search indexing and GitHub Pages

The site is built by `.github/workflows/seo-pages.yml`. It reads only published posts through Supabase's public, row-level-secured API and builds their complete static pages, homepage cards, `robots.txt`, and XML image sitemap. The workflow runs after pushes to `main`, on a five-minute schedule to pick up new posts published from the extension, and when manually started in GitHub Actions. A failed Supabase request fails the build instead of deploying an incomplete site.

For the first setup, open the repository's **Settings → Pages**, change **Source** to **GitHub Actions**, and save it. This is required because Pages currently uses a branch-based Jekyll deployment; the SEO workflow publishes a generated `_site` artifact. Check the workflow's build/deploy status after enabling it.

After deployment, check `https://traditionalweddingdress.com/sitemap.xml` and `https://traditionalweddingdress.com/robots.txt`. In [Google Search Console](https://search.google.com/search-console/), add and verify the `traditionalweddingdress.com` domain property, submit `https://traditionalweddingdress.com/sitemap.xml`, then use URL Inspection to request indexing for the homepage and new article pages. Google indexing and ranking are not immediate or guaranteed.

GitHub Pages serves `404.html` for unknown page URLs, and it redirects visitors to the home page. Unknown routes (including deleted-post URLs) therefore go home; links to removed articles are omitted from the generated sitemap.

## Load the Chrome extension

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Select **Load unpacked** and choose the repository's `extension` folder. The extension is named **Traditional Wedding Dress Website**.
3. Click the extension icon to open FastDL, Instagram, and the website's full `admin.html` studio in separate tabs. The site's **Editor** button opens the same studio, so all editor features are available without the extension.
4. Complete the Cloudflare security check and sign in with the editor account. Create categories, write articles, manage drafts and published posts, view analytics, and save or publish.

The extension icon opens FastDL, Instagram, and the website's `admin.html` studio. The **Editor** link on the website opens this same studio. It supports article creation, categories, editing, draft/published filters, confirmed deletion, post dates, view counts, views today, and active readers. The dashboard polls active readership every 10 seconds; published article pages send anonymous random session IDs for view counting and update presence every 30 seconds. No IP address, name, or email is recorded for readership analytics. A view is counted once per anonymous browser tab per article per 30-minute window; active readers expire after 90 seconds without a heartbeat.

For each photo, enter its link, image description, and rights confirmation; the studio saves a permanent GitHub copy and replaces the temporary URL with the website URL. Additional images can be placed after selected paragraphs. After replacing extension files, open `chrome://extensions` and select **Reload** for the unpacked extension.

Images are downloaded and committed to the GitHub repository by the Supabase Edge Function, not by exposing a GitHub credential in the extension or website.
