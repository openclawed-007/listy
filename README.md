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
- 🔗 Share by link or QR code, with per-visitor permissions (check off / add /
  remove)
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

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shoppingItems/{itemId} {
      allow read, delete: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
      allow update: if request.auth != null
        && request.auth.uid == resource.data.userId
        && request.resource.data.userId == resource.data.userId;
    }

    match /sharedLists/{ownerId} {
      allow get: if true;
      allow list: if false;
      allow create, update: if request.auth != null
        && request.auth.uid == ownerId
        && request.resource.data.ownerId == request.auth.uid;
      allow delete: if request.auth != null
        && request.auth.uid == ownerId;
    }
  }
}
```

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
