package uk.co.cartlink.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import uk.co.cartlink.app.R
import uk.co.cartlink.app.data.DEFAULT_CATEGORY
import uk.co.cartlink.app.data.MAX_CATEGORY_LENGTH
import uk.co.cartlink.app.data.MAX_ITEM_TEXT_LENGTH
import uk.co.cartlink.app.data.MAX_QUANTITY_LENGTH
import uk.co.cartlink.app.data.PERSONAL_LIST_ID
import uk.co.cartlink.app.data.ShoppingItem

private const val SEARCH_VISIBILITY_THRESHOLD = 15

private enum class ConfirmAction { CLEAR_COMPLETED, REMOVE_SHARED_LIST, STOP_SHARING }

@Composable
fun ShoppingListScreen(
    state: ListUiState,
    shareUrl: String?,
    isDark: Boolean,
    isOnline: Boolean,
    userName: String?,
    userPhotoUrl: String?,
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
    onCopyLink: (String) -> Boolean,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var shareSheetOpen by remember { mutableStateOf(false) }
    var editingItem by remember { mutableStateOf<ShoppingItem?>(null) }
    var confirmAction by remember { mutableStateOf<ConfirmAction?>(null) }

    // Undo-delete toast, mirroring the web copy.
    LaunchedEffect(state.pendingDelete?.id) {
        val deleted = state.pendingDelete ?: return@LaunchedEffect
        val result = snackbarHostState.showSnackbar(
            message = "Removed \u201c${deleted.text}\u201d.",
            actionLabel = "Undo",
            duration = SnackbarDuration.Short,
        )
        if (result == SnackbarResult.ActionPerformed) onUndoDelete()
    }

    val filtered = state.filteredItems
    val activeItems = filtered.filter { !it.completed }
    val doneItems = filtered.filter { it.completed }
    val groupedActive = groupItemsByCategory(activeItems)
    val groupedDone = groupItemsByCategory(doneItems)
    val currentListItems = state.currentListItems
    val allDoneCount = currentListItems.count { it.completed }
    val activeTabName = state.activeTabName
    val showSearch = currentListItems.size > SEARCH_VISIBILITY_THRESHOLD ||
        state.search.isNotEmpty()

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            NavBar(
                isDark = isDark,
                isOnline = isOnline,
                isSharing = state.isSharing,
                userName = userName,
                userPhotoUrl = userPhotoUrl,
                onToggleDark = onToggleDark,
                onOpenShare = { shareSheetOpen = true },
                onSignOut = onSignOut,
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Page heading: active tab name + dismissible messages.
            item(key = "heading") {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        text = activeTabName,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                    )
                    state.importStatus?.let { message ->
                        DismissibleMessage(
                            message = message,
                            isError = false,
                            onDismiss = onDismissImportStatus,
                        )
                    }
                    state.actionError?.let { message ->
                        DismissibleMessage(
                            message = message,
                            isError = true,
                            onDismiss = onDismissError,
                        )
                    }
                }
            }

            if (showSearch) {
                item(key = "search") {
                    OutlinedTextField(
                        value = state.search,
                        onValueChange = onSetSearch,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        placeholder = { Text("Search your list\u2026") },
                        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                        trailingIcon = {
                            if (state.search.isNotEmpty()) {
                                IconButton(onClick = { onSetSearch("") }) {
                                    Icon(Icons.Filled.Close, contentDescription = "Clear search")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                    )
                }
            }

            item(key = "add-form") {
                AddItemForm(onAdd = onAddItem)
            }

            // List tabs (personal + imported shared lists), below the add form
            // like the web app.
            if (state.listTabs.size > 1) {
                item(key = "tabs") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.listTabs.forEach { tab ->
                            ListTabPill(
                                name = tab.name,
                                selected = tab.id == state.activeListId,
                                onClick = { onSetActiveList(tab.id) },
                            )
                        }
                    }
                }
            }

            // Stats bar: remaining count + clear-done + remove-list.
            if (currentListItems.isNotEmpty()) {
                item(key = "stats") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            buildAnnotatedString {
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                                    append("${activeItems.size}")
                                }
                                append(" remaining")
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.weight(1f))
                        if (allDoneCount > 0) {
                            TextButton(
                                onClick = { confirmAction = ConfirmAction.CLEAR_COMPLETED },
                            ) {
                                Text("Clear $allDoneCount done")
                            }
                        }
                        if (state.activeListId != PERSONAL_LIST_ID) {
                            TextButton(
                                onClick = { confirmAction = ConfirmAction.REMOVE_SHARED_LIST },
                            ) {
                                Text("Remove list")
                            }
                        }
                    }
                }
            }

            if (filtered.isEmpty()) {
                item(key = "empty") {
                    EmptyState(
                        hasSearch = state.search.isNotEmpty(),
                        listIsEmpty = currentListItems.isEmpty(),
                        tabName = activeTabName,
                    )
                }
            } else {
                if (activeItems.isNotEmpty()) {
                    if (doneItems.isNotEmpty()) {
                        item(key = "divider-to-get") { SectionDivider("To get") }
                    }
                    categoryGroups(
                        groups = groupedActive,
                        keyPrefix = "active",
                        onToggle = onToggleItem,
                        onEdit = { editingItem = it },
                        onDelete = onDeleteItem,
                    )
                }
                if (doneItems.isNotEmpty()) {
                    item(key = "divider-got-it") { SectionDivider("Got it") }
                    categoryGroups(
                        groups = groupedDone,
                        keyPrefix = "done",
                        onToggle = onToggleItem,
                        onEdit = { editingItem = it },
                        onDelete = onDeleteItem,
                    )
                }
            }

            item(key = "bottom-spacer") { Spacer(Modifier.height(48.dp)) }
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
        ConfirmActionDialog(
            action = action,
            itemCount = allDoneCount,
            listName = activeTabName,
            busy = state.shareBusy && action == ConfirmAction.STOP_SHARING,
            onCancel = { confirmAction = null },
            onConfirm = {
                when (action) {
                    ConfirmAction.CLEAR_COMPLETED -> onClearCompleted()
                    ConfirmAction.REMOVE_SHARED_LIST -> onRemoveSharedList()
                    ConfirmAction.STOP_SHARING -> onStopSharing()
                }
                confirmAction = null
            },
        )
    }
}

