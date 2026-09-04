import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const projectId = "cartlink-rules-test";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

async function seed(path: string, value: Record<string, unknown>) {
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), path), value));
}

describe("Firestore rules", () => {
  it("keeps shopping items private to their owner", async () => {
    const owner = env.authenticatedContext("owner").firestore();
    const stranger = env.authenticatedContext("stranger").firestore();
    await assertSucceeds(setDoc(doc(owner, "shoppingItems/item"), { userId: "owner", text: "Milk", completed: false }));
    await assertSucceeds(getDoc(doc(owner, "shoppingItems/item")));
    await assertFails(getDoc(doc(stranger, "shoppingItems/item")));
  });

  it("prevents collaborators from changing owner metadata", async () => {
    await seed("sharedLists/owner", {
      ownerId: "owner", ownerName: "Owner", allowEdits: true,
      permissions: { toggle: true, add: false, remove: false },
      items: [{ text: "Milk", completed: false }],
    });
    const collaborator = env.authenticatedContext("friend").firestore();
    await assertSucceeds(updateDoc(doc(collaborator, "sharedLists/owner"), { items: [{ text: "Milk", completed: true }] }));
    await assertFails(updateDoc(doc(collaborator, "sharedLists/owner"), { ownerName: "Friend" }));
  });

  it("enforces add and remove permissions", async () => {
    await seed("sharedLists/owner", {
      ownerId: "owner", ownerName: "Owner", allowEdits: true,
      permissions: { toggle: true, add: false, remove: false },
      items: [{ text: "Milk", completed: false }],
    });
    const collaborator = env.authenticatedContext("friend").firestore();
    await assertFails(updateDoc(doc(collaborator, "sharedLists/owner"), { items: [{ text: "Milk", completed: false }, { text: "Bread", completed: false }] }));
    await assertFails(updateDoc(doc(collaborator, "sharedLists/owner"), { items: [] }));
  });

  describe("anonymous (not signed in) visitors", () => {
    const anonymous = () =>
      env
        .authenticatedContext("anon-visitor", {
          firebase: { sign_in_provider: "anonymous" },
        })
        .firestore();
    const fullPerms = { toggle: true, add: true, remove: true };
    const twoItems = [
      { text: "Milk", completed: false },
      { text: "Bread", completed: false },
    ];

    it("may toggle and add when the owner opted in, but never remove", async () => {
      await seed("sharedLists/owner", {
        ownerId: "owner", ownerName: "Owner", allowEdits: true, allowAnonymousEdits: true,
        permissions: fullPerms, items: twoItems,
      });
      const anon = anonymous();
      await assertSucceeds(updateDoc(doc(anon, "sharedLists/owner"), {
        items: [{ text: "Milk", completed: true }, { text: "Bread", completed: false }],
      }));
      await assertSucceeds(updateDoc(doc(anon, "sharedLists/owner"), {
        items: [...twoItems, { text: "Eggs", completed: false }],
      }));
      // Shrinking the list is always rejected for anonymous writers, even
      // though signed-in collaborators hold `remove`.
      await assertFails(updateDoc(doc(anon, "sharedLists/owner"), {
        items: [{ text: "Milk", completed: false }],
      }));
    });

    it("cannot edit at all unless the owner opted in", async () => {
      await seed("sharedLists/owner", {
        ownerId: "owner", ownerName: "Owner", allowEdits: true, allowAnonymousEdits: false,
        permissions: fullPerms, items: twoItems,
      });
      await assertFails(updateDoc(doc(anonymous(), "sharedLists/owner"), {
        items: [{ text: "Milk", completed: true }, { text: "Bread", completed: false }],
      }));
      // Signed-in collaborators are unaffected by the anonymous flag.
      const friend = env.authenticatedContext("friend").firestore();
      await assertSucceeds(updateDoc(doc(friend, "sharedLists/owner"), {
        items: [{ text: "Milk", completed: true }, { text: "Bread", completed: false }],
      }));
    });

    it("cannot flip the anonymous flag or other owner fields", async () => {
      await seed("sharedLists/owner", {
        ownerId: "owner", ownerName: "Owner", allowEdits: true, allowAnonymousEdits: true,
        permissions: fullPerms, items: twoItems,
      });
      const anon = anonymous();
      await assertFails(updateDoc(doc(anon, "sharedLists/owner"), { allowAnonymousEdits: false }));
      await assertFails(updateDoc(doc(anon, "sharedLists/owner"), { permissions: { toggle: false, add: false, remove: false } }));
      const friend = env.authenticatedContext("friend").firestore();
      await assertFails(updateDoc(doc(friend, "sharedLists/owner"), { allowAnonymousEdits: false }));
    });

    it("cannot own data: no personal items, share codes, lists or settings", async () => {
      const anon = anonymous();
      await assertFails(setDoc(doc(anon, "shoppingItems/x"), { userId: "anon-visitor", text: "Milk", completed: false }));
      await assertFails(setDoc(doc(anon, "sharedLists/anon-visitor"), { ownerId: "anon-visitor", ownerName: "Anon", items: [] }));
      await assertFails(setDoc(doc(anon, "shareCodes/ABCDEFGH"), { ownerId: "anon-visitor", createdAt: new Date() }));
      await assertFails(setDoc(doc(anon, "userSettings/anon-visitor"), { interface: { emptyTips: false } }));
    });
  });

  it("lets the owner set allowAnonymousEdits", async () => {
    const owner = env.authenticatedContext("owner").firestore();
    await assertSucceeds(setDoc(doc(owner, "sharedLists/owner"), {
      ownerId: "owner", ownerName: "Owner", allowEdits: true, allowAnonymousEdits: true,
      permissions: { toggle: true, add: false, remove: false }, items: [],
    }));
    await assertSucceeds(updateDoc(doc(owner, "sharedLists/owner"), { allowAnonymousEdits: false }));
  });
});
