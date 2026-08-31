package uk.co.cartlink.app.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

private const val ITEMS_COLLECTION = "shoppingItems"
private const val SHARED_COLLECTION = "sharedLists"
private const val MAX_BATCH_WRITES = 450

/**
 * All Firestore access for the app. Mirrors the web client's data contract:
 * private items live in `shoppingItems`, public snapshots in
 * `sharedLists/{ownerId}`. The Android SDK gives us offline persistence and
 * queued writes out of the box.
 */
class ShoppingRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {

    /** Real-time stream of every item owned by [uid], newest first. */
    fun observeItems(uid: String): Flow<Result<List<ShoppingItem>>> = callbackFlow {
        val registration = db.collection(ITEMS_COLLECTION)
            .whereEqualTo("userId", uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(Result.failure(error))
                    return@addSnapshotListener
                }
                if (snapshot == null) return@addSnapshotListener
                val items = snapshot.documents
                    .mapNotNull { normalizeShoppingItem(it.id, it.data) }
                    .sortedByDescending { it.createdAtMillis ?: 0L }
                trySend(Result.success(items))
            }
        awaitClose { registration.remove() }
    }

    /** Real-time stream of a shared list document; null when it doesn't exist. */
    fun observeSharedList(ownerId: String): Flow<Result<SharedListDoc?>> = callbackFlow {
        val registration = db.collection(SHARED_COLLECTION).document(ownerId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(Result.failure(error))
                    return@addSnapshotListener
                }
                if (snapshot == null) return@addSnapshotListener
                trySend(Result.success(normalizeSharedListDoc(snapshot.data)))
            }
        awaitClose { registration.remove() }
    }

    suspend fun getSharedList(ownerId: String): SharedListDoc? {
        val snapshot = db.collection(SHARED_COLLECTION).document(ownerId).get().await()
        return normalizeSharedListDoc(snapshot.data)
    }

    suspend fun addItem(
        uid: String,
        text: String,
        quantity: String?,
        category: String?,
        listId: String,
        listName: String,
        sharedFromUserId: String?,
    ) {
        val data = buildMap<String, Any> {
            put("text", text)
            put("completed", false)
            put("userId", uid)
            quantity?.let { put("quantity", it) }
            category?.let { put("category", it) }
            put("listId", listId)
            put("listName", listName)
            sharedFromUserId?.let { put("sharedFromUserId", it) }
            put("createdAt", FieldValue.serverTimestamp())
        }
        db.collection(ITEMS_COLLECTION).add(data).await()
    }

    suspend fun setCompleted(itemId: String, completed: Boolean) {
        db.collection(ITEMS_COLLECTION).document(itemId)
            .update("completed", completed)
            .await()
    }

    suspend fun updateDetails(itemId: String, text: String, quantity: String?, category: String?) {
        db.collection(ITEMS_COLLECTION).document(itemId)
            .update(
                mapOf(
                    "text" to text,
                    "quantity" to (quantity ?: FieldValue.delete()),
                    "category" to (category ?: FieldValue.delete()),
                ),
            )
            .await()
    }

    suspend fun deleteItem(itemId: String) {
        db.collection(ITEMS_COLLECTION).document(itemId).delete().await()
    }

    /** Restore a deleted item under its original id (undo). */
    suspend fun restoreItem(item: ShoppingItem) {
        val data = buildMap<String, Any> {
            put("text", item.text)
            put("completed", item.completed)
            put("userId", item.userId)
            item.quantity?.let { put("quantity", it) }
            item.category?.let { put("category", it) }
            put("listId", item.effectiveListId)
            put("listName", item.effectiveListName)
            item.sharedFromUserId?.let { put("sharedFromUserId", it) }
            put(
                "createdAt",
                item.createdAtMillis
                    ?.let { com.google.firebase.Timestamp(java.util.Date(it)) }
                    ?: FieldValue.serverTimestamp(),
            )
        }
        db.collection(ITEMS_COLLECTION).document(item.id).set(data).await()
    }

    suspend fun deleteItems(itemIds: List<String>) {
        itemIds.chunked(MAX_BATCH_WRITES).forEach { chunk ->
            val batch = db.batch()
            chunk.forEach { batch.delete(db.collection(ITEMS_COLLECTION).document(it)) }
            batch.commit().await()
        }
    }

    // ---------------------------------------------------------------- sharing

    suspend fun publishSharedList(
        uid: String,
        ownerName: String,
        allowEdits: Boolean,
        allowAnonymousEdits: Boolean,
        permissions: SharePermissions,
        items: List<SharedItem>,
    ) {
        db.collection(SHARED_COLLECTION).document(uid)
            .set(
                mapOf(
                    "ownerId" to uid,
                    "ownerName" to ownerName,
                    "allowEdits" to allowEdits,
                    "allowAnonymousEdits" to allowAnonymousEdits,
                    "permissions" to permissions.toMap(),
                    "items" to items.take(MAX_SHARED_ITEMS).map { it.toMap() },
                    "updatedAt" to FieldValue.serverTimestamp(),
                ),
            )
            .await()
    }

    suspend fun updateShareSettings(
        uid: String,
        allowEdits: Boolean,
        allowAnonymousEdits: Boolean,
        permissions: SharePermissions,
    ) {
        db.collection(SHARED_COLLECTION).document(uid)
            .update(
                mapOf(
                    "allowEdits" to allowEdits,
                    "allowAnonymousEdits" to allowAnonymousEdits,
                    "permissions" to permissions.toMap(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                ),
            )
            .await()
    }

    suspend fun stopSharing(uid: String) {
        db.collection(SHARED_COLLECTION).document(uid).delete().await()
    }

    // ------------------------------------------------------------- importing

    /**
     * Import a shared list into the user's own items as a tab
     * (`listId = shared:{ownerId}`), replacing any previous import of it.
     */
    suspend fun importSharedList(uid: String, shared: SharedListDoc) {
        val importedListId = "$SHARED_LIST_ID_PREFIX${shared.ownerId}"

        val existing = db.collection(ITEMS_COLLECTION)
            .whereEqualTo("userId", uid)
            .whereEqualTo("listId", importedListId)
            .get()
            .await()

        val operations = mutableListOf<(com.google.firebase.firestore.WriteBatch) -> Unit>()
        existing.documents.forEach { docSnapshot ->
            operations.add { batch -> batch.delete(docSnapshot.reference) }
        }
        shared.items.forEach { item ->
            val ref = db.collection(ITEMS_COLLECTION).document()
            operations.add { batch ->
                val data = buildMap<String, Any> {
                    put("text", item.text)
                    put("completed", item.completed)
                    put("userId", uid)
                    item.quantity?.let { put("quantity", it) }
                    item.category?.let { put("category", it) }
                    put("listId", importedListId)
                    put("listName", shared.ownerName)
                    put("sharedFromUserId", shared.ownerId)
                    put("createdAt", FieldValue.serverTimestamp())
                }
                batch.set(ref, data)
            }
        }

        operations.chunked(MAX_BATCH_WRITES).forEach { chunk ->
            val batch = db.batch()
            chunk.forEach { it(batch) }
            batch.commit().await()
        }
    }

    /**
     * Propagate a change made on an imported (shared) item back to the owner's
     * shared list document. Honors the owner's current permissions; silently
     * no-ops when not allowed. Mirrors the web `propagateToSharedOwner`.
     */
    suspend fun propagateToSharedOwner(
        item: ShoppingItem,
        change: SharedSyncLogic.ShareChange,
    ) {
        val ownerId = item.sharedFromUserId ?: return
        val doc = getSharedList(ownerId) ?: return

        val nextItems = SharedSyncLogic.applyCollaboratorChange(
            doc,
            SharedSyncLogic.toSharedItem(item),
            change,
        ) ?: return

        db.collection(SHARED_COLLECTION).document(ownerId)
            .update(
                mapOf(
                    "items" to nextItems.map { it.toMap() },
                    "updatedAt" to FieldValue.serverTimestamp(),
                ),
            )
            .await()
    }
}

private fun SharePermissions.toMap(): Map<String, Boolean> =
    mapOf("toggle" to toggle, "add" to add, "remove" to remove)

private fun SharedItem.toMap(): Map<String, Any> = buildMap {
    put("text", text)
    put("completed", completed)
    quantity?.let { put("quantity", it) }
    category?.let { put("category", it) }
}
