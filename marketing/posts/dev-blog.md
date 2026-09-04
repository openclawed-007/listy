# Technical write-up — dev.to / Hashnode / own blog

Developer articles are the longest-lived marketing you'll do. A good one gets found via search for years and every reader is a potential contributor. Write it once, cross-post to dev.to and Hashnode with a canonical URL back to wherever you host it.

Aim for 1,200–1,800 words. Code snippets from the real `firestore.rules`. One diagram if you can be bothered.

---

## Title options

- **Letting strangers edit your Firestore document without letting them wreck it**
- **"Guests can add but never delete": enforcing that in Firestore security rules**
- **How I built QR-code sharing with no accounts on Firebase (and kept it safe)**

## Tags

`firebase` `firestore` `security` `react` `webdev`

## Intro (use as-is or rewrite in your voice)

```
I built a shared shopping list where the people you share with don't need an account. You stick a QR code on the fridge, someone scans it, and they can tick things off and add items from their own phone. No sign-up.

Saying that out loud to a developer usually gets the same reaction: "so anyone with the link can wipe your list?"

No — and the reason is about forty lines of Firestore security rules. This post is about those lines, the three wrong versions I wrote first, and the one trick that made anonymous editing safe: comparing array lengths before and after a write.
```

## Outline

1. **The product constraint** — guests must be able to help with zero setup. Anonymous Firebase auth gets them a UID; the question is what that UID is allowed to do.

2. **The data model** — private `shoppingItems/{userId}/…` vs. the public `sharedLists/{ownerId}` snapshot. Why a snapshot (single doc, single listener, `get` but never `list`).

3. **Wrong version #1: trust the client.** Permission flags in the UI, rules just check `isSignedIn()`. Obvious in hindsight.

4. **Wrong version #2: whitelist collaborator UIDs.** Falls apart the moment you want anonymous guests — they have no stable identity.

5. **The trick: array length as intent.** Anonymous writers may only *toggle* or *add*. Both preserve or grow `items`. So:
   ```
   allow update: if request.auth.token.firebase.sign_in_provider == 'anonymous'
     && resource.data.allowAnonymousEdits == true
     && request.resource.data.items.size() >= resource.data.items.size()
     && onlyItemsAndTimestampChanged();
   ```
   A shrinking array from an anonymous UID is rejected before your app code runs. Walk through why "≥" is exactly the right predicate for toggle+add.

6. **Freezing the metadata.** `owner`, `name`, `allowEdits`, `permissions`, `allowAnonymousEdits` must be unchanged unless `request.auth.uid == ownerId`. Show `affectedKeys().hasOnly([...])`.

7. **Signed-in collaborators and granular flags.** Separate `toggle` / `add` / `remove` permissions on the doc. Same length-comparison trick: `remove` permission ⇔ the array is allowed to shrink.

8. **App Check.** Rules stop malicious *data*; App Check stops malicious *clients*. Why anonymous editing is only safe with enforcement turned on, and how the Android app uses Play Integrity for the same thing.

9. **What this doesn't solve** — rate limiting, a guest adding 500 items of nonsense. Be honest. Mention the item length caps and what a real fix would look like (Cloud Function counter, or a per-doc write timestamp check in rules).

10. **The sync fight** (short) — owner's private list ↔ public snapshot, two `onSnapshot` listeners, and how they kept reverting each other's writes until the listener was made stable across owner edits. Link the commit.

11. **Try it / read it** — cartlink.co.uk, the rules file, the Android client using the same contract.

## Closing line

```
The whole thing is open source: https://github.com/openclawed-007/listy. The rules file is short and I'd genuinely like someone to try to break it.
```
