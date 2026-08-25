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
});
