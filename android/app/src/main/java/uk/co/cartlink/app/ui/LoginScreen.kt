package uk.co.cartlink.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import uk.co.cartlink.app.R

@Composable
fun LoginScreen(
    signingIn: Boolean,
    error: String?,
    onSignIn: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.padding(32.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.cartlink_mark),
                contentDescription = null,
                modifier = Modifier.size(72.dp),
            )

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
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Your simple, beautiful shopping companion.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            if (error != null) {
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }

            if (signingIn) {
                CircularProgressIndicator()
            } else {
                Button(
                    onClick = onSignIn,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Continue with Google")
                }
            }

            val linkStyle = SpanStyle(
                color = MaterialTheme.colorScheme.primary,
                textDecoration = TextDecoration.Underline,
            )
            Text(
                buildAnnotatedString {
                    append("By continuing you agree to our ")
                    withLink(
                        LinkAnnotation.Url("https://cartlink.co.uk/terms"),
                    ) {
                        withStyle(linkStyle) { append("Terms") }
                    }
                    append(" and ")
                    withLink(
                        LinkAnnotation.Url("https://cartlink.co.uk/privacy"),
                    ) {
                        withStyle(linkStyle) { append("Privacy Policy") }
                    }
                    append(".")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}
