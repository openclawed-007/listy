package uk.co.cartlink.app.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/** Emits true while the device has an internet-capable connection. */
fun observeOnlineStatus(context: Context): Flow<Boolean> = callbackFlow {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    fun currentStatus(): Boolean {
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    trySend(currentStatus())

    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            trySend(true)
        }

        override fun onLost(network: Network) {
            trySend(currentStatus())
        }
    }

    val request = NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()
    manager.registerNetworkCallback(request, callback)

    awaitClose { manager.unregisterNetworkCallback(callback) }
}
