# CartLink

A clean, minimal shopping list app with Google sign-in and real-time sync.

**Live:** Firebase Hosting · **Stack:** React + TypeScript + Vite + Firebase

## Features

- ✍️ **One smart field** — type `2 milk`, `500g flour` or `bread x3` and the
  quantity is read for you. No extra boxes, no toggles.
- 🧺 **Sorts itself by aisle** — items are matched against a built-in grocery
  dictionary and grouped under Produce, Bakery, Dairy & Eggs, and so on.
  Unrecognised items stay in *General* rather than being filed somewhere wrong.
  Override any aisle by editing the row, or by typing `batteries #shed`.
- 🔁 **No duplicate rows** — adding something already on the list bumps its
  quantity (and un-checks it if you'd already ticked it off).
- 📊 **Progress bar** so you can see how much of the shop is left.
- 🔗 Share by **short code**, link or QR (all open the same live list), with
  per-visitor permissions (check off / add / remove). Codes are random and
  revoked when you stop sharing. Visitors who can't (or don't want to) sign in
  can still tick items off — their progress stays on their device.
- 👤 **Guest mode** — use a private list on this device with no account. Sign in
  later and your guest items are brought into the synced list automatically.
- 🔐 Google Sign-In (Firebase Auth)
- ⚡ Real-time sync across devices (Firestore)
- 🔍 Search (appears once a list is worth searching; press `/` any time)
- ⌨️ Shortcuts: `/` search, `n` new item, `Enter` save, `Esc` cancel
- 🌙 Dark mode with persistent preference
- 📱 Fully responsive
- 📶 Offline-ready with local changes synced when the connection returns

## Project layout

```
src/lib/itemInput.ts     smart parsing: quantity, #category, aisle guessing
src/lib/shoppingItem.ts  item shape, Firestore sanitising, grouping, batching
src/lib/sharePermissions.ts  what a share-link visitor is allowed to do
src/lib/sharedSync.ts    diffing the published list against collaborator edits
src/lib/localTicks.ts    a visitor's own ticks on a list they can't write to
src/components/          ShoppingList (screen) + ItemRow, ShareDialog,
                         ConfirmDialog, DismissibleMessage, UserAvatar
src/hooks/               useDarkMode, useOnlineStatus
```

Parsing and item rules are pure functions in `src/lib`, so behaviour is unit
tested without Firebase or a browser.

## Setup

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd cartlink
   npm install
   ```

2. **Configure Firebase**
   ```bash
   cp .env.example .env.local
   ```
   Then fill in your Firebase project credentials in `.env.local` from the [Firebase Console](https://console.firebase.google.com).

3. **Enable Google Sign-In** in Firebase Console → Authentication → Sign-in providers.

4. **Set Firestore rules** (see `README` Security section below).

5. **Run locally**
   ```bash
   npm run dev
   ```

## Firestore Security Rules

The live ruleset is `firestore.rules` in this repo — deploy it rather than
copying rules out of documentation:

```bash
firebase deploy --only firestore:rules
```

In short: a signed-in user can only read and write their own `shoppingItems`,
and `sharedLists/{ownerId}` is world-readable by document ID but only the owner
may create it, rename it or change its permissions. A signed-in collaborator
may change nothing but the `items` array, and only while the owner has editing
switched on. Rules also block list-size changes that the permission flags
forbid (e.g. adding when only “check off” is granted). Per-item content limits
are still enforced in the client.

## Deploy

```bash
npm run build
firebase deploy
```

## Checks

```bash
npm run lint
npm run test
npm run build
```
