// src/pages/Terms.tsx

import React from "react";
import LegalLayout from "../components/LegalLayout";

const SUPPORT_EMAIL = "yashw118@gmail.com";
const GOVERNING_STATE = "Michigan";

const Terms: React.FC = () => (
  <LegalLayout title="Terms &amp; Conditions" updated="June 16, 2026">
    <p className="legal-intro">
      These Terms &amp; Conditions ("Terms") govern your use of BarHop at{" "}
      <strong>gobarhop.app</strong>. By creating an account or using the app, you
      agree to these Terms. If you do not agree, please do not use BarHop.
    </p>

    <h2>1. Eligibility</h2>
    <p>
      You must be at least 18 years old and of legal drinking age in your
      jurisdiction to use BarHop. By using the app you represent that you meet
      these requirements.
    </p>

    <h2>2. The service</h2>
    <p>
      BarHop is a planning tool that helps you discover bars and build, optimize,
      save, and share bar-crawl routes. Venue information (names, ratings, hours,
      prices, locations) comes from third-party providers and may be incomplete,
      outdated, or inaccurate. We do not guarantee the accuracy or availability
      of any venue, and you should confirm details directly before relying on
      them.
    </p>

    <h2>3. Your account</h2>
    <p>
      You are responsible for keeping your login credentials secure and for all
      activity under your account. Notify us promptly of any unauthorized use.
    </p>

    <h2>4. Acceptable use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Use BarHop for any unlawful purpose or in violation of these Terms.</li>
      <li>
        Attempt to scrape, reverse-engineer, or gain unauthorized access to the
        app, its APIs, or other users' data.
      </li>
      <li>
        Access the service through automated means or place an unreasonable load
        on our infrastructure or third-party APIs.
      </li>
      <li>
        Interfere with, disrupt, or attempt to circumvent the security, rate
        limits, or app-integrity protections of the service.
      </li>
    </ul>

    <h2>5. Your content</h2>
    <p>
      You retain ownership of the crawls and content you create. You grant us a
      limited license to store, process, and display that content as needed to
      operate the service for you. If you share a crawl via a link, you
      understand it becomes accessible to anyone who has that link.
    </p>

    <h2>6. Responsible enjoyment</h2>
    <p>
      BarHop promotes safe and responsible enjoyment of nightlife.{" "}
      <strong>Never drink and drive.</strong> Plan safe transportation, know
      your limits, look out for your group, and follow all applicable laws. You
      are solely responsible for your own conduct and decisions while using the
      app, and BarHop is not liable for any injury, loss, or damage arising from
      your activities.
    </p>

    <h2>7. Third-party services</h2>
    <p>
      BarHop integrates services from Google, Mapbox, Vercel, and others. Your
      use of features powered by these providers is also subject to their
      respective terms and policies.
    </p>

    <h2>8. Intellectual property</h2>
    <p>
      The BarHop name, branding, design, and software are owned by us and
      protected by applicable laws. These Terms do not grant you any right to use
      our trademarks or content except as necessary to use the app.
    </p>

    <h2>9. Disclaimers</h2>
    <p>
      BarHop is provided <strong>"as is"</strong> and <strong>"as available"</strong>{" "}
      without warranties of any kind, express or implied, including
      merchantability, fitness for a particular purpose, and non-infringement. We
      do not warrant that the service will be uninterrupted, error-free, or
      accurate.
    </p>

    <h2>10. Limitation of liability</h2>
    <p>
      To the maximum extent permitted by law, BarHop and its operators will not
      be liable for any indirect, incidental, special, consequential, or
      punitive damages, or for any loss arising from your use of (or inability to
      use) the service.
    </p>

    <h2>11. Termination</h2>
    <p>
      We may suspend or terminate access to BarHop at any time if you violate
      these Terms or to protect the service. You may stop using BarHop and
      request account deletion at any time.
    </p>

    <h2>12. Changes to these Terms</h2>
    <p>
      We may update these Terms from time to time. Changes are effective when we
      update the "Last updated" date above. Continued use of BarHop after changes
      means you accept the revised Terms.
    </p>

    <h2>13. Governing law</h2>
    <p>
      These Terms are governed by the laws of the State of {GOVERNING_STATE},
      United States, without regard to its conflict-of-laws rules.
    </p>

    <h2>14. Contact</h2>
    <p>
      Questions about these Terms? Email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </LegalLayout>
);

export default Terms;
