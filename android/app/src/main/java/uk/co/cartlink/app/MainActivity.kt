package uk.co.cartlink.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cartlink.app.auth.AuthViewModel
import uk.co.cartlink.app.data.ThemePreferences
import uk.co.cartlink.app.ui.ListViewModel
import uk.co.cartlink.app.ui.LoginScreen
import uk.co.cartlink.app.ui.ShoppingListScreen
import uk.co.cartlink.app.ui.theme.CartLinkTheme
import uk.co.cartlink.app.util.observeOnlineStatus

class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()
    private val listViewModel: ListViewModel by viewModels()

    /** Share id parsed from an /import/{id} or /share/{id} deep link. */
    private var pendingShareId by mutableStateOf<String?>(null)

    private val signInLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult(),
    ) { result ->
        authViewModel.handleSignInResult(this, result.data)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleDeepLink(intent)

        val themePreferences = ThemePreferences(applicationContext)

        setContent {
            val authState by authViewModel.state.collectAsStateWithLifecycle()
            val listState by listViewModel.state.collectAsStateWithLifecycle()
            val darkPref by themePreferences.darkMode
                .collectAsStateWithLifecycle(initialValue = null)
            val online by observeOnlineStatus(applicationContext)
                .collectAsStateWithLifecycle(initialValue = true)

            val systemDark = androidx.compose.foundation.isSystemInDarkTheme()
            val isDark = darkPref ?: systemDark

            CartLinkTheme(darkOverride = isDark) {
                val user = authState.user

                LaunchedEffect(user?.uid) {
                    if (user != null) {
                        listViewModel.start(user.uid, user.displayName, user.email)
                    } else {
                        listViewModel.stop()
                    }
                }

                // Run a pending deep-link import once signed in.
                LaunchedEffect(user?.uid, pendingShareId) {
                    val shareId = pendingShareId
                    if (user != null && shareId != null) {
                        listViewModel.importSharedList(shareId)
                        pendingShareId = null
                    }
                }

                when {
                    authState.loading -> LoadingScreen()

                    user == null -> LoginScreen(
                        signingIn = authState.signingIn,
                        error = authState.error,
                        onSignIn = { authViewModel.beginSignIn(this, signInLauncher) },
                    )

                    else -> ShoppingListScreen(
                        state = listState,
                        shareUrl = if (listState.isSharing) {
                            "${getString(R.string.share_base_url)}/share/${user.uid}"
                        } else {
                            null
                        },
                        isDark = isDark,
                        isOnline = online,
                        onToggleDark = {
                            lifecycleScope.launch {
                                themePreferences.setDarkMode(!isDark)
                            }
                        },
                        onSignOut = { authViewModel.signOut(this) },
                        onSetActiveList = listViewModel::setActiveList,
                        onSetSearch = listViewModel::setSearch,
                        onAddItem = listViewModel::addItem,
                        onToggleItem = listViewModel::toggleComplete,
                        onEditItem = listViewModel::updateItemDetails,
                        onDeleteItem = listViewModel::deleteItem,
                        onUndoDelete = listViewModel::undoDelete,
                        onClearCompleted = listViewModel::clearCompleted,
                        onRemoveSharedList = listViewModel::removeActiveSharedList,
                        onStartSharing = listViewModel::startSharing,
                        onStopSharing = listViewModel::stopSharing,
                        onTogglePermission = listViewModel::togglePermission,
                        onToggleAnonymousEdits = listViewModel::toggleAnonymousEdits,
                        onDismissError = listViewModel::dismissError,
                        onDismissImportStatus = listViewModel::dismissImportStatus,
                        onShareLink = ::shareLink,
                        onCopyLink = ::copyLink,
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val data: Uri = intent?.data ?: return
        val segments = data.pathSegments
        if (segments.size >= 2 && (segments[0] == "share" || segments[0] == "import")) {
            pendingShareId = segments[1]
        }
    }

    private fun shareLink(url: String) {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        startActivity(Intent.createChooser(sendIntent, "Share your list"))
    }

    private fun copyLink(url: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("CartLink share link", url))
    }
}

@Composable
private fun LoadingScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
