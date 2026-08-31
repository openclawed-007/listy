package uk.co.cartlink.app.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")
private val DARK_MODE_KEY = booleanPreferencesKey("dark_mode")

/** Persisted theme choice: null = follow system, true/false = forced. */
class ThemePreferences(private val context: Context) {

    val darkMode: Flow<Boolean?> = context.dataStore.data.map { prefs ->
        prefs[DARK_MODE_KEY]
    }

    suspend fun setDarkMode(dark: Boolean) {
        context.dataStore.edit { prefs -> prefs[DARK_MODE_KEY] = dark }
    }
}
