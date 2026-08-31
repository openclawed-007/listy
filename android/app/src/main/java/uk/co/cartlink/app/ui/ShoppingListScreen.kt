package uk.co.cartlink.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import uk.co.cartlink.app.data.PERSONAL_LIST_ID
import uk.co.cartlink.app.data.ShoppingItem

private const val SEARCH_VISIBILITY_THRESHOLD = 15

private enum class ConfirmAction { CLEAR_COMPLETED, REMOVE_SHARED_LIST, STOP_SHARING }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShoppingListScreen(
    state: ListUiState,
    shareUrl: String?,
    isDark: Boolean,
    isOnline: Boolean,
    onToggleDark: () -> Unit,
    onSignOut: () -> Unit,
    onSetActiveList: (String) -> Unit,
    onSetSearch: (String) -> Unit,
    onAddItem: (text: String, quantity: String, category: String) -> Unit,
    onToggleItem: (ShoppingItem) -> Unit,
    onEditItem: (itemId: String, text: String, quantity: String, category: String) -> Unit,
    onDeleteItem: (ShoppingItem) -> Unit,
    onUndoDelete: () -> Unit,
    onClearCompleted: () -> Unit,
    onRemoveSharedList: () -> Unit,
    onStartSharing: () -> Unit,
    onStopSharing: () -> Unit,
    onTogglePermission: (String, Boolean) -> Unit,
    onToggleAnonymousEdits: (Boolean) -> Unit,
    onDismissError: () -> Unit,
    onDismissImportStatus: () -> Unit,
    onShareLink: (String) -> Unit,
    onCopyLink: (String) -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var shareSheetOpen by remember { mutableStateOf(false) }
    var editingItem by remember { mutableStateOf<ShoppingItem?>(null) }
    var confirmAction by remember { mutableStateOf<ConfirmAction?>(null) }

    // Undo-delete snackbar.
    LaunchedEffect(state.pendingDelete?.id) {
        val deleted = state.pendingDelete ?: return@LaunchedEffect
        val result = snackbarHostState.showSnackbar(
            message = "Removed \"${deleted.text}\"",
            actionLabel = "Undo",
            duration = SnackbarDuration.Short,
        )
        if (result == SnackbarResult.ActionPerformed) onUndoDelete()
    }

    // Error + import status snackbars.
    LaunchedEffect(state.actionError) {
        val message = state.actionError ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message)
        onDismissError()
    }
    LaunchedEffect(state.importStatus) {
        val message = state.importStatus ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message)
        onDismissImportStatus()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("CartLink", fontWeight = FontWeight.Bold)
                        if (!isOnline) {
                            Spacer(Modifier.width(8.dp))
                            Icon(
                                Icons.Filled.WifiOff,
                                contentDescription = "Offline — changes will sync when online",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onToggleDark) {
                        Icon(
                            if (isDark) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                            contentDescription = if (isDark) {
                                "Switch to light mode"
                            } else {
                                "Switch to dark mode"
                            },
                        )
                    }
                    IconButton(onClick = { shareSheetOpen = true }) {
                        Icon(
                            Icons.Filled.Share,
                            contentDescription = if (state.isSharing) {
                                "Share list (sharing is on)"
                            } else {
                                "Share list"
                            },
                            tint = if (state.isSharing) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                        )
                    }
                    IconButton(onClick = onSignOut) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out")
                    }
                },
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // List tabs (personal + imported shared lists).
            val tabs = state.listTabs
            if (tabs.size > 1) {
                val selectedIndex = tabs
                    .indexOfFirst { it.id == state.activeListId }
                    .coerceAtLeast(0)
                ScrollableTabRow(
                    selectedTabIndex = selectedIndex,
                    containerColor = MaterialTheme.colorScheme.background,
                    edgePadding = 16.dp,
                ) {
                    tabs.forEachIndexed { index, tab ->
                        Tab(
                            selected = index == selectedIndex,
                            onClick = { onSetActiveList(tab.id) },
                            text = { Text(tab.name) },
                        )
                    }
                }
            }

            val showSearch = state.currentListItems.size > SEARCH_VISIBILITY_THRESHOLD ||
                state.search.isNotEmpty()
            if (showSearch) {
                OutlinedTextField(
                    value = state.search,
                    onValueChange = onSetSearch,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search your list…") },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (state.search.isNotEmpty()) {
                            IconButton(onClick = { onSetSearch("") }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear search")
                            }
                        }
                    },
                    singleLine = true,
                )
            }

            AddItemForm(onAdd = onAddItem)

            val filtered = state.filteredItems
            val activeItems = filtered.filter { !it.completed }
            val doneItems = filtered.filter { it.completed }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                itemsGroupedByCategory(
                    items = activeItems,
                    onToggle = onToggleItem,
                    onEdit = { editingItem = it },
                    onDelete = onDeleteItem,
                )

                if (doneItems.isNotEmpty()) {
                    item(key = "done-header") {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.Filled.Check,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Got it (${doneItems.size})",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.weight(1f))
                            TextButton(
                                onClick = { confirmAction = ConfirmAction.CLEAR_COMPLETED },
                            ) {
                                Text("Clear")
                            }
                        }
                        HorizontalDivider()
                    }
                    itemsGroupedByCategory(
                        items = doneItems,
                        keyPrefix = "done",
                        onToggle = onToggleItem,
                        onEdit = { editingItem = it },
                        onDelete = onDeleteItem,
                    )
                }

                if (filtered.isEmpty()) {
                    item(key = "empty") {
                        Text(
                            text = if (state.search.isNotEmpty()) {
                                "No items match your search."
                            } else {
                                "Your list is empty. Add your first item above."
                            },
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                        )
                    }
                }

                if (state.activeListId != PERSONAL_LIST_ID) {
                    item(key = "remove-shared") {
                        TextButton(
                            onClick = { confirmAction = ConfirmAction.REMOVE_SHARED_LIST },
                            modifier = Modifier.padding(16.dp),
                        ) {
                            Text(
                                "Remove this shared list",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }

                item(key = "bottom-spacer") { Spacer(Modifier.height(32.dp)) }
            }
        }
    }

    if (shareSheetOpen) {
        ShareSheet(
            isSharing = state.isSharing,
            shareBusy = state.shareBusy,
            permissions = state.permissions,
            allowAnonymousEdits = state.allowAnonymousEdits,
            shareUrl = shareUrl,
            onStartSharing = onStartSharing,
            onStopSharing = { confirmAction = ConfirmAction.STOP_SHARING },
            onTogglePermission = onTogglePermission,
            onToggleAnonymousEdits = onToggleAnonymousEdits,
            onShareLink = onShareLink,
            onCopyLink = onCopyLink,
            onDismiss = { shareSheetOpen = false },
        )
    }

    editingItem?.let { item ->
        EditItemDialog(
            item = item,
            onConfirm = { text, quantity, category ->
                onEditItem(item.id, text, quantity, category)
                editingItem = null
            },
            onDismiss = { editingItem = null },
        )
    }

    confirmAction?.let { action ->
        val (title, body, confirmLabel) = when (action) {
            ConfirmAction.CLEAR_COMPLETED ->
                Triple(
                    "Clear completed items?",
                    "This removes every item marked as done in this list.",
                    "Clear",
                )

            ConfirmAction.REMOVE_SHARED_LIST ->
                Triple(
                    "Remove this shared list?",
                    "This removes the imported copy from your tabs. " +
                        "The owner's list is not affected.",
                    "Remove",
                )

            ConfirmAction.STOP_SHARING ->
                Triple(
                    "Stop sharing?",
                    "Your share link and QR code will stop working immediately.",
                    "Stop sharing",
                )
        }
        AlertDialog(
            onDismissRequest = { confirmAction = null },
            title = { Text(title) },
            text = { Text(body) },
            confirmButton = {
                TextButton(
                    onClick = {
                        when (action) {
                            ConfirmAction.CLEAR_COMPLETED -> onClearCompleted()
                            ConfirmAction.REMOVE_SHARED_LIST -> onRemoveSharedList()
                            ConfirmAction.STOP_SHARING -> onStopSharing()
                        }
                        confirmAction = null
                    },
                ) {
                    Text(confirmLabel)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmAction = null }) { Text("Cancel") }
            },
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.itemsGroupedByCategory(
    items: List<ShoppingItem>,
    keyPrefix: String = "active",
    onToggle: (ShoppingItem) -> Unit,
    onEdit: (ShoppingItem) -> Unit,
    onDelete: (ShoppingItem) -> Unit,
) {
    val grouped = items.groupBy { it.effectiveCategory }
    grouped.forEach { (category, categoryItems) ->
        if (grouped.size > 1 || category != uk.co.cartlink.app.data.DEFAULT_CATEGORY) {
            item(key = "$keyPrefix-category-$category") {
                Text(
                    text = category,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 2.dp),
                )
            }
        }
        categoryItems.forEach { item ->
            item(key = "$keyPrefix-${item.id}") {
                ItemRow(
                    item = item,
                    onToggle = { onToggle(item) },
                    onEdit = { onEdit(item) },
                    onDelete = { onDelete(item) },
                )
            }
        }
    }
}

