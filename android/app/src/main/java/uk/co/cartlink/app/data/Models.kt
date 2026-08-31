package uk.co.cartlink.app.data

const val PERSONAL_LIST_ID = "personal"
const val DEFAULT_LIST_NAME = "My List"
const val DEFAULT_CATEGORY = "General"
const val MAX_ITEM_TEXT_LENGTH = 500
const val MAX_QUANTITY_LENGTH = 40
const val MAX_CATEGORY_LENGTH = 80
const val MAX_SHARED_ITEMS = 500
const val SHARED_LIST_ID_PREFIX = "shared:"

/** A private item in the `shoppingItems` collection. */
data class ShoppingItem(
    val id: String,
    val text: String,
    val completed: Boolean,
    val userId: String,
    val quantity: String? = null,
    val category: String? = null,
    val listId: String? = null,
    val listName: String? = null,
    val sharedFromUserId: String? = null,
    val createdAtMillis: Long? = null,
) {
    val effectiveListId: String get() = listId ?: PERSONAL_LIST_ID
    val effectiveListName: String get() = listName ?: DEFAULT_LIST_NAME
    val effectiveCategory: String get() = category ?: DEFAULT_CATEGORY
}

/** One entry of the `items` array on a `sharedLists/{ownerId}` document. */
data class SharedItem(
    val text: String,
    val completed: Boolean,
    val quantity: String? = null,
    val category: String? = null,
)

/** Granular collaborator permissions on a shared list. */
data class SharePermissions(
    val toggle: Boolean = false,
    val add: Boolean = false,
    val remove: Boolean = false,
) {
    val hasAny: Boolean get() = toggle || add || remove

    companion object {
        val NONE = SharePermissions()

        fun fromRaw(value: Any?): SharePermissions {
            val map = value as? Map<*, *> ?: return NONE
            return SharePermissions(
                toggle = map["toggle"] == true,
                add = map["add"] == true,
                remove = map["remove"] == true,
            )
        }
    }
}

/** A normalized `sharedLists/{ownerId}` document. */
data class SharedListDoc(
    val ownerId: String,
    val ownerName: String,
    val items: List<SharedItem>,
    val allowEdits: Boolean = false,
    val allowAnonymousEdits: Boolean = false,
    val permissions: SharePermissions = SharePermissions.NONE,
)

private fun normalizeOptionalString(value: Any?, maxLength: Int): String? {
    val text = (value as? String)?.trim() ?: return null
    if (text.isEmpty()) return null
    return text.take(maxLength)
}

fun normalizeShoppingItem(id: String, data: Map<String, Any?>?): ShoppingItem? {
    if (data == null) return null
    val text = normalizeOptionalString(data["text"], MAX_ITEM_TEXT_LENGTH) ?: return null
    val userId = normalizeOptionalString(data["userId"], 128) ?: return null
    val completed = data["completed"] as? Boolean ?: return null

    val createdAt = (data["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.time

    return ShoppingItem(
        id = id,
        text = text,
        completed = completed,
        userId = userId,
        quantity = normalizeOptionalString(data["quantity"], MAX_QUANTITY_LENGTH),
        category = normalizeOptionalString(data["category"], MAX_CATEGORY_LENGTH),
        listId = normalizeOptionalString(data["listId"], 200),
        listName = normalizeOptionalString(data["listName"], 120),
        sharedFromUserId = normalizeOptionalString(data["sharedFromUserId"], 128),
        createdAtMillis = createdAt,
    )
}

fun normalizeSharedItems(value: Any?): List<SharedItem> {
    val list = value as? List<*> ?: return emptyList()
    return list.mapNotNull { entry ->
        val map = entry as? Map<*, *> ?: return@mapNotNull null
        val text = normalizeOptionalString(map["text"], MAX_ITEM_TEXT_LENGTH)
            ?: return@mapNotNull null
        SharedItem(
            text = text,
            completed = map["completed"] == true,
            quantity = normalizeOptionalString(map["quantity"], MAX_QUANTITY_LENGTH),
            category = normalizeOptionalString(map["category"], MAX_CATEGORY_LENGTH),
        )
    }
}

fun normalizeSharedListDoc(data: Map<String, Any?>?): SharedListDoc? {
    if (data == null) return null
    val ownerId = normalizeOptionalString(data["ownerId"], 128) ?: return null
    val ownerName = normalizeOptionalString(data["ownerName"], 120) ?: "Shared user"

    return SharedListDoc(
        ownerId = ownerId,
        ownerName = ownerName,
        items = normalizeSharedItems(data["items"]),
        allowEdits = data["allowEdits"] == true,
        allowAnonymousEdits = data["allowAnonymousEdits"] == true,
        permissions = SharePermissions.fromRaw(data["permissions"]),
    )
}
