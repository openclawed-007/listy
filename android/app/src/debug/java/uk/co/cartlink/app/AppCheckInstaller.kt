package uk.co.cartlink.app

import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/** Debug builds attest with the App Check debug provider. */
fun installAppCheckProvider(appCheck: FirebaseAppCheck) {
    appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
}
