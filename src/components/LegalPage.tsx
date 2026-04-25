import React from "react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";

interface LegalPageProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

const LegalPage: React.FC<LegalPageProps> = ({ title, updated, children }) => {
  return (
    <div className="legal-wrapper">
      <header className="legal-header">
        <Link to="/" className="legal-brand" aria-label="Back to CartLink">
          <span className="nav-brand-icon">
            <ShoppingBag size={18} strokeWidth={2.5} />
          </span>
          <span className="nav-brand-name">
            Cart<em>Link</em>
          </span>
        </Link>
      </header>
      <main className="legal-content">
        <h1>{title}</h1>
        <p className="legal-meta">Last updated: {updated}</p>
        {children}
        <p className="legal-back">
          <Link to="/">&larr; Back to CartLink</Link>
        </p>
      </main>
    </div>
  );
};

export const PrivacyPage: React.FC = () => (
  <LegalPage title="Privacy Policy" updated="25 April 2026">
    <h2>Who we are</h2>
    <p>
      CartLink (the &ldquo;Service&rdquo;) is a personal shopping-list web app
      operated from the United Kingdom. Contact:{" "}
      <a href="mailto:hello@cartlink.co.uk">hello@cartlink.co.uk</a>.
    </p>

    <h2>What we collect</h2>
    <ul>
      <li>
        <strong>Account info from Google sign-in</strong> &mdash; your name,
        email address, profile photo URL and Google account ID. Provided by you
        when you choose &ldquo;Continue with Google&rdquo;.
      </li>
      <li>
        <strong>Your shopping list items</strong> &mdash; the text you enter and
        whether each item is checked off.
      </li>
      <li>
        <strong>Lists you publish for sharing</strong> &mdash; when you turn on
        sharing, a snapshot of your personal list (item text + checked state +
        your display name) is stored in a public-readable document so the share
        link/QR works.
      </li>
      <li>
        <strong>Anti-abuse signals</strong> &mdash; we use Google reCAPTCHA on
        the Sign-in screen, which collects browser/device signals to detect
        automated abuse.
      </li>
    </ul>

    <h2>What we don&apos;t collect</h2>
    <p>
      No analytics, no advertising trackers, no third-party cookies. We do not
      sell or rent any data.
    </p>

    <h2>How we use it</h2>
    <ul>
      <li>To sign you in and keep your list synced across your devices.</li>
      <li>
        To make share links / QR codes work when you explicitly turn sharing on.
      </li>
      <li>To protect the sign-in form from abuse (reCAPTCHA).</li>
    </ul>

    <h2>Where it lives</h2>
    <p>
      Your data is stored in Google Firebase (Authentication + Cloud Firestore)
      under our project. Google may process this data on servers in the
      EU/US/other regions per their{" "}
      <a
        href="https://firebase.google.com/support/privacy"
        target="_blank"
        rel="noopener noreferrer"
      >
        Firebase Privacy
      </a>{" "}
      policy.
    </p>

    <h2>Sharing &amp; visibility</h2>
    <p>
      Lists are private by default. When you click &ldquo;Start sharing&rdquo;,
      a snapshot of your personal list is published to a public document keyed
      by your account ID; anyone with your share link or QR code can read it.
      Click &ldquo;Stop sharing&rdquo; at any time to delete that public
      document.
    </p>

    <h2>Your rights</h2>
    <p>
      You can sign out at any time, stop sharing at any time, or email us to
      delete your account and all associated data. We&apos;ll process deletion
      requests within 30 days.
    </p>

    <h2>Children</h2>
    <p>CartLink is not directed at children under 13.</p>

    <h2>Changes</h2>
    <p>
      If we change this policy we&apos;ll update the date at the top of this
      page.
    </p>
  </LegalPage>
);

export const TermsPage: React.FC = () => (
  <LegalPage title="Terms of Service" updated="25 April 2026">
    <h2>Using CartLink</h2>
    <p>
      CartLink is provided free of charge for personal use. By using it you
      agree not to:
    </p>
    <ul>
      <li>Abuse, attack, or attempt to disrupt the Service.</li>
      <li>Use it for unlawful or harmful content.</li>
      <li>
        Attempt to access another user&apos;s account or non-public data.
      </li>
    </ul>

    <h2>Your content</h2>
    <p>
      You own anything you add to your lists. By turning on sharing for a list
      you give us permission to publish that list&apos;s content to a
      public-readable document, for as long as sharing is on.
    </p>

    <h2>Availability</h2>
    <p>
      The Service is provided &ldquo;as is&rdquo; with no warranty. We may add,
      remove, or change features at any time and may suspend the Service for
      maintenance.
    </p>

    <h2>Termination</h2>
    <p>
      You can stop using CartLink at any time. We may suspend or terminate
      access if you breach these terms.
    </p>

    <h2>Liability</h2>
    <p>
      To the fullest extent permitted by law, we are not liable for any
      indirect, incidental, or consequential loss arising from your use of the
      Service.
    </p>

    <h2>Governing law</h2>
    <p>
      These terms are governed by the laws of England &amp; Wales.
    </p>

    <h2>Contact</h2>
    <p>
      Questions? Email{" "}
      <a href="mailto:hello@cartlink.co.uk">hello@cartlink.co.uk</a>.
    </p>
  </LegalPage>
);
