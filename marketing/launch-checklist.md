# Launch checklist

Work top to bottom. The first block is unglamorous and takes twenty minutes; it's also the part that compounds forever.

## 0. Before anyone sees it (do these first)

- [ ] **Deploy the new landing page** — `npm run build && firebase deploy`. Until this is live, every link below lands on a bare sign-in card.
- [ ] **Check the social card** — paste `https://cartlink.co.uk` into https://www.opengraph.xyz and https://cards-dev.twitter.com/validator (or just DM yourself the link on WhatsApp/iMessage). You should see the "Add it on the sofa" card, not the old square logo. If you see the old one, the platform has cached it — most validators have a "scrape again" button.
- [ ] **GitHub repo settings → About** (only you can do this):
  - Description: `Free shared shopping list with real-time sync. Share by link or QR — helpers don't need an account. Web + native Android.`
  - Website: `https://cartlink.co.uk`
  - Topics: `shopping-list` `grocery-list` `react` `typescript` `firebase` `firestore` `pwa` `offline-first` `qr-code` `real-time` `kotlin` `jetpack-compose` `android` `open-source`
- [ ] **Add a `LICENSE` file.** The repo currently has none, which legally means "all rights reserved" — people can't fork or contribute, and directories like awesome-selfhosted will reject it. MIT is the usual pick for something like this; it's your call.
- [ ] **Google Search Console** — add `cartlink.co.uk`, verify via the Firebase DNS record, submit `https://cartlink.co.uk/sitemap.xml`, then "Request indexing" on `/`. Do the same in **Bing Webmaster Tools** (it imports from Search Console in one click and also feeds DuckDuckGo).
- [ ] **Rich results test** — https://search.google.com/test/rich-results on the homepage should detect the `WebApplication` structured data with no errors.
- [ ] **Set up the `hello@cartlink.co.uk` inbox** if it isn't already real. Every post below points people at it.
- [ ] **Make the Android release page look intentional** — the GitHub release for `android-v2.0.0` should have a short description, a screenshot, and "what you need: Android 7+ (API 24)". People land there directly from the site.

## 1. Soft launch (week 1) — friends, then strangers who are kind

- [ ] Share with 5–10 households you actually know. Ask them to put the QR on the fridge for a week. **Collect one sentence from each** about what happened — these become your only honest testimonials.
- [ ] Post in **r/SideProject** and **r/webdev "Showoff Saturday"** — see [`posts/reddit.md`](./posts/reddit.md). Reply to every comment within a couple of hours.
- [ ] Post the **X/Bluesky thread** — [`posts/x-thread.md`](./posts/x-thread.md). Pin it.
- [ ] Submit to the low-effort directories in [`directories.md`](./directories.md) (AlternativeTo, SaaSHub, Uneed, etc.). Each is a backlink and a trickle of visitors forever.
- [ ] Fix whatever the first ten strangers trip over. There will be something.

## 2. Main launch (week 2–3) — one big day

Pick a **Tuesday, Wednesday or Thursday**. Do these within the same 24 hours so the traffic compounds:

- [ ] **Product Hunt** — schedule for 00:01 PT. Listing copy in [`posts/product-hunt.md`](./posts/product-hunt.md). Have 5 gallery images ready (see that file). Post the maker comment immediately.
- [ ] **Show HN** — post between 8–10am ET. Copy in [`posts/show-hn.md`](./posts/show-hn.md). **Do not ask anyone to upvote** — HN detects voting rings and buries the post. Just be around to answer questions for 4–6 hours.
- [ ] **LinkedIn** — [`posts/linkedin.md`](./posts/linkedin.md). Different audience, surprisingly good for a "families" product.
- [ ] **Short video** — [`posts/short-video.md`](./posts/short-video.md). Film it on your actual fridge. This is the most shareable thing you'll make.
- [ ] Reply to *everything*. Launch day traffic is 80% about the comment thread, not the post.

## 3. Keep it alive (ongoing, low effort)

- [ ] **Dev write-up** — [`posts/dev-blog.md`](./posts/dev-blog.md). The "guests can add but never delete, enforced in Firestore rules by comparing array lengths" trick is a genuinely interesting post that will pull in developers for years.
- [ ] Every time you ship something visible, one tweet/post with a 10-second screen recording. No thread, no fanfare.
- [ ] Watch **Search Console → Performance** monthly. When queries like "shared shopping list qr code" appear, make sure the landing page answers them in plain text (it already mentions all of them).
- [ ] When someone stars the repo or emails a nice thing, ask if you can quote them on the site. Add a small "what people say" section once you have three real ones.
- [ ] Post to **r/androidapps** and **r/fossdroid** once the Android app has had a couple of releases and feels solid — those communities are picky and remember first impressions.

## Things not to do

- Don't buy upvotes, followers or "launch packages". It's obvious and platforms punish it.
- Don't post the same text everywhere. Each file in `posts/` is written for its platform on purpose.
- Don't claim user numbers, "trusted by", or "#1 anything" until it's true and provable.
- Don't argue with a critical comment. "Fair point — noted" wins more users than a rebuttal.
- Don't submit to **r/InternetIsBeautiful** or **Lobste.rs** as the creator — both have strict self-promotion rules and it'll cost you goodwill. Let someone else post it there if they want to.
