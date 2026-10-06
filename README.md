# Traditional Wedding Dress blog

A static HTML wedding-dress blog for GitHub Pages, a Chrome extension for saving your own article drafts with Instagram pictures, and a Supabase backend for accounts, draft storage, and featured images.

## How it works

1. Sign in to the extension with an editor account created in Supabase.
2. Paste an Instagram post/reel URL, write your title and article, and either select a photo or use the configured Instagram oEmbed integration.
3. Choose **Save as draft** or **Publish now**. The extension saves the article and featured image, then updates the article's status if you choose to publish.
4. Sign in at `admin.html` on the website to preview the article, then publish or delete it.
5. Only published posts appear on the public blog.

The image-rights checkbox is required. Only use images you own or have permission to republish.

## Contact form and Google Sheets

The contact form is connected to the `TradWedDress` tab in the supplied Google Sheet through a dedicated Apps Script web app. Valid submissions are also emailed to `masasecomm@gmail.com`. Its source is [`google-apps-script/Code.gs`](./google-apps-script/Code.gs), and the deployed web app URL is configured in `config.js`. If you edit the handler, save it and deploy a new version from the Apps Script project's **Deploy → Manage deployments** page.

The form stores names, email addresses, optional phone numbers, messages, and submission time. It does not request or store visitor locality. The Apps Script validates submissions, includes a hidden anti-spam field, and limits repeat submissions from the same email address.

## Cloudflare Turnstile login

The website editor and Chrome extension use the supplied Turnstile site key and send challenge tokens to Supabase. The extension loads its challenge from `turnstile.html` on the website, so keep `traditionalweddingdress.com` in the widget's allowed hostnames. In the Supabase dashboard, configure CAPTCHA under **Authentication → Bot and Abuse Protection** with provider **Turnstile by Cloudflare** and enter the matching Turnstile **secret key** there. Never put the secret in `config.js`, the extension, or the website. The secret key is not required in this repository.

Supabase CAPTCHA enforcement applies to extension sign-ins too. Load the updated extension and confirm its Cloudflare security check is available before enabling CAPTCHA in Supabase. Existing extension sessions do not need to be refreshed.

## Google AdSense

The AdSense loader for publisher `ca-pub-3860151941190347` is included on the public homepage and article template. This loads AdSense but does not place visible ads by itself. After your site is approved, create ad units in AdSense and add their provided ad-unit markup where you want ads to appear. Do not add ads to the editor or Chrome extension.

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

## Publish the site on GitHub Pages

1. Commit the website files and push them to your GitHub repository.
2. In the repository's **Settings → Pages**, select the branch and root folder you want to publish.
3. Make sure the configured `config.js` is included in the deployed site.
4. Open the published site and sign in at `admin.html` to confirm the editor works.

The blog uses relative page links and is suitable for a repository hosted at a GitHub Pages project URL.

## Load the Chrome extension

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Select **Load unpacked** and choose the repository's `extension` folder. The extension is named **Traditional Wedding Dress Website**.
3. Open the extension popup. The Supabase project connection is prefilled; expand **Website connection** only if you need to change it.
4. Complete the Cloudflare security check and sign in with the editor account. Paste a valid Instagram post or reel link, enter your title and article, select an authorized image if needed, and confirm your image rights.
5. Choose **Save as draft** to review it later in `admin.html`, or **Publish now** to make it live immediately.

The extension stores the Supabase URL, anon key, and sign-in session in Chrome extension storage. The password and CAPTCHA token are not stored. Its current connection setting expects a standard `*.supabase.co` project URL. After replacing extension files, open `chrome://extensions` and select **Reload** for the unpacked extension.

Write or paste your article directly into the extension. It saves your title and article as a draft without using an AI service. The article summary is made from the first part of your text. Instagram photo retrieval requires an eligible Meta oEmbed token; otherwise, upload the image file yourself.
