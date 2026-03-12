export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What Data We Collect</h2>
        <p className="text-gray-700 mb-3">
          Velocity AEO collects the following data from your Shopify store in order to
          provide automated SEO analysis and fixes:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Site URLs and page structure</li>
          <li>SEO metadata (title tags, meta descriptions, Open Graph tags)</li>
          <li>Theme file contents (Liquid templates) for applying fixes</li>
          <li>Google Search Console data (clicks, impressions, keywords) when connected</li>
          <li>Shopify store domain and admin API access token</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What We Do NOT Collect</h2>
        <p className="text-gray-700 mb-3">
          Velocity AEO does not access, store, or process:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Customer personally identifiable information (PII)</li>
          <li>Order data, transaction history, or financial records</li>
          <li>Payment information or credit card data</li>
          <li>Customer email addresses, phone numbers, or shipping addresses</li>
          <li>Product pricing or inventory quantities</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How Data Is Stored</h2>
        <p className="text-gray-700 mb-3">
          All data is stored in Supabase (PostgreSQL) with the following security measures:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Encryption at rest using AES-256</li>
          <li>Encryption in transit using TLS 1.2+</li>
          <li>Row-level security policies enforcing tenant isolation</li>
          <li>API access tokens stored as encrypted secrets via Doppler</li>
          <li>Audit logging of all data access and modifications</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Data Retention</h2>
        <p className="text-gray-700">
          Site data is retained for the duration of your subscription. When you uninstall
          the app or request deletion, all associated site data is removed within 30 days.
          Audit logs are retained for compliance purposes.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How to Request Deletion</h2>
        <p className="text-gray-700">
          To request deletion of your data, email us at{' '}
          <a href="mailto:support@velocityaeo.com" className="text-blue-600 hover:underline">
            support@velocityaeo.com
          </a>{' '}
          with your store domain. We will process deletion requests within 30 days.
          Uninstalling the app from Shopify also triggers automatic data deletion
          via the shop/redact GDPR webhook.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">GDPR Compliance</h2>
        <p className="text-gray-700">
          Velocity AEO complies with the General Data Protection Regulation (GDPR).
          We implement all mandatory Shopify GDPR webhooks: customers/redact,
          shop/redact, and customers/data_request. Since we do not store customer
          PII, data subject requests are acknowledged and logged. For shop
          uninstallation, all site data is automatically deleted.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-700">
          For privacy-related questions, contact us at{' '}
          <a href="mailto:support@velocityaeo.com" className="text-blue-600 hover:underline">
            support@velocityaeo.com
          </a>.
        </p>
      </section>
    </div>
  );
}
