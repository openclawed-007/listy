package uk.co.cartlink.app.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.co.cartlink.app.data.DEFAULT_LIST_NAME
import uk.co.cartlink.app.data.MAX_CATEGORY_LENGTH
import uk.co.cartlink.app.data.MAX_ITEM_TEXT_LENGTH
import uk.co.cartlink.app.data.MAX_QUANTITY_LENGTH
import uk.co.cartlink.app.data.PERSONAL_LIST_ID
import uk.co.cartlink.app.data.SHARED_LIST_ID_PREFIX
import uk.co.cartlink.app.data.SharePermissions
import uk.co.cartlink.app.data.SharedSyncLogic
import uk.co.cartlink.app.data.SharedSyncLogic.ShareChange
import uk.co.cartlink.app.data.ShoppingItem
import uk.co.cartlink.app.data.ShoppingRepository

private const val TAG = "ListViewModel"
private const val AUTO_SYNC_DEBOUNCE_MS = 350L
private const val UNDO_WINDOW_MS = 6_000L

data class ListTab(val id: String, val name: String)

data class ListUiState(
    val items: List<ShoppingItem> = emptyList(),
    val itemsLoaded: Boolean = false,
    val activeListId: String = PERSONAL_LIST_ID,
    val search: String = "",
    // Sharing (as owner)
    val isSharing: Boolean = false,
    val permissions: SharePermissions = SharePermissions.NONE,
    val allowAnonymousEdits: Boolean = false,
    val shareBusy: Boolean = false,
    // Transient feedback
    val importStatus: String? = null,
    val importing: Boolean = false,
    val actionError: String? = null,
    val pendingDelete: ShoppingItem? = null,
) {
    val personalItems: List<ShoppingItem>
        get() = items.filter { it.effectiveListId == PERSONAL_LIST_ID }

    val listTabs: List<ListTab>
        get() {
            val sharedTabs = LinkedHashMap<String, String>()
            items.forEach { item ->
                val listId = item.effectiveListId
                if (listId != PERSONAL_LIST_ID) sharedTabs[listId] = item.effectiveListName
            }
            return listOf(ListTab(PERSONAL_LIST_ID, DEFAULT_LIST_NAME)) +
                sharedTabs.map { (id, name) -> ListTab(id, name) }
        }

    val activeTabName: String
        get() = listTabs.firstOrNull { it.id == activeListId }?.name ?: DEFAULT_LIST_NAME

    val currentListItems: List<ShoppingItem>
        get() = items.filter { it.effectiveListId == activeListId }

    val filteredItems: List<ShoppingItem>
        get() {
            val query = search.trim().lowercase()
            if (query.isEmpty()) return currentListItems
            return currentListItems.filter { item ->
                listOfNotNull(item.text, item.quantity, item.category)
                    .joinToString(" ")
                    .lowercase()
                    .contains(query)
            }
        }

    val allowEdits: Boolean get() = permissions.hasAny
}

