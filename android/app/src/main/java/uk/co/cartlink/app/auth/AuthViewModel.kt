package uk.co.cartlink.app.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.auth.api.identity.GetSignInIntentRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import uk.co.cartlink.app.R

private const val TAG = "AuthViewModel"

data class AuthState(
    val user: FirebaseUser? = null,
    val loading: Boolean = true,
    val signingIn: Boolean = false,
    val error: String? = null,
)

/**
 * Google Sign-In via Play services' Identity API. The account picker UI is
 * hosted by Google Play services itself, which keeps the flow working on
 * devices where the AOSP Credential Manager UI is broken.
 */
class AuthViewModel : ViewModel() {

    private val auth = FirebaseAuth.getInstance()

    private val _state = MutableStateFlow(AuthState())
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
        _state.value = _state.value.copy(user = firebaseAuth.currentUser, loading = false)
    }

    init {
        auth.addAuthStateListener(listener)
    }

    override fun onCleared() {
        auth.removeAuthStateListener(listener)
    }

    /** Ask Play services for the sign-in intent and hand it to [launcher]. */
    fun beginSignIn(activity: Activity, launcher: ActivityResultLauncher<IntentSenderRequest>) {
        if (_state.value.signingIn) return
        _state.value = _state.value.copy(signingIn = true, error = null)
        Log.i(TAG, "Sign-in: requesting sign-in intent")

        val request = GetSignInIntentRequest.builder()
            .setServerClientId(activity.getString(R.string.default_web_client_id))
            .build()

        Identity.getSignInClient(activity)
            .getSignInIntent(request)
            .addOnSuccessListener { pendingIntent ->
                try {
                    Log.i(TAG, "Sign-in: launching account picker")
                    launcher.launch(IntentSenderRequest.Builder(pendingIntent).build())
                } catch (e: Exception) {
                    Log.e(TAG, "Sign-in: launching picker failed", e)
                    _state.value = _state.value.copy(
                        signingIn = false,
                        error = "Could not open the Google account picker. Please try again.",
                    )
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Sign-in: getSignInIntent failed", e)
                _state.value = _state.value.copy(
                    signingIn = false,
                    error = "Sign-in is unavailable right now. Check that Google Play " +
                        "services is up to date and try again.",
                )
            }
    }

    /** Handle the activity result from the account picker. */
    fun handleSignInResult(context: Context, data: Intent?) {
        try {
            val credential = Identity.getSignInClient(context).getSignInCredentialFromIntent(data)
            val idToken = credential.googleIdToken
            if (idToken == null) {
                Log.w(TAG, "Sign-in: no ID token in credential")
                _state.value = _state.value.copy(
                    signingIn = false,
                    error = "Google did not return a sign-in token. Please try again.",
                )
                return
            }

            viewModelScope.launch {
                try {
                    auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null))
                        .await()
                    Log.i(TAG, "Sign-in: Firebase auth complete")
                    _state.value = _state.value.copy(signingIn = false)
                } catch (e: Exception) {
                    Log.e(TAG, "Sign-in: Firebase credential exchange failed", e)
                    _state.value = _state.value.copy(
                        signingIn = false,
                        error = "Sign-in failed. Check your connection and try again.",
                    )
                }
            }
        } catch (e: ApiException) {
            if (e.statusCode == CommonStatusCodes.CANCELED) {
                Log.i(TAG, "Sign-in cancelled by user")
                _state.value = _state.value.copy(signingIn = false)
            } else {
                Log.e(TAG, "Sign-in: picker returned error ${e.statusCode}", e)
                _state.value = _state.value.copy(
                    signingIn = false,
                    error = "Sign-in failed (code ${e.statusCode}). Please try again.",
                )
            }
        }
    }

    fun signOut(context: Context) {
        viewModelScope.launch {
            auth.signOut()
            try {
                Identity.getSignInClient(context).signOut().await()
            } catch (e: Exception) {
                Log.w(TAG, "Play services sign-out failed", e)
            }
        }
    }

    fun dismissError() {
        _state.value = _state.value.copy(error = null)
    }
}
