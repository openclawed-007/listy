import React from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Check,
  Moon,
  QrCode,
  ShieldCheck,
  Smartphone,
  Tags,
  Undo2,
  Users,
  WifiOff,
  Zap,
} from "lucide-react";
import { isFirebaseConfigured } from "../firebase";
import BrandMark from "./BrandMark";
import GoogleSignInButton from "./GoogleSignInButton";
import "./Landing.css";

export const SITE_URL = "https://cartlink.co.uk";
export const GITHUB_URL = "https://github.com/openclawed-007/listy";
export const ANDROID_RELEASE_URL = `${GITHUB_URL}/releases/latest`;

const demoItems = [
  { text: "Oat milk", meta: "2 · Dairy", done: true },
  { text: "Sourdough", meta: "Bakery", done: false, live: true },
  { text: "Cherry tomatoes", meta: "Veg", done: false },
  { text: "Kitchen roll", meta: "Household", done: false },
  { text: "Coffee beans", meta: "1kg · Cupboard", done: false },
];

const features = [
  {
    icon: Zap,
    title: "Sync that keeps up with you",
    body: "Tick something off and it disappears from everyone's phone before you've reached the next aisle. No refresh button, no 'did you get the…?' texts.",
  },
  {
    icon: QrCode,
    title: "Share with a link or a QR code",
    body: "Print the QR and stick it on the fridge. Anyone in the house can scan it and they're looking at the live list. That's it. That's the onboarding.",
  },
  {
    icon: Users,
    title: "Helpers don't need an account",
    body: "Flip on guest editing and whoever scans the code can tick off and add items straight away. No sign-up wall for your flatmate who just wants to add crisps.",
  },
  {
    icon: ShieldCheck,
    title: "You decide who can do what",
    body: "Let people tick, add or remove — separately. The rules are enforced on the server, not just hidden in the interface, so a guest can never wipe your list.",
  },
  {
    icon: Tags,
    title: "Quantities and aisles, if you want them",
    body: "Add '2' and 'Dairy' and the list groups itself by aisle. Or don't, and it's just a list. The extra fields stay folded away until you need them.",
  },
  {
    icon: Undo2,
    title: "Undo, because thumbs slip",
    body: "Deleted the wrong thing in the queue? One tap brings it back. Confirmations only appear for the actions that actually deserve one.",
  },
  {
    icon: WifiOff,
    title: "Works in the basement supermarket",
    body: "No signal? Keep ticking. Changes are saved on your device and quietly synced the moment you're back online.",
  },
  {
    icon: Moon,
    title: "Dark mode that remembers",
    body: "A deep forest palette for late-night meal planning. Your preference is saved and there's no white flash when the page loads.",
  },
];

const faqs = [
  {
    q: "Is it actually free?",
    a: "Yes. There are no ads, no paid tier and nothing to unlock. CartLink is a small independent project, and the code is open on GitHub if you'd like to see exactly what it does.",
  },
  {
    q: "Do the people I share with need to sign up?",
    a: "Not if you don't want them to. Turn on guest editing and anyone with the link or QR code can tick things off and add items without an account. Only you — and signed-in collaborators you've explicitly allowed — can remove items.",
  },
  {
    q: "What happens if I lose signal in the shop?",
    a: "Carry on. Your changes are stored on the device and synced automatically when you're back online. The list you see is always the last one you had, not a blank screen.",
  },
  {
    q: "What do you do with my data?",
    a: "Your list lives in your own private space and nobody else can read it unless you turn on sharing. Signing in with Google gives us your name, email and photo so the app knows it's you — nothing more. The full details are in the privacy policy, and it's written in plain English.",
  },
  {
    q: "Is there an app?",
    a: "Two, really. The website installs to your home screen like an app and works offline. There's also a fully native Android app built in Kotlin that talks to the same list — grab the APK from the GitHub releases page.",
  },
];

