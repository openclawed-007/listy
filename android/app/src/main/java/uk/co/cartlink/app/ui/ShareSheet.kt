package uk.co.cartlink.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cartlink.app.data.SharePermissions
import uk.co.cartlink.app.util.generateQrCode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSheet(
    isSharing: Boolean,
    shareBusy: Boolean,
    permissions: SharePermissions,
    allowAnonymousEdits: Boolean,
    shareUrl: String?,
    onStartSharing: () -> Unit,
    onStopSharing: () -> Unit,
    onTogglePermission: (String, Boolean) -> Unit,
    onToggleAnonymousEdits: (Boolean) -> Unit,
    onShareLink: (String) -> Unit,
    onCopyLink: (String) -> Boolean,
    onDismiss: () -> Unit,
) {
    var shareStatus by remember { mutableStateOf("") }
    val allowEdits = permissions.hasAny

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column {
                Text(
                    "Share list",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    if (isSharing) {
                        "Anyone with the link or QR code can view your list."
                    } else {
                        "Publish your list to a public link or QR code."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (isSharing) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    shareUrl?.let { url ->
                        val qr = remember(url) { generateQrCode(url) }
                        Image(
                            bitmap = qr.asImageBitmap(),
                            contentDescription = "QR code for your shared list",
                            modifier = Modifier
                                .size(190.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.White)
                                .padding(8.dp),
                        )
                    }
                    Text(
                        shareStatus.ifEmpty { "Live - changes publish automatically" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = {
                                shareUrl?.let { url ->
                                    shareStatus =
                                        if (onCopyLink(url)) "Link copied" else "Copy failed"
                                }
                            },
                            enabled = shareUrl != null,
                        ) {
                            Icon(
                                Icons.Filled.ContentCopy,
                                contentDescription = null,
                                modifier = Modifier.size(15.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Copy link")
                        }
                        Button(
                            onClick = { shareUrl?.let(onShareLink) },
                            enabled = shareUrl != null,
                        ) {
                            Text("Share\u2026")
                        }
                    }
                }

                // Visitor permissions.
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Visitor permissions",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.weight(1f))
                        Text(
                            if (allowEdits) "Can edit" else "View only",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PermChip(
                            label = "Check off",
                            icon = { Icon(Icons.Filled.Check, null, Modifier.size(15.dp)) },
                            selected = permissions.toggle,
                            onClick = { onTogglePermission("toggle", !permissions.toggle) },
                        )
                        PermChip(
                            label = "Add",
                            icon = { Icon(Icons.Filled.Add, null, Modifier.size(15.dp)) },
                            selected = permissions.add,
                            onClick = { onTogglePermission("add", !permissions.add) },
                        )
                        PermChip(
                            label = "Remove",
                            icon = { Icon(Icons.Outlined.Delete, null, Modifier.size(14.dp)) },
                            selected = permissions.remove,
                            onClick = { onTogglePermission("remove", !permissions.remove) },
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Checkbox(
                            checked = allowAnonymousEdits && allowEdits,
                            enabled = allowEdits,
                            onCheckedChange = onToggleAnonymousEdits,
                        )
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Let people edit without signing in",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (allowEdits) {
                                    MaterialTheme.colorScheme.onSurface
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                            Text(
                                if (allowEdits) {
                                    "Anyone with the link or QR code can check off and add " +
                                        "items. They can never remove items, and you can stop " +
                                        "sharing at any time."
                                } else {
                                    "Turn on a permission above first."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                TextButton(
                    onClick = onStopSharing,
                    enabled = !shareBusy,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                ) {
                    Text(
                        if (shareBusy) "Stopping..." else "Stop sharing",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        Icons.Filled.Share,
                        contentDescription = null,
                        modifier = Modifier.size(36.dp),
                        tint = MaterialTheme.colorScheme.outline,
                    )
                    Text("Sharing is off.", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Anyone with the link can view (not edit) your list.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                    Button(
                        onClick = onStartSharing,
                        enabled = !shareBusy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (shareBusy) "Starting..." else "Start sharing")
                    }
                }
            }
        }
    }
}

@Composable
private fun PermChip(
    label: String,
    icon: @Composable () -> Unit,
    selected: Boolean,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = icon,
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = MaterialTheme.colorScheme.primary,
            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
            selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
        ),
    )
}