// ------------------------------------------------------------------- nav bar

@Composable
private fun NavBar(
    isDark: Boolean,
    isOnline: Boolean,
    isSharing: Boolean,
    userName: String?,
    userPhotoUrl: String?,
    onToggleDark: () -> Unit,
    onOpenShare: () -> Unit,
    onSignOut: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(R.drawable.cartlink_mark),
                contentDescription = null,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                buildAnnotatedString {
                    append("Cart")
                    withStyle(
                        SpanStyle(
                            fontStyle = FontStyle.Italic,
                            color = MaterialTheme.colorScheme.primary,
                        ),
                    ) {
                        append("Link")
                    }
                },
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.weight(1f))

            if (!isOnline) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Icon(
                        Icons.Filled.WifiOff,
                        contentDescription = "Offline \u2014 changes will sync when online",
                        modifier = Modifier.size(13.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "Offline",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(6.dp))
            }

            UserChip(userName = userName, userPhotoUrl = userPhotoUrl)

            IconButton(onClick = onToggleDark) {
                Icon(
                    if (isDark) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                    contentDescription = if (isDark) {
                        "Switch to light mode"
                    } else {
                        "Switch to dark mode"
                    },
                    modifier = Modifier.size(18.dp),
                )
            }
            Box {
                IconButton(onClick = onOpenShare) {
                    Icon(
                        Icons.Filled.Share,
                        contentDescription = if (isSharing) {
                            "Share list (sharing is on)"
                        } else {
                            "Share list"
                        },
                        modifier = Modifier.size(18.dp),
                        tint = if (isSharing) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
                if (isSharing) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 8.dp, end = 8.dp)
                            .size(7.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape),
                    )
                }
            }
            IconButton(onClick = onSignOut) {
                Icon(
                    Icons.AutoMirrored.Filled.Logout,
                    contentDescription = "Sign out",
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun UserChip(userName: String?, userPhotoUrl: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (userPhotoUrl != null) {
            AsyncImage(
                model = userPhotoUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .background(MaterialTheme.colorScheme.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = userName?.firstOrNull()?.uppercase() ?: "?",
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        userName?.split(" ")?.firstOrNull()?.let { first ->
            Spacer(Modifier.width(6.dp))
            Text(
                first,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// -------------------------------------------------------------- page pieces

@Composable
private fun DismissibleMessage(message: String, isError: Boolean, onDismiss: () -> Unit) {
    Surface(
        color = if (isError) {
            MaterialTheme.colorScheme.errorContainer
        } else {
            MaterialTheme.colorScheme.primaryContainer
        },
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 12.dp, top = 4.dp, bottom = 4.dp),
        ) {
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isError) {
                    MaterialTheme.colorScheme.onErrorContainer
                } else {
                    MaterialTheme.colorScheme.onPrimaryContainer
                },
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onDismiss) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Dismiss message",
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun ListTabPill(name: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = if (selected) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.surfaceVariant
        },
        contentColor = if (selected) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
    ) {
        Text(
            name,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun SectionDivider(label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.width(10.dp))
        HorizontalDivider(Modifier.weight(1f))
    }
}

@Composable
private fun EmptyState(hasSearch: Boolean, listIsEmpty: Boolean, tabName: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp),
    ) {
        Icon(
            Icons.Outlined.Inventory2,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.outline,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = when {
                hasSearch -> "No matches"
                listIsEmpty -> "Bag is empty"
                else -> "Nothing here"
            },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = if (hasSearch) {
                "Try a different search term."
            } else {
                "Add your first item to $tabName."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// -------------------------------------------------------------------- items

private fun groupItemsByCategory(
    items: List<ShoppingItem>,
): List<Pair<String, List<ShoppingItem>>> =
    items.groupBy { it.effectiveCategory }
        .toList()
        .sortedWith(
            compareBy(
                { (category, _) -> category == DEFAULT_CATEGORY },
                { (category, _) -> category.lowercase() },
            ),
        )

private fun androidx.compose.foundation.lazy.LazyListScope.categoryGroups(
    groups: List<Pair<String, List<ShoppingItem>>>,
    keyPrefix: String,
    onToggle: (ShoppingItem) -> Unit,
    onEdit: (ShoppingItem) -> Unit,
    onDelete: (ShoppingItem) -> Unit,
) {
    groups.forEach { (category, categoryItems) ->
        item(key = "$keyPrefix-category-$category") {
            Text(
                text = category,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 16.dp, top = 10.dp, bottom = 2.dp),
            )
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
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 2.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable(onClick = onToggle)
                .padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        ) {
            // Round check toggle, like the web app.
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .then(
                        if (item.completed) {
                            Modifier.background(MaterialTheme.colorScheme.primary)
                        } else {
                            Modifier.border(
                                1.5.dp,
                                MaterialTheme.colorScheme.outline,
                                CircleShape,
                            )
                        },
                    ),
            ) {
                if (item.completed) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        modifier = Modifier.size(13.dp),
                        tint = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
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
                if (item.quantity != null || item.category != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        item.quantity?.let { MetaBadge(it) }
                        item.category?.let { MetaBadge(it) }
                    }
                }
            }
            IconButton(onClick = onEdit) {
                Icon(
                    Icons.Filled.Edit,
                    contentDescription = "Edit \u201c${item.text}\u201d",
                    modifier = Modifier.size(15.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Outlined.Delete,
                    contentDescription = "Remove \u201c${item.text}\u201d",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MetaBadge(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(6.dp),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
        )
    }
}

// ----------------------------------------------------------------- add form

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

    val detailsActive = detailsOpen || quantity.isNotEmpty() || category.isNotEmpty()

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
        OutlinedTextField(
            value = text,
            onValueChange = { if (it.length <= MAX_ITEM_TEXT_LENGTH) text = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Add an item\u2026") },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeActionDone),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            trailingIcon = {
                Row {
                    IconButton(onClick = { detailsOpen = !detailsOpen }) {
                        Icon(
                            Icons.Filled.Tune,
                            contentDescription = if (detailsOpen) {
                                "Hide quantity and category"
                            } else {
                                "Add quantity and category"
                            },
                            tint = if (detailsActive) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    IconButton(onClick = { submit() }, enabled = text.isNotBlank()) {
                        Icon(Icons.Filled.Add, contentDescription = "Add item")
                    }
                }
            },
        )
        if (detailsOpen) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { if (it.length <= MAX_QUANTITY_LENGTH) quantity = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Quantity") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                )
                OutlinedTextField(
                    value = category,
                    onValueChange = { if (it.length <= MAX_CATEGORY_LENGTH) category = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Category / aisle") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                )
            }
        }
    }
}

private val ImeActionDone = androidx.compose.ui.text.input.ImeAction.Done

// ---------------------------------------------------------- confirm dialogs

/** Confirmation dialog with the same copy as the web app. */
@Composable
private fun ConfirmActionDialog(
    action: ConfirmAction,
    itemCount: Int,
    listName: String,
    busy: Boolean,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    val (title, body, confirmLabel) = when (action) {
        ConfirmAction.CLEAR_COMPLETED -> Triple(
            "Clear completed items?",
            "This will permanently remove $itemCount completed " +
                (if (itemCount == 1) "item" else "items") + " from $listName.",
            "Clear items",
        )

        ConfirmAction.REMOVE_SHARED_LIST -> Triple(
            "Remove this list?",
            "$listName and its saved items will be removed from your account.",
            "Remove list",
        )

        ConfirmAction.STOP_SHARING -> Triple(
            "Stop sharing?",
            "Anyone with your current share link or QR code will no longer be able " +
                "to view this list.",
            "Stop sharing",
        )
    }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !busy) {
                Text(
                    if (busy) "Working..." else confirmLabel,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text("Cancel") }
        },
    )
}
