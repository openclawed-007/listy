# CartLink

A clean, minimal shopping list app with Google sign-in and real-time sync.

**Live:** Firebase Hosting · **Stack:** React + TypeScript + Vite + Firebase

## Features

- 🔐 Google Sign-In (Firebase Auth)
- ⚡ Real-time sync across devices (Firestore)
- 🔍 Search & filter (All / Needed / Got it)
- 🌙 Dark mode with persistent preference
- 📱 Fully responsive
- 📶 Offline-ready with local changes synced when the connection returns

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

3. **Enable sign-in providers** in Firebase Console → Authentication → Sign-in providers:
   - **Google** (required, for account holders).
   - **Anonymous** (required if you want non-signed-in visitors to edit shared lists via a QR/link).

   **Enforce App Check on Cloud Firestore** (Firebase Console → App Check). This is required to safely allow anonymous edits: it ensures only requests from your real app are accepted. Set `VITE_RECAPTCHA_SITE_KEY` in your env.

4. **Set Firestore rules** (see `README` Security section below).

5. **Run locally**
   ```bash
   npm run dev
   ```

## Firestore Security Rules

The authoritative rules live in [`firestore.rules`](./firestore.rules) and are deployed with `firebase deploy`. Highlights:

- **`shoppingItems`** are private: only the owner (`request.auth.uid == userId`) can read/write their own items.
- **`sharedLists/{ownerId}`** are publicly readable by ID (`allow get`) but never listable.
- Only the **owner** can create/replace their shared doc or delete it.
- **Collaborators** (signed-in, non-owner) can only change the `items` array and `updatedAt`; ownership, name, permissions and the sharing flags are frozen by the rules. The granular `toggle` / `add` / `remove` permission set is enforced **server-side** (by comparing item-array length changes), not just in the client.
- **Anonymous visitors** (auto-signed-in on the public share page) may edit only when the owner sets `allowAnonymousEdits: true`, and may only **toggle or add** (a shrinking items array from an anonymous writer is always rejected). They can never remove items.

> Safe anonymous editing depends on **App Check being enforced** on Firestore (see Setup step 3). Without enforcement, do not enable anonymous edits.

## Deploy

```bash
npm run build
firebase deploy
```

## Android app (native)

A fully native Android app lives in [`android/`](./android) — Kotlin + Jetpack
Compose talking straight to Firebase (no web view). It shares the same
Firestore data contract as the web app: private items in `shoppingItems`,
public snapshots in `sharedLists/{ownerId}`, including the owner ↔ collaborator
sync and granular share permissions.

**Features:** native Google Sign-In (Credential Manager), real-time sync with
built-in offline persistence, quantity/category, undo delete, search, list tabs
for imported shared lists, share link + QR code with granular permissions, dark
mode, and App Links so `cartlink.co.uk/share/...` and `/import/...` open in the
app.

### Setup

1. In the [Firebase Console](https://console.firebase.google.com), add an
   **Android app** (package `uk.co.cartlink.app`) to the existing project and
   register your debug and release **SHA-1/SHA-256 fingerprints**
   (`./gradlew signingReport`). This is required for Google Sign-In and App
   Check (Play Integrity).
2. Download `google-services.json` into `android/app/` (gitignored; see
   `android/app/google-services.example.json` for the expected shape).
3. Because App Check is enforced on Firestore, register the app in
   **App Check**: Play Integrity for release; for debug builds copy the debug
   token printed in Logcat into the console.
4. Build:
   ```bash
   cd android
   gradle :app:assembleDebug   # requires JDK 17–21 and the Android SDK
   ```

Release builds are signed with `android/keystore.properties` +
`android/keystore/` when present (both gitignored). The site already serves
`public/.well-known/assetlinks.json` so App Links verify against the release
signing key.

## Checks

```bash
npm run lint
npm run test
npm run build
```