class ListViewModel(
    private val repository: ShoppingRepository = ShoppingRepository(),
) : ViewModel() {

    private val _state = MutableStateFlow(ListUiState())
    val state: StateFlow<ListUiState> = _state.asStateFlow()

    private var uid: String? = null
    private var ownerName: String = "Shared user"

    private var itemsJob: Job? = null
    private var syncBackJob: Job? = null
    private var autoPublishJob: Job? = null
    private var undoJob: Job? = null
    private var importStatusJob: Job? = null

    // Echo guards for the owner <-> shared-doc sync, ported from the web app.
    private var sharedItemsSignature: String? = null
    private var pendingInboundSharedSignature: String? = null
    private var handledImportShareId: String? = null

    /** Bind the view model to the signed-in user. Call again on user change. */
    fun start(userId: String, displayName: String?, email: String?) {
        if (uid == userId) return
        uid = userId
        ownerName = displayName?.trim()?.takeIf { it.isNotEmpty() }
            ?: email?.substringBefore("@")
            ?: "Shared user"

        _state.value = ListUiState()
        sharedItemsSignature = null
        pendingInboundSharedSignature = null
        handledImportShareId = null

        itemsJob?.cancel()
        itemsJob = viewModelScope.launch {
            repository.observeItems(userId).collect { result ->
                result.fold(
                    onSuccess = { items ->
                        _state.update { current ->
                            val next = current.copy(items = items, itemsLoaded = true)
                            // Reset the active tab if its list disappeared.
                            if (next.listTabs.none { it.id == next.activeListId }) {
                                next.copy(activeListId = PERSONAL_LIST_ID)
                            } else next
                        }
                        scheduleAutoPublish()
                    },
                    onFailure = { error ->
                        Log.e(TAG, "Items snapshot error", error)
                        _state.update {
                            it.copy(
                                actionError = "We could not sync your list. " +
                                    "Check your connection and try again.",
                            )
                        }
                    },
                )
            }
        }

        viewModelScope.launch { loadShareState(userId) }
    }

    fun stop() {
        uid = null
        itemsJob?.cancel()
        syncBackJob?.cancel()
        autoPublishJob?.cancel()
        _state.value = ListUiState()
    }

    private suspend fun loadShareState(userId: String) {
        try {
            val doc = repository.getSharedList(userId) ?: return
            _state.update {
                it.copy(
                    isSharing = true,
                    permissions = doc.permissions,
                    allowAnonymousEdits = doc.allowAnonymousEdits,
                )
            }
            restartSyncBackListener()
        } catch (e: Exception) {
            Log.e(TAG, "Load share state error", e)
        }
    }

    // ------------------------------------------------------------ UI actions

    fun setActiveList(listId: String) = _state.update { it.copy(activeListId = listId) }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun dismissError() = _state.update { it.copy(actionError = null) }

    fun dismissImportStatus() = _state.update { it.copy(importStatus = null) }

    fun addItem(text: String, quantity: String, category: String) {
        val userId = uid ?: return
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        if (trimmed.length > MAX_ITEM_TEXT_LENGTH) {
            _state.update {
                it.copy(actionError = "Keep items to $MAX_ITEM_TEXT_LENGTH characters or fewer.")
            }
            return
        }
        val normalizedQuantity =
            quantity.trim().take(MAX_QUANTITY_LENGTH).takeIf { it.isNotEmpty() }
        val normalizedCategory =
            category.trim().take(MAX_CATEGORY_LENGTH).takeIf { it.isNotEmpty() }

        val current = _state.value
        val activeListId = current.activeListId
        val activeTabName = current.activeTabName
        val sharedFromUserId = activeListId
            .takeIf { it.startsWith(SHARED_LIST_ID_PREFIX) }
            ?.removePrefix(SHARED_LIST_ID_PREFIX)

        viewModelScope.launch {
            try {
                _state.update { it.copy(actionError = null) }
                repository.addItem(
                    uid = userId,
                    text = trimmed,
                    quantity = normalizedQuantity,
                    category = normalizedCategory,
                    listId = activeListId,
                    listName = activeTabName,
                    sharedFromUserId = sharedFromUserId,
                )
                if (sharedFromUserId != null) {
                    propagateQuietly(
                        ShoppingItem(
                            id = "",
                            text = trimmed,
                            completed = false,
                            userId = userId,
                            quantity = normalizedQuantity,
                            category = normalizedCategory,
                            sharedFromUserId = sharedFromUserId,
                        ),
                        ShareChange.ADD,
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Add item error", e)
                _state.update {
                    it.copy(actionError = "Unable to add that item right now. Please try again.")
                }
            }
        }
    }

    fun toggleComplete(item: ShoppingItem) {
        viewModelScope.launch {
            try {
                _state.update { it.copy(actionError = null) }
                repository.setCompleted(item.id, !item.completed)
                if (item.sharedFromUserId != null) {
                    propagateQuietly(item, ShareChange.TOGGLE)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Toggle item error", e)
                _state.update {
                    it.copy(actionError = "Unable to update this item right now. Please try again.")
                }
            }
        }
    }

    fun updateItemDetails(itemId: String, text: String, quantity: String, category: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        if (trimmed.length > MAX_ITEM_TEXT_LENGTH) {
            _state.update {
                it.copy(actionError = "Keep items to $MAX_ITEM_TEXT_LENGTH characters or fewer.")
            }
            return
        }
        viewModelScope.launch {
            try {
                _state.update { it.copy(actionError = null) }
                repository.updateDetails(
                    itemId = itemId,
                    text = trimmed,
                    quantity = quantity.trim().take(MAX_QUANTITY_LENGTH).takeIf { it.isNotEmpty() },
                    category = category.trim().take(MAX_CATEGORY_LENGTH).takeIf { it.isNotEmpty() },
                )
            } catch (e: Exception) {
                Log.e(TAG, "Update item details error", e)
                _state.update {
                    it.copy(actionError = "Unable to save your edit right now. Please try again.")
                }
            }
        }
    }

    fun deleteItem(item: ShoppingItem) {
        viewModelScope.launch {
            undoJob?.cancel()
            try {
                _state.update { it.copy(actionError = null) }
                repository.deleteItem(item.id)
                if (item.sharedFromUserId != null) {
                    propagateQuietly(item, ShareChange.REMOVE)
                }
                _state.update { it.copy(pendingDelete = item) }
                undoJob = viewModelScope.launch {
                    delay(UNDO_WINDOW_MS)
                    _state.update { current ->
                        if (current.pendingDelete?.id == item.id) {
                            current.copy(pendingDelete = null)
                        } else current
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Delete item error", e)
                _state.update {
                    it.copy(actionError = "Unable to remove this item right now. Please try again.")
                }
            }
        }
    }

    fun undoDelete() {
        val item = _state.value.pendingDelete ?: return
        undoJob?.cancel()
        _state.update { it.copy(pendingDelete = null) }
        viewModelScope.launch {
            try {
                repository.restoreItem(item)
            } catch (e: Exception) {
                Log.e(TAG, "Undo delete error", e)
                _state.update {
                    it.copy(actionError = "Unable to restore that item right now. Please try again.")
                }
            }
        }
    }

    fun clearCompleted() {
        val current = _state.value
        val done = current.items.filter {
            it.completed && it.effectiveListId == current.activeListId
        }
        if (done.isEmpty()) return
        viewModelScope.launch {
            try {
                _state.update { it.copy(actionError = null) }
                repository.deleteItems(done.map { it.id })
                done.filter { it.sharedFromUserId != null }.forEach {
                    propagateQuietly(it, ShareChange.REMOVE)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Clear completed error", e)
                _state.update {
                    it.copy(
                        actionError = "Unable to clear completed items right now. Please try again.",
                    )
                }
            }
        }
    }

    fun removeActiveSharedList() {
        val current = _state.value
        if (current.activeListId == PERSONAL_LIST_ID) return
        val sharedItems = current.currentListItems
        viewModelScope.launch {
            try {
                _state.update { it.copy(actionError = null) }
                repository.deleteItems(sharedItems.map { it.id })
                _state.update {
                    it.copy(activeListId = PERSONAL_LIST_ID, importStatus = null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Remove shared list error", e)
                _state.update {
                    it.copy(
                        actionError = "Unable to remove that shared list right now. Please try again.",
                    )
                }
            }
        }
    }

    // --------------------------------------------------------------- sharing

    fun startSharing() {
        val userId = uid ?: return
        val current = _state.value
        if (current.shareBusy) return
        _state.update { it.copy(shareBusy = true, actionError = null) }

        viewModelScope.launch {
            try {
                val payload = SharedSyncLogic.toSharedItems(_state.value.personalItems)
                sharedItemsSignature = SharedSyncLogic.itemsSignature(payload)
                repository.publishSharedList(
                    uid = userId,
                    ownerName = ownerName,
                    allowEdits = _state.value.allowEdits,
                    allowAnonymousEdits = _state.value.allowAnonymousEdits,
                    permissions = _state.value.permissions,
                    items = payload,
                )
                _state.update { it.copy(isSharing = true, shareBusy = false) }
                restartSyncBackListener()
            } catch (e: Exception) {
                Log.e(TAG, "Start sharing error", e)
                _state.update {
                    it.copy(
                        shareBusy = false,
                        actionError = "Unable to start sharing right now. Please try again.",
                    )
                }
            }
        }
    }

    fun stopSharing() {
        val userId = uid ?: return
        if (_state.value.shareBusy) return
        _state.update { it.copy(shareBusy = true, actionError = null) }

        viewModelScope.launch {
            try {
                repository.stopSharing(userId)
                sharedItemsSignature = null
                pendingInboundSharedSignature = null
                _state.update {
                    it.copy(
                        isSharing = false,
                        shareBusy = false,
                        permissions = SharePermissions.NONE,
                        allowAnonymousEdits = false,
                    )
                }
                restartSyncBackListener()
            } catch (e: Exception) {
                Log.e(TAG, "Stop sharing error", e)
                _state.update {
                    it.copy(
                        shareBusy = false,
                        actionError = "Unable to stop sharing right now. Please try again.",
                    )
                }
            }
        }
    }

    fun togglePermission(key: String, nextValue: Boolean) {
        val userId = uid ?: return
        val previous = _state.value.permissions
        val previousAnon = _state.value.allowAnonymousEdits

        val nextPermissions = when (key) {
            "toggle" -> previous.copy(toggle = nextValue)
            "add" -> previous.copy(add = nextValue)
            "remove" -> previous.copy(remove = nextValue)
            else -> previous
        }
        // If no permission is granted at all, anonymous editing is meaningless.
        val nextAnon = if (nextPermissions.hasAny) previousAnon else false
        _state.update { it.copy(permissions = nextPermissions, allowAnonymousEdits = nextAnon) }

        if (!_state.value.isSharing) return
        viewModelScope.launch {
            try {
                repository.updateShareSettings(
                    uid = userId,
                    allowEdits = nextPermissions.hasAny,
                    allowAnonymousEdits = nextAnon,
                    permissions = nextPermissions,
                )
                restartSyncBackListener()
            } catch (e: Exception) {
                Log.e(TAG, "Toggle permission error", e)
                _state.update {
                    it.copy(
                        permissions = previous,
                        allowAnonymousEdits = previousAnon,
                        actionError = "Unable to update sharing permissions right now. Please try again.",
                    )
                }
            }
        }
    }

    fun toggleAnonymousEdits(nextValue: Boolean) {
        val userId = uid ?: return
        val previous = _state.value.allowAnonymousEdits
        _state.update { it.copy(allowAnonymousEdits = nextValue) }

        if (!_state.value.isSharing) return
        viewModelScope.launch {
            try {
                repository.updateShareSettings(
                    uid = userId,
                    allowEdits = _state.value.allowEdits,
                    allowAnonymousEdits = nextValue,
                    permissions = _state.value.permissions,
                )
            } catch (e: Exception) {
                Log.e(TAG, "Toggle anonymous edits error", e)
                _state.update {
                    it.copy(
                        allowAnonymousEdits = previous,
                        actionError = "Unable to update sharing permissions right now. Please try again.",
                    )
                }
            }
        }
    }

    // ------------------------------------------------------------- importing

    /** Import a shared list opened via deep link (/share/{id} or /import/{id}). */
    fun importSharedList(shareId: String) {
        val userId = uid ?: return
        if (_state.value.importing || handledImportShareId == shareId) return
        handledImportShareId = shareId
        _state.update { it.copy(importing = true, importStatus = null, actionError = null) }

        viewModelScope.launch {
            try {
                val shared = repository.getSharedList(shareId)
                if (shared == null) {
                    _state.update {
                        it.copy(
                            importing = false,
                            actionError = "That shared list is no longer available.",
                        )
                    }
                    return@launch
                }
                if (shared.ownerId == userId) {
                    _state.update {
                        it.copy(importing = false, actionError = "This is your own share code.")
                    }
                    return@launch
                }

                repository.importSharedList(userId, shared)
                setImportStatus("${shared.ownerName}'s list was added to your tabs.")
                _state.update {
                    it.copy(
                        importing = false,
                        activeListId = "$SHARED_LIST_ID_PREFIX${shared.ownerId}",
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Import shared list error", e)
                _state.update {
                    it.copy(
                        importing = false,
                        actionError = "Unable to import that shared list right now. Please try again.",
                    )
                }
            }
        }
    }

    private fun setImportStatus(message: String) {
        importStatusJob?.cancel()
        _state.update { it.copy(importStatus = message) }
        importStatusJob = viewModelScope.launch {
            delay(5_000)
            _state.update { it.copy(importStatus = null) }
        }
    }

    // -------------------------------------------------- owner <-> shared sync

    /**
     * Debounced auto-publish of the owner's personal items to the shared doc,
     * with the same echo guards as the web app so an inbound collaborator
     * change is never overwritten by stale local state.
     */
    private fun scheduleAutoPublish() {
        val userId = uid ?: return
        val current = _state.value
        if (!current.isSharing || !current.itemsLoaded) return

        val payload = SharedSyncLogic.toSharedItems(current.personalItems)
        val localSignature = SharedSyncLogic.itemsSignature(payload)

        if (current.allowEdits) {
            val pendingInbound = pendingInboundSharedSignature
            if (pendingInbound != null) {
                if (localSignature == pendingInbound) {
                    pendingInboundSharedSignature = null
                    sharedItemsSignature = localSignature
                }
                return
            }
            if (sharedItemsSignature == localSignature) return
        }

        autoPublishJob?.cancel()
        autoPublishJob = viewModelScope.launch {
            delay(AUTO_SYNC_DEBOUNCE_MS)
            if (pendingInboundSharedSignature != null) return@launch
            sharedItemsSignature = localSignature
            try {
                repository.publishSharedList(
                    uid = userId,
                    ownerName = ownerName,
                    allowEdits = _state.value.allowEdits,
                    allowAnonymousEdits = _state.value.allowAnonymousEdits,
                    permissions = _state.value.permissions,
                    items = payload,
                )
            } catch (e: Exception) {
                Log.e(TAG, "Auto share sync error", e)
            }
        }
    }

    /**
     * When collaborators can edit, reconcile the changes they make on the
     * public shared doc back into the owner's own items.
     */
    private fun restartSyncBackListener() {
        syncBackJob?.cancel()
        val userId = uid ?: return
        val current = _state.value
        if (!current.isSharing || !current.allowEdits) return

        syncBackJob = viewModelScope.launch {
            repository.observeSharedList(userId).collect { result ->
                val shared = result.getOrNull() ?: return@collect
                val personalItems = _state.value.personalItems
                val sharedSignature = SharedSyncLogic.itemsSignature(shared.items)
                val localSignature = SharedSyncLogic.itemsSignature(
                    SharedSyncLogic.toSharedItems(personalItems),
                )

                sharedItemsSignature = sharedSignature
                if (sharedSignature != localSignature) {
                    pendingInboundSharedSignature = sharedSignature
                }

                val ops = SharedSyncLogic.computeSyncBackOps(
                    personalItems = personalItems,
                    sharedItems = shared.items,
                    permissions = _state.value.permissions,
                )
                if (ops.isEmpty) return@collect

                ops.toggles.forEach { op ->
                    try {
                        repository.setCompleted(op.itemId, op.completed)
                    } catch (e: Exception) {
                        Log.e(TAG, "Collaborator toggle sync-back error", e)
                    }
                }
                ops.adds.forEach { item ->
                    try {
                        repository.addItem(
                            uid = userId,
                            text = item.text,
                            quantity = item.quantity,
                            category = item.category,
                            listId = PERSONAL_LIST_ID,
                            listName = DEFAULT_LIST_NAME,
                            sharedFromUserId = null,
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Collaborator add sync-back error", e)
                    }
                }
                if (ops.removeIds.isNotEmpty()) {
                    try {
                        repository.deleteItems(ops.removeIds)
                    } catch (e: Exception) {
                        Log.e(TAG, "Collaborator remove sync-back error", e)
                    }
                }
            }
        }
    }

    private suspend fun propagateQuietly(item: ShoppingItem, change: ShareChange) {
        try {
            repository.propagateToSharedOwner(item, change)
        } catch (e: Exception) {
            Log.e(TAG, "Propagate to shared owner error", e)
        }
    }
}
