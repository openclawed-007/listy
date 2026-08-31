package uk.co.cartlink.app.data

/**
 * Pure logic for keeping the owner's private items and the public shared list
 * document in agreement. Ported from the web app (ShoppingList.tsx) so the two
 * clients behave identically. Everything here is side-effect free and unit
 * tested on the JVM.
 */
object SharedSyncLogic {

    /** Stable identity for matching a personal item to its shared counterpart. */
    fun sharedItemKey(text: String, quantity: String?, category: String?): String =
        listOf(text, quantity ?: "", category ?: "").joinToString("\u0000")

    fun sharedItemKey(item: SharedItem): String =
        sharedItemKey(item.text, item.quantity, item.category)

    fun sharedItemKey(item: ShoppingItem): String =
        sharedItemKey(item.text, item.quantity, item.category)

    /**
     * A normalized, order-independent signature of an items array
     * (text + meta + completed). Used to detect whether the owner's local list
     * and the shared doc already agree so auto-sync doesn't clobber an inbound
     * collaborator change with stale local state.
     */
    fun itemsSignature(items: List<SharedItem>): String =
        items
            .map { "${sharedItemKey(it)}\u0001${if (it.completed) "1" else "0"}" }
            .sorted()
            .joinToString("\u0002")

    fun toSharedItem(item: ShoppingItem): SharedItem =
        SharedItem(
            text = item.text,
            completed = item.completed,
            quantity = item.quantity,
            category = item.category,
        )

    fun toSharedItems(personalItems: List<ShoppingItem>): List<SharedItem> =
        personalItems.map(::toSharedItem)

    /** A completion-state fix to apply to a private item. */
    data class ToggleOp(val itemId: String, val completed: Boolean)

    /** What the owner must apply locally to catch up with collaborator edits. */
    data class SyncBackOps(
        val toggles: List<ToggleOp>,
        val adds: List<SharedItem>,
        val removeIds: List<String>,
    ) {
        val isEmpty: Boolean
            get() = toggles.isEmpty() && adds.isEmpty() && removeIds.isEmpty()
    }

    /**
     * Reconcile collaborator changes on the shared doc back into the owner's
     * personal items, gated by the granted permissions:
     *  - toggle: same item, different completion state
     *  - add: shared item with no matching personal item yet
     *  - remove: personal item no longer present in the shared list
     */
    fun computeSyncBackOps(
        personalItems: List<ShoppingItem>,
        sharedItems: List<SharedItem>,
        permissions: SharePermissions,
    ): SyncBackOps {
        val sharedByKey = sharedItems.associateBy(::sharedItemKey)
        val personalKeys = personalItems.map(::sharedItemKey).toSet()

        val toggles = if (permissions.toggle) {
            personalItems.mapNotNull { item ->
                val shared = sharedByKey[sharedItemKey(item)] ?: return@mapNotNull null
                if (shared.completed == item.completed) return@mapNotNull null
                ToggleOp(item.id, shared.completed)
            }
        } else emptyList()

        val adds = if (permissions.add) {
            sharedItems.filter { sharedItemKey(it) !in personalKeys }
        } else emptyList()

        val removeIds = if (permissions.remove) {
            personalItems
                .filter { sharedItemKey(it) !in sharedByKey.keys }
                .map { it.id }
        } else emptyList()

        return SyncBackOps(toggles, adds, removeIds)
    }

    enum class ShareChange { TOGGLE, ADD, REMOVE }

    /**
     * Apply a collaborator's change to the owner's shared items array,
     * honoring the owner's current permissions. Returns null when the change
     * is not permitted or is a no-op (mirrors `propagateToSharedOwner`).
     *
     * For TOGGLE the target's `completed` is the value *before* the flip.
     */
    fun applyCollaboratorChange(
        doc: SharedListDoc,
        target: SharedItem,
        change: ShareChange,
    ): List<SharedItem>? {
        val allowEdits = doc.allowEdits && doc.permissions.hasAny
        val permitted = when (change) {
            ShareChange.TOGGLE -> doc.permissions.toggle
            ShareChange.ADD -> doc.permissions.add
            ShareChange.REMOVE -> doc.permissions.remove
        }
        if (!allowEdits || !permitted) return null

        val key = sharedItemKey(target)
        val matchIndex = doc.items.indexOfFirst { sharedItemKey(it) == key }

        return when (change) {
            ShareChange.ADD -> {
                if (matchIndex != -1) return null
                if (doc.items.size >= MAX_SHARED_ITEMS) return null
                doc.items + target
            }

            ShareChange.REMOVE -> {
                if (matchIndex == -1) return null
                doc.items.filterIndexed { index, _ -> index != matchIndex }
            }

            ShareChange.TOGGLE -> {
                if (matchIndex == -1) return null
                doc.items.mapIndexed { index, item ->
                    if (index == matchIndex) item.copy(completed = !target.completed) else item
                }
            }
        }
    }
}
