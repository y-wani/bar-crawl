// src/pages/PrivacyPolicy.tsx

import React from "react";
import LegalLayout from "../components/LegalLayout";

const SUPPORT_EMAIL = "yashw118@gmail.com";

const PrivacyPolicy: React.FC = () => (
  <LegalLayout title="Privacy Policy" updated="June 16, 2026">
    <p className="legal-intro">
      This Privacy Policy explains what information BarHop ("BarHop", "we", "us")
      collects when you use the app at <strong>gobarhop.app</strong>, how we use
      it, and the choices you have. By using BarHop you agree to this policy.
    </p>

    <h2>Information we collect</h2>
    <h3>Account information</h3>
    <p>
      When you create an account we collect your <strong>email address</strong>{" "}
      and <strong>display name</strong>. If you sign in with Google, we receive
      your name, email address, and basic profile information from your Google
      account. We never receive or store your Google password.
    </p>
    <h3>Content you create</h3>
    <p>
      We store the bar crawls you build — selected venues, route order, start
      and end points, and any titles or notes you add — so you can save, edit,
      load, and share them.
    </p>
    <h3>Location data</h3>
    <p>
      With your permission, we use your device location to center the map near
      you and, during a Live Crawl, to register geofenced check-ins at venues.
      You can deny or revoke location access at any time in your browser or
      device settings; the app still works using a searched location instead.
    </p>
    <h3>Usage and device information</h3>
    <p>
      We collect basic technical and usage data (such as browser type, general
      region, and interactions) through privacy-focused analytics to keep the
      service reliable. We use cookies and local browser storage to keep you
      signed in and remember preferences (for example, your location-permission
      choice and whether you've seen the tutorial).
    </p>

    <h2>How we use your information</h2>
    <ul>
      <li>To authenticate you and provide the core features of BarHop.</li>
      <li>To save, sync, and let you share your bar crawls across sessions.</li>
      <li>To optimize routes and power Live Crawl check-ins.</li>
      <li>
        To protect the service — preventing abuse, fraud, and excessive
        automated requests through rate limiting and app-integrity checks.
      </li>
      <li>To maintain, troubleshoot, and improve the product.</li>
    </ul>

    <h2>Third-party services</h2>
    <p>
      BarHop relies on the following providers to operate. Each processes data
      under its own privacy policy:
    </p>
    <ul>
      <li>
        <strong>Google Firebase</strong> (Authentication and Firestore database)
        — stores your account and saved crawls.
      </li>
      <li>
        <strong>Google Maps Platform / Places API</strong> — provides venue
        information (names, ratings, hours, addresses).
      </li>
      <li>
        <strong>Google Gemini API</strong> — optional AI cleanup of bar lists
        you paste into the importer. Only the text you submit is processed.
      </li>
      <li>
        <strong>Mapbox</strong> — renders maps and provides geocoding and
        walking directions; this involves sending location and search queries to
        Mapbox.
      </li>
      <li>
        <strong>Vercel</strong> — hosts the application and provides analytics.
      </li>
      <li>
        <strong>Google reCAPTCHA / Firebase App Check</strong> — helps verify
        that requests come from the genuine app; this may collect device and
        usage signals as described in Google's policy.
      </li>
    </ul>
    <p>
      Our use of information received from Google APIs adheres to the{" "}
      <a
        href="https://developers.google.com/terms/api-services-user-data-policy"
        target="_blank"
        rel="noopener noreferrer"
      >
        Google API Services User Data Policy
      </a>
      , including its Limited Use requirements. We do not use Google user data
      for advertising, and we do not sell it.
    </p>

    <h2>How we share information</h2>
    <p>
      We do <strong>not</strong> sell your personal information. We share data
      only with the service providers above to operate BarHop, or when required
      by law. Note that any crawl you choose to share via a link can be opened by
      anyone who has that link.
    </p>

    <h2>Data retention &amp; deletion</h2>
    <p>
      We keep your account and crawl data until you delete it or ask us to. To
      delete your account and associated data, contact us at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will remove
      it within a reasonable period.
    </p>

    <h2>Security</h2>
    <p>
      Data is transmitted over encrypted connections (HTTPS), access to billed
      services is authenticated server-side, and database access is restricted by
      security rules. No method of transmission or storage is completely secure,
      so we cannot guarantee absolute security.
    </p>

    <h2>Your rights</h2>
    <p>
      Depending on where you live, you may have the right to access, correct,
      export, or delete your personal information, and to object to certain
      processing. To exercise these rights, contact us at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>

    <h2>Children &amp; eligibility</h2>
    <p>
      BarHop is intended for adults. It is not directed to anyone under 18, and
      you must be of legal drinking age in your jurisdiction to use features
      related to visiting bars. We do not knowingly collect information from
      children.
    </p>

    <h2>International users</h2>
    <p>
      Your information may be processed and stored in the United States and other
      countries where our providers operate. By using BarHop you consent to this
      transfer.
    </p>

    <h2>Changes to this policy</h2>
    <p>
      We may update this Privacy Policy from time to time. Material changes will
      be reflected by updating the "Last updated" date above; continued use of
      BarHop after changes means you accept the revised policy.
    </p>

    <h2>Contact us</h2>
    <p>
      Questions about this policy or your data? Email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </LegalLayout>
);

export default PrivacyPolicy;
