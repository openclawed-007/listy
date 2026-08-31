package uk.co.cartlink.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck

class CartLinkApp : Application() {

    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)

        // App Check is enforced on Firestore (required for the anonymous-edit
        // web flow), so the native app must attest too. The provider is
        // variant-specific: Play Integrity in release, debug provider in debug.
        installAppCheckProvider(FirebaseAppCheck.getInstance())
    }
}