const Landing: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="nav-brand" aria-label="CartLink home">
          <span className="nav-brand-icon">
            <BrandMark className="brand-mark" />
          </span>
          <span className="nav-brand-name">
            Cart<em>Link</em>
          </span>
        </Link>
        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#faq">FAQ</a>
          <Link to="/login" className="landing-nav-cta">
            Open my list
          </Link>
        </nav>
      </header>

      <main>
        {/* ---------- HERO ---------- */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-kicker">Shared shopping lists, done properly</p>
            <h1 id="hero-title" className="hero-title">
              Add it on the sofa.
              <br />
              Tick it off in <em>aisle four.</em>
            </h1>
            <p className="hero-sub">
              CartLink is a free shopping list that lives on every phone in your
              household at once. Share it with a link or a QR code on the fridge
              — the people you live with don&apos;t even need an account to
              help.
            </p>

            <div className="hero-actions">
              {isFirebaseConfigured ? (
                <GoogleSignInButton
                  className="hero-cta"
                  label="Start a list — it's free"
                />
              ) : (
                <Link to="/login" className="hero-cta">
                  Start a list — it&apos;s free
                </Link>
              )}
              <a href="#how" className="hero-secondary">
                See how it works <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>

            <ul className="hero-trust" aria-label="At a glance">
              <li>Free, no ads</li>
              <li>Works offline</li>
              <li>Open source</li>
              <li>Android app</li>
            </ul>
          </div>

          <div className="hero-demo" aria-hidden="true">
            <div className="demo-card">
              <div className="demo-card-head">
                <span className="demo-title">Weekly shop</span>
                <span className="demo-live">
                  <span className="demo-live-dot" />
                  Live
                </span>
              </div>
              <div className="demo-list">
                {demoItems.map((item, i) => (
                  <div
                    key={item.text}
                    className={[
                      "demo-row",
                      item.done ? "is-done" : "",
                      item.live ? "is-live" : "",
                    ]
                      .join(" ")
                      .trim()}
                    style={{ animationDelay: `${0.25 + i * 0.12}s` }}
                  >
                    <span className="demo-check">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <span className="demo-text">
                      <span className="demo-name">{item.text}</span>
                      <span className="demo-meta">{item.meta}</span>
                    </span>
                    {item.live && <span className="demo-who">Sam · just now</span>}
                  </div>
                ))}
              </div>
              <div className="demo-add">
                <span className="demo-add-text">
                  Lemons<span className="demo-caret" />
                </span>
                <span className="demo-add-btn">Add</span>
              </div>
            </div>
            <div className="demo-phone">
              <span className="demo-phone-label">Sam&apos;s phone</span>
              <div className="demo-phone-row">
                <span className="demo-check is-done">
                  <Check size={11} strokeWidth={3} />
                </span>
                Sourdough
              </div>
            </div>
          </div>
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section className="how" id="how" aria-labelledby="how-title">
          <div className="section-head">
            <p className="section-kicker">How it works</p>
            <h2 id="how-title" className="section-title">
              Three steps. The third one is optional.
            </h2>
          </div>
          <ol className="steps">
            <li className="step">
              <span className="step-num">01</span>
              <h3>Sign in with Google</h3>
              <p>
                One tap, no password to invent. Your list is created straight
                away and it&apos;s private until you say otherwise.
              </p>
            </li>
            <li className="step">
              <span className="step-num">02</span>
              <h3>Add what you need</h3>
              <p>
                Type it, hit enter, move on. Add a quantity or an aisle if it
                helps. Search and filter when the list gets long.
              </p>
            </li>
            <li className="step">
              <span className="step-num">03</span>
              <h3>Share it — or don&apos;t</h3>
              <p>
                Turn on sharing to get a link and a QR code. Choose whether
                helpers can tick, add or remove. Turn it off any time.
              </p>
            </li>
          </ol>
        </section>

        {/* ---------- QR SPOTLIGHT ---------- */}
        <section className="spotlight" aria-labelledby="spotlight-title">
          <div className="spotlight-qr">
            <div className="qr-frame">
              <QRCodeSVG
                value={SITE_URL}
                size={168}
                level="M"
                bgColor="transparent"
                fgColor="currentColor"
                marginSize={0}
              />
            </div>
            <p className="qr-caption">
              This one&apos;s real. Scan it and you&apos;re here.
            </p>
          </div>
          <div className="spotlight-copy">
            <p className="section-kicker">The fridge trick</p>
            <h2 id="spotlight-title" className="section-title">
              The best shared list is the one nobody had to install.
            </h2>
            <p>
              Most &ldquo;family list&rdquo; apps fail at the same step: getting
              everyone else to download the thing and make an account. CartLink
              skips it. Print your list&apos;s QR code, stick it on the fridge,
              and anyone who scans it is looking at the live list on their own
              phone — ticking and adding — without signing up for anything.
            </p>
            <p>
              You stay in control. Guests can never delete items, and you can
              switch sharing off whenever you like.
            </p>
            <Link to="/login" className="text-link">
              Make my list <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ---------- FEATURES ---------- */}
        <section className="features" id="features" aria-labelledby="features-title">
          <div className="section-head">
            <p className="section-kicker">What&apos;s in the box</p>
            <h2 id="features-title" className="section-title">
              Small app. Surprisingly thought-through.
            </h2>
            <p className="section-sub">
              Everything here exists because someone stood in a supermarket
              wishing it did.
            </p>
          </div>
          <ul className="feature-grid">
            {features.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="feature"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="feature-icon">
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- ANDROID ---------- */}
        <section className="android" aria-labelledby="android-title">
          <div className="android-inner">
            <span className="android-icon">
              <Smartphone size={26} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="android-copy">
              <h2 id="android-title">Prefer a proper app? There&apos;s a native one.</h2>
              <p>
                CartLink for Android is built in Kotlin with Jetpack Compose —
                no web view, real offline storage, and the same list as the
                website. Share links open straight into the app.
              </p>
            </div>
            <a
              className="android-btn"
              href={ANDROID_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download for Android
            </a>
          </div>
        </section>

        {/* ---------- HONESTY ---------- */}
        <section className="honest" aria-labelledby="honest-title">
          <div className="section-head">
            <p className="section-kicker">The boring bit, said plainly</p>
            <h2 id="honest-title" className="section-title">
              What CartLink doesn&apos;t do
            </h2>
          </div>
          <ul className="honest-list">
            <li>
              <strong>No ads.</strong> There&apos;s nothing to sell you and no
              &ldquo;premium&rdquo; button in the way.
            </li>
            <li>
              <strong>No selling your data.</strong> Your list is yours. Sharing
              is opt-in and you can turn it off.
            </li>
            <li>
              <strong>No account for helpers.</strong> Unless they want one.
            </li>
            <li>
              <strong>No mystery.</strong> The whole thing is open source on{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              . Read it, fork it, file a bug.
            </li>
          </ul>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="faq" id="faq" aria-labelledby="faq-title">
          <div className="section-head">
            <p className="section-kicker">Questions</p>
            <h2 id="faq-title" className="section-title">
              Things people ask before signing in
            </h2>
          </div>
          <div className="faq-list">
            {faqs.map(({ q, a }) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- FINAL CTA ---------- */}
        <section className="final" aria-labelledby="final-title">
          <h2 id="final-title" className="final-title">
            Your next shop could be the one where nothing gets forgotten.
          </h2>
          <p className="final-sub">
            Takes about ten seconds to start. Longer if you overthink the list
            name.
          </p>
          <div className="final-actions">
            {isFirebaseConfigured ? (
              <GoogleSignInButton
                className="hero-cta"
                label="Start a list — it's free"
              />
            ) : (
              <Link to="/login" className="hero-cta">
                Start a list — it&apos;s free
              </Link>
            )}
          </div>
          <p className="final-legal">
            By continuing you agree to our <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-brand">
          <span className="nav-brand-icon">
            <BrandMark className="brand-mark" />
          </span>
          <span>
            Made in the UK. &copy; {year} CartLink.
          </span>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={ANDROID_RELEASE_URL} target="_blank" rel="noopener noreferrer">
            Android
          </a>
          <a href="mailto:hello@cartlink.co.uk">hello@cartlink.co.uk</a>
        </nav>
      </footer>
    </div>
  );
};

export default Landing;
