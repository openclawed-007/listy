package uk.co.cartlink.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// CartLink brand palette (matches the web app).
val BrandGreen = Color(0xFF6A866C)
val BrandGreenDark = Color(0xFF87A489)
val SurfaceLight = Color(0xFFF7F4EF)
val SurfaceDark = Color(0xFF141B1E)

private val LightColors = lightColorScheme(
    primary = BrandGreen,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD9E3DA),
    onPrimaryContainer = Color(0xFF243426),
    secondary = Color(0xFF57624E),
    background = SurfaceLight,
    onBackground = Color(0xFF1E2422),
    surface = Color(0xFFFFFDF8),
    onSurface = Color(0xFF1E2422),
    surfaceVariant = Color(0xFFEDE8E0),
    onSurfaceVariant = Color(0xFF4A514D),
    outline = Color(0xFF757E77),
    error = Color(0xFFB3261E),
)

private val DarkColors = darkColorScheme(
    primary = BrandGreenDark,
    onPrimary = Color(0xFF10240F),
    primaryContainer = Color(0xFF32473A),
    onPrimaryContainer = Color(0xFFD9E3DA),
    secondary = Color(0xFFBFC9B4),
    background = SurfaceDark,
    onBackground = Color(0xFFE1E5E2),
    surface = Color(0xFF1B2327),
    onSurface = Color(0xFFE1E5E2),
    surfaceVariant = Color(0xFF263135),
    onSurfaceVariant = Color(0xFFBAC4BE),
    outline = Color(0xFF88938C),
    error = Color(0xFFF2B8B5),
)

@Composable
fun CartLinkTheme(
    darkOverride: Boolean? = null,
    content: @Composable () -> Unit,
) {
    val dark = darkOverride ?: isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}
