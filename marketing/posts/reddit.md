# Reddit

Reddit is the best and most dangerous place to launch. Rules: read each sub's sidebar the day you post (they change), use the required flair, never post the same text twice, and reply to everyone. Post once per sub. If a mod removes it, don't repost — message them politely and ask what to change.

Suggested order: r/SideProject → r/webdev (Saturday) → r/reactjs → r/selfhosted → r/androidapps (later, once the app has had a couple of releases).

---

## r/SideProject

Rules: friendly, self-promo welcome, they like the story and the honesty. Title as a plain sentence.

**Title**
```
I built a shared shopping list where the other people in the house don't need an account — you just stick a QR code on the fridge
```

**Body**
```
Every shared list app my household tried died at the same step: getting everyone else to install it and sign up. So the list lived on one phone and we went back to texting "did you say oat or almond?".

CartLink's whole idea is that sharing gives you a link and a QR code. Stick the QR on the fridge. Anyone who scans it sees the live list on their own phone and can tick things off or add to it, with no account at all if you allow it. Guests can never delete anything, and you can turn sharing off any time.

Other stuff that's in there because I kept wishing it was:
- Optional quantity + aisle fields; the list groups by aisle when you use them and stays flat when you don't
- Works offline in the basement Lidl, syncs when you come back up
- Undo delete (thumbs slip in the queue)
- Dark mode that remembers
- A proper native Android app (Kotlin/Compose), not a web view

It's free, no ads, and open source: https://github.com/openclawed-007/listy

Live at https://cartlink.co.uk

Honest gaps: sign-in for owners is Google-only right now, and the Android app is an APK on GitHub rather than the Play Store.

What would make you actually put the QR on your fridge? That's the question I'm trying to answer.
```

---

## r/webdev — "Showoff Saturday" only

Rules: **Saturdays only**, use the "Showoff Saturday" flair, they care about the build more than the product. Keep it technical.

**Title**
```
[Showoff Saturday] CartLink — shared shopping list with guest editing enforced in Firestore rules, plus a native Android client on the same data
```

**Body**
```
Site: https://cartlink.co.uk · Code: https://github.com/openclawed-007/listy

A shopping list that shares by link/QR, where the person who scans it doesn't need an account. React 19 + TS + Vite on the front, Firebase Auth/Firestore/App Check behind it, and a native Kotlin/Jetpack Compose Android app that talks to the same Firestore contract.

The bit I'd like feedback on is the permission model. It's enforced in security rules, not just the UI:

- Anonymous guests may only toggle or add. The rule compares `request.resource.data.items.size()` to `resource.data.items.size()` — a shrinking array from an anonymous UID is rejected outright.
- Signed-in collaborators get separate toggle/add/remove flags stored on the shared doc, and those fields (plus owner, name, sharing flags) are frozen against writes from anyone but the owner.
- App Check is enforced so only the real clients can write at all.

Other things that were more work than expected:
- Bidirectional sync between an owner's private list and the public snapshot without the two listeners fighting each other (took three attempts)
- Dark mode with no white flash — inline script on `<html>` before React mounts
- Service worker stale-while-revalidate that doesn't serve a stale `index.html` after a deploy

Vitest + Testing Library with Firebase mocked, so tests run without a project. Each screen is a lazy route, so the marketing page and the Firebase bundle never load for each other.

Known rough edges: Google sign-in only for owners, no rate limit on the public share page beyond App Check.
```

---

## r/reactjs

Rules: must be React-relevant, show-and-tell is fine, avoid sounding like an ad. Shorter than the webdev post.

**Title**
```
Built a real-time shared shopping list in React 19 + Firestore — the interesting part was making guest editing safe without accounts
```

**Body**
```
https://cartlink.co.uk · https://github.com/openclawed-007/listy

React 19, TypeScript, Vite 7, React Router 7, Firebase. Lazy routes per screen so the marketing page and the Firebase bundle don't load for each other. Tests with Vitest + Testing Library and Firebase fully mocked.

Things React people might find useful in the code:
- The landing page is a lazy chunk that only signed-out visitors download; the root route swaps between it and the app based on auth state
- Optimistic toggle with Firestore's offline queue, so the UI never waits for the network
- A collapsible "details" section in the add form that keeps the common path one input + enter

Happy to talk through any of it. Feedback on the code structure welcome — ShoppingList.tsx is too big and I know it.
```

---

## r/selfhosted

Rules: they want to run it themselves. Be upfront that it's Firebase, not Docker — some will bounce, that's fine. **Add a LICENSE before posting here**; they will ask.

**Title**
```
CartLink — open-source shared shopping list (QR/link sharing, guest editing, offline, Android). Runs on your own Firebase project in ~10 min
```

**Body**
```
Repo: https://github.com/openclawed-007/listy · Demo: https://cartlink.co.uk

Upfront: this is Firebase (Auth + Firestore + Hosting), not a Docker container. If that's a dealbreaker, fair enough. If you're fine with a Firebase project you control, the README gets you a private instance in about ten minutes — clone, `.env.local`, enable Google + Anonymous sign-in, deploy the rules.

What you get:
- Private per-user lists, shared via link or QR code
- Guest editing without accounts (toggle/add only, enforced in the rules — guests can never delete)
- Granular per-collaborator permissions, also server-enforced
- Offline support, dark mode, undo delete, quantity/aisle grouping
- A native Android app (Kotlin/Compose) you can build against your own project

The security rules are the part worth reading if you're going to run it: https://github.com/openclawed-007/listy/blob/main/firestore.rules

Not on the roadmap right now: a non-Firebase backend. The realtime + offline sync is doing a lot of work and swapping it is a rewrite. Saying that plainly so nobody's surprised.
```

---

## r/androidapps (post later, once the app has had 2+ releases)

Rules: they want a working app, screenshots, and they're allergic to web wrappers. Lead with "native".

**Title**
```
[DEV] CartLink — native (Kotlin/Compose) shared shopping list. Share by QR, helpers don't need an account. Free, no ads, open source. APK on GitHub
```

**Body**
```
APK: https://github.com/openclawed-007/listy/releases/latest (Android 7+)
Source: https://github.com/openclawed-007/listy
Web version: https://cartlink.co.uk

Fully native — Kotlin + Jetpack Compose, Firebase SDK directly, no web view. Google sign-in via Credential Manager. Offline persistence built in.

The idea: your list has a QR code. Stick it on the fridge. Whoever scans it can tick things off and add items on their own phone without installing anything or making an account. Only you (and people you explicitly allow) can delete.

Also: quantities and aisle grouping, undo delete, search, tabs for other people's lists you've imported, dark mode. App Links so cartlink.co.uk/share/... opens straight in the app.

Not on Play yet — it's a signed APK from GitHub Releases. Play listing is planned. Free, no ads, no IAP.

[Attach 3–4 screenshots: main list, share sheet with QR, dark mode, a shared list tab]
```

---

## Places NOT to post as the creator

- **r/InternetIsBeautiful** — bans self-promotion; if someone else posts it, great.
- **r/Frugal, r/CasualUK, r/MealPrepSunday** — off-topic promotion gets removed and remembered. If you're a genuine member and it comes up naturally in a comment, fine.
- **Lobste.rs** — invite-only, strict on self-promo. Skip.
