package uk.co.cartlink.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uk.co.cartlink.app.data.SharedSyncLogic.ShareChange

class SharedSyncLogicTest {

    private fun personal(
        id: String,
        text: String,
        completed: Boolean = false,
        quantity: String? = null,
        category: String? = null,
    ) = ShoppingItem(
        id = id,
        text = text,
        completed = completed,
        userId = "owner",
        quantity = quantity,
        category = category,
    )

    private fun shared(
        text: String,
        completed: Boolean = false,
        quantity: String? = null,
        category: String? = null,
    ) = SharedItem(text, completed, quantity, category)

    private fun doc(
        items: List<SharedItem>,
        permissions: SharePermissions = SharePermissions(toggle = true, add = true, remove = true),
        allowEdits: Boolean = true,
    ) = SharedListDoc(
        ownerId = "owner",
        ownerName = "Owner",
        items = items,
        allowEdits = allowEdits,
        permissions = permissions,
    )

    // ------------------------------------------------------------- signatures

    @Test
    fun `signature is order independent`() {
        val a = listOf(shared("milk"), shared("eggs", completed = true))
        val b = listOf(shared("eggs", completed = true), shared("milk"))
        assertEquals(SharedSyncLogic.itemsSignature(a), SharedSyncLogic.itemsSignature(b))
    }

    @Test
    fun `signature changes when completion changes`() {
        val a = listOf(shared("milk", completed = false))
        val b = listOf(shared("milk", completed = true))
        assertTrue(SharedSyncLogic.itemsSignature(a) != SharedSyncLogic.itemsSignature(b))
    }

    @Test
    fun `key distinguishes quantity and category`() {
        assertTrue(
            SharedSyncLogic.sharedItemKey("milk", "2", null) !=
                SharedSyncLogic.sharedItemKey("milk", null, "2"),
        )
    }

    // ----------------------------------------------------------- sync-back ops

    @Test
    fun `toggle op emitted when shared completion differs`() {
        val ops = SharedSyncLogic.computeSyncBackOps(
            personalItems = listOf(personal("1", "milk", completed = false)),
            sharedItems = listOf(shared("milk", completed = true)),
            permissions = SharePermissions(toggle = true),
        )
        assertEquals(listOf(SharedSyncLogic.ToggleOp("1", true)), ops.toggles)
        assertTrue(ops.adds.isEmpty())
        assertTrue(ops.removeIds.isEmpty())
    }

    @Test
    fun `toggle op suppressed without permission`() {
        val ops = SharedSyncLogic.computeSyncBackOps(
            personalItems = listOf(personal("1", "milk", completed = false)),
            sharedItems = listOf(shared("milk", completed = true)),
            permissions = SharePermissions.NONE,
        )
        assertTrue(ops.isEmpty)
    }

    @Test
    fun `add op emitted for new shared item`() {
        val ops = SharedSyncLogic.computeSyncBackOps(
            personalItems = listOf(personal("1", "milk")),
            sharedItems = listOf(shared("milk"), shared("eggs", quantity = "12")),
            permissions = SharePermissions(add = true),
        )
        assertEquals(listOf(shared("eggs", quantity = "12")), ops.adds)
    }

    @Test
    fun `remove op emitted when personal item missing from shared`() {
        val ops = SharedSyncLogic.computeSyncBackOps(
            personalItems = listOf(personal("1", "milk"), personal("2", "eggs")),
            sharedItems = listOf(shared("milk")),
            permissions = SharePermissions(remove = true),
        )
        assertEquals(listOf("2"), ops.removeIds)
    }

    @Test
    fun `no ops when lists agree`() {
        val ops = SharedSyncLogic.computeSyncBackOps(
            personalItems = listOf(personal("1", "milk", completed = true)),
            sharedItems = listOf(shared("milk", completed = true)),
            permissions = SharePermissions(toggle = true, add = true, remove = true),
        )
        assertTrue(ops.isEmpty)
    }

    // ------------------------------------------------- collaborator changes

    @Test
    fun `collaborator toggle flips completion`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(listOf(shared("milk", completed = false))),
            shared("milk", completed = false),
            ShareChange.TOGGLE,
        )
        assertEquals(listOf(shared("milk", completed = true)), result)
    }

    @Test
    fun `collaborator toggle rejected without permission`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(
                listOf(shared("milk")),
                permissions = SharePermissions(add = true),
            ),
            shared("milk"),
            ShareChange.TOGGLE,
        )
        assertNull(result)
    }

    @Test
    fun `collaborator change rejected when allowEdits is off`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(listOf(shared("milk")), allowEdits = false),
            shared("milk"),
            ShareChange.TOGGLE,
        )
        assertNull(result)
    }

    @Test
    fun `collaborator add appends new item`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(listOf(shared("milk"))),
            shared("eggs"),
            ShareChange.ADD,
        )
        assertEquals(listOf(shared("milk"), shared("eggs")), result)
    }

    @Test
    fun `collaborator add is a no-op for duplicates`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(listOf(shared("milk"))),
            shared("milk"),
            ShareChange.ADD,
        )
        assertNull(result)
    }

    @Test
    fun `collaborator remove drops matching item only`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(listOf(shared("milk"), shared("eggs"))),
            shared("eggs"),
            ShareChange.REMOVE,
        )
        assertEquals(listOf(shared("milk")), result)
    }

    @Test
    fun `collaborator remove is a no-op for unknown item`() {
        val result = SharedSyncLogic.applyCollaboratorChange(
            doc(listOf(shared("milk"))),
            shared("bread"),
            ShareChange.REMOVE,
        )
        assertNull(result)
    }

    // --------------------------------------------------------- normalization

    @Test
    fun `permissions normalize unknown values to false`() {
        val perms = SharePermissions.fromRaw(mapOf("toggle" to true, "add" to "yes"))
        assertEquals(SharePermissions(toggle = true), perms)
    }

    @Test
    fun `shared items normalizer drops malformed entries`() {
        val items = normalizeSharedItems(
            listOf(
                mapOf("text" to "milk", "completed" to true),
                mapOf("completed" to true), // no text -> dropped
                "garbage",
                mapOf("text" to "  ", "completed" to false), // blank -> dropped
            ),
        )
        assertEquals(listOf(SharedItem("milk", completed = true)), items)
    }

    @Test
    fun `shared list doc requires ownerId`() {
        assertNull(normalizeSharedListDoc(mapOf("ownerName" to "X", "items" to emptyList<Any>())))
    }
}
