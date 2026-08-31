package uk.co.cartlink.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
    onCopyLink: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Share your list",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )

            if (!isSharing) {
                Text(
                    "Publish a live snapshot of My List. Anyone with the link or " +
                        "QR code can see it — and, if you allow it, help check things off.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onStartSharing,
                    enabled = !shareBusy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (shareBusy) "Preparing…" else "Start sharing")
                }
            } else {
                shareUrl?.let { url ->
                    val qr = remember(url) { generateQrCode(url) }
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Image(
                            bitmap = qr.asImageBitmap(),
                            contentDescription = "QR code for your shared list",
                            modifier = Modifier
                                .size(200.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.White)
                                .padding(8.dp),
                        )
                        Text(
                            url,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { onCopyLink(url) }) { Text("Copy link") }
                            Button(onClick = { onShareLink(url) }) { Text("Share…") }
                        }
                    }
                }

                HorizontalDivider()

                Text(
                    "Collaborators can…",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                PermissionRow(
                    label = "Check items off",
                    checked = permissions.toggle,
                    onChange = { onTogglePermission("toggle", it) },
                )
                PermissionRow(
                    label = "Add items",
                    checked = permissions.add,
                    onChange = { onTogglePermission("add", it) },
                )
                PermissionRow(
                    label = "Remove items",
                    checked = permissions.remove,
                    onChange = { onTogglePermission("remove", it) },
                )

                PermissionRow(
                    label = "Allow edits without signing in",
                    description = "Visitors who open the link can check off or add " +
                        "items without an account. They can never remove items.",
                    checked = allowAnonymousEdits,
                    enabled = permissions.hasAny,
                    onChange = onToggleAnonymousEdits,
                )

                HorizontalDivider()

                TextButton(onClick = onStopSharing, enabled = !shareBusy) {
                    Text("Stop sharing", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun PermissionRow(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    description: String? = null,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            if (description != null) {
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
