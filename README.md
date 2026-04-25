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
      allow read: if true;
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
