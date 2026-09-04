# Show HN

HN rules that matter: title must start with `Show HN:`, no marketing language, no emoji, no asking for upvotes anywhere (they detect voting rings and will bury the post). The community rewards technical honesty and punishes hype. Post between 8–10am ET on a Tue/Wed/Thu and stay in the thread for 4–6 hours.

Title limit is 80 characters.

## Title

```
Show HN: CartLink – a shared shopping list where helpers don't need an account
```

Alternative if that reads as too salesy:

```
Show HN: CartLink – open-source shared shopping list (React, Firestore, Android)
```

## URL

```
https://cartlink.co.uk
```

## Text (goes in the text box; HN shows it under the link)

```
I built this because every "family shopping list" app we tried died at the
same step: getting the other people in the house to install it and make an
account. The list ends up on one phone and you're back to texting "did you
say oat or almond?".

CartLink's answer is that sharing produces a link and a QR code. Anyone who
scans it sees the live list and, if you allow it, can tick things off and add
items with no account at all (they're signed in anonymously under the hood).
Only the owner and explicitly-permitted collaborators can remove items.

The part I found interesting to build: the permission model is enforced in
Firestore security rules, not just the UI. Anonymous writers may only
toggle/add, which the rules check by comparing the items array length before
and after the write – a shrinking array from an anonymous UID is always
rejected. Collaborators get separate toggle/add/remove flags that are frozen
against modification by anyone but the owner. App Check is enforced so only
the real web and Android clients can write.

Stack: React 19 + TypeScript + Vite, Firebase Auth/Firestore/App Check,
Firebase Hosting. There's also a native Android app in Kotlin/Jetpack Compose
that talks to the same Firestore contract (no web view) – APK on the GitHub
releases page.

It's free, no ads, and the code is here: https://github.com/openclawed-007/listy

Things I know are rough: Google sign-in is the only option for owners
(anonymous is only for guests), and the Android app isn't on the Play Store
yet. Happy to answer anything about the rules approach or the collaborator
sync, which took several iterations to stop fighting itself.
```

## Comment playbook

You will get these. Have answers ready, keep them short, never defensive.

**"Why Google sign-in only?"**
> Honest answer: it was the fastest path to a working product and every household I tested with had a Google account. Email/passkey sign-in is the most-requested thing and it's next. Guests never need any of it.

**"Why Firebase / what about self-hosting?"**
> Firestore's realtime listeners and offline persistence are doing a lot of the heavy lifting, especially on Android where the SDK handles the offline queue for free. You can self-host by pointing it at your own Firebase project — the README covers it in about ten minutes. A non-Firebase backend would be a rewrite of the sync layer; not ruling it out, not promising it either.

**"Isn't the shared list URL guessable?"**
> The share ID is the owner's Firebase UID, which is a 28-char random string. The `sharedLists` collection allows `get` by ID but never `list`, so there's no enumeration path. It's the same threat model as an unlisted YouTube link: if you have it, you can see it. That's deliberate — it's what makes the fridge QR work with no accounts.

**"What stops a guest spamming 10,000 items?"**
> Right now: App Check (requests must come from the real app) plus a per-item length cap. There's no rate limit yet, and that's a fair criticism for a public share page. On the list.

**"Looks like every other list app."**
> Fair — the list itself is deliberately boring. The thing I'd claim is different is that the person who scans the fridge code needs zero setup. Most alternatives make them install something.

**"Why not just use a shared Apple/Google note?"**
> Genuinely works for a lot of people. It falls down for us on: no tick/untick with strikethrough that syncs cleanly, no way to give a guest a link without adding them to your account, and no grouping by aisle. If a shared note works for you, keep using it.

**Someone finds a bug**
> Thank them specifically, reproduce it live if you can, link the GitHub issue you just opened. This is the single best thing that can happen in the thread.