@Composable
private fun ItemRow(
    item: ShoppingItem,
    onToggle: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = item.completed, onCheckedChange = { onToggle() })
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.text,
                style = MaterialTheme.typography.bodyLarge,
                textDecoration = if (item.completed) TextDecoration.LineThrough else null,
                color = if (item.completed) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
            if (item.quantity != null) {
                Text(
                    text = item.quantity,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        IconButton(onClick = onEdit) {
            Icon(
                Icons.Filled.Edit,
                contentDescription = "Edit ${item.text}",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Filled.Delete,
                contentDescription = "Remove ${item.text}",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun AddItemForm(
    onAdd: (text: String, quantity: String, category: String) -> Unit,
) {
    var text by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var detailsOpen by remember { mutableStateOf(false) }

    fun submit() {
        if (text.isBlank()) return
        onAdd(text, quantity, category)
        text = ""
        quantity = ""
        category = ""
    }

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Add an item…") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            leadingIcon = {
                IconButton(onClick = { detailsOpen = !detailsOpen }) {
                    Icon(
                        if (detailsOpen) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = if (detailsOpen) {
                            "Hide quantity and category"
                        } else {
                            "Add quantity and category"
                        },
                    )
                }
            },
            trailingIcon = {
                IconButton(onClick = { submit() }, enabled = text.isNotBlank()) {
                    Icon(Icons.Filled.Add, contentDescription = "Add item")
                }
            },
        )
        if (detailsOpen) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { quantity = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Qty (e.g. 2 packs)") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = category,
                    onValueChange = { category = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Category") },
                    singleLine = true,
                )
            }
        }
    }
}
