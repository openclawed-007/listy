# X / Bluesky / Threads — build story thread

Post as a thread, one idea per post. First post carries the link and the social card (it'll unfurl to `og-image.jpg`). Pin it. Works unchanged on Bluesky and Threads; drop the hashtags there.

Post between 9–11am UK on a weekday. Reply to every reply for the first two hours.

---

**1/**
```
Every shared shopping list app we tried died at the same step: getting the other people in the house to download it and make an account.

So I built one where they don't have to.

https://cartlink.co.uk
```
*(attach nothing — let the link unfurl to the social card)*

**2/**
```
The idea is embarrassingly simple.

You turn on sharing. You get a QR code. You stick it on the fridge.

Anyone who scans it is looking at the live list on their own phone. They can tick things off. They can add things. No download. No sign-up.
```
*(attach: photo of a printed QR on a real fridge, phone next to it)*

**3/**
```
"But then anyone can wreck my list."

No. Guests can tick and add. They can never delete. That's not a UI setting — it's enforced in the database rules. A guest trying to shrink the list gets rejected by the server before the app even sees it.
```

**4/**
```
Tick something on one phone and it's gone on all of them before you've reached the next aisle.

No refresh button. No "did you get the…?" texts.
```
*(attach: 8-second screen recording, two phones side by side, one ticks, the other updates)*

**5/**
```
Stuff that's in there because I kept wishing it was:

• add "2" and "Dairy" and it groups by aisle
• undo delete, because thumbs slip in the queue
• works offline in the basement supermarket
• dark mode that remembers
• a proper native Android app, not a web view
```

**6/**
```
What it doesn't do:

• no ads
• no selling your data
• no premium tier
• no account for helpers

It's a small project by one person. The code is open: https://github.com/openclawed-007/listy
```

**7/**
```
Honest gaps: sign-in for list owners is Google-only right now, and Android is an APK from GitHub rather than the Play Store. Both are next.

If you try it, I'd genuinely like to know what would make you actually put the QR on your fridge.

https://cartlink.co.uk

#buildinpublic #opensource
```

---

## Single-post version (if you don't want a thread)

```
Built a shared shopping list where the other people in the house don't need an account.

You stick a QR code on the fridge. Anyone who scans it can tick things off and add items on their own phone. Guests can never delete — enforced server-side, not just in the UI.

Free, no ads, open source. Native Android app too.

https://cartlink.co.uk
```

## Follow-up posts for later (one per week, no fanfare)

- A 10-second clip of the undo-delete toast. Caption: *"Thumbs slip in the queue."*
- Dark mode screenshot. Caption: *"Late-night meal planning palette."*
- Screenshot of the Firestore rule that rejects a shrinking array from an anonymous user. Caption: *"The line that makes the fridge QR safe."*
- When someone emails something nice (with permission): quote it, nothing else.
