import { NextResponse } from 'next/server';

const PRIVACY_POLICY = `Velocity AEO Privacy Policy
Last updated: March 2026

WHAT DATA WE COLLECT
Velocity AEO collects the following data from your Shopify store:
- Site URLs and page structure
- SEO metadata (title tags, meta descriptions, Open Graph tags)
- Theme file contents (Liquid templates) for applying fixes
- Google Search Console data (clicks, impressions, keywords) when connected
- Shopify store domain and admin API access token

WHAT WE DO NOT COLLECT
Velocity AEO does not access, store, or process:
- Customer personally identifiable information (PII)
- Order data, transaction history, or financial records
- Payment information or credit card data
- Customer email addresses, phone numbers, or shipping addresses
- Product pricing or inventory quantities

HOW DATA IS STORED
All data is stored in Supabase (PostgreSQL) with:
- Encryption at rest using AES-256
- Encryption in transit using TLS 1.2+
- Row-level security policies enforcing tenant isolation
- API access tokens stored as encrypted secrets via Doppler
- Audit logging of all data access and modifications

DATA RETENTION
Site data is retained for the duration of your subscription. When you
uninstall the app or request deletion, all associated site data is
removed within 30 days. Audit logs are retained for compliance purposes.

HOW TO REQUEST DELETION
Email support@velocityaeo.com with your store domain. We process
deletion requests within 30 days. Uninstalling the app from Shopify
also triggers automatic data deletion via the shop/redact GDPR webhook.

GDPR COMPLIANCE
Velocity AEO complies with the General Data Protection Regulation (GDPR).
We implement all mandatory Shopify GDPR webhooks: customers/redact,
shop/redact, and customers/data_request. Since we do not store customer
PII, data subject requests are acknowledged and logged. For shop
uninstallation, all site data is automatically deleted.

CONTACT
For privacy-related questions, contact support@velocityaeo.com.
`;

export async function GET() {
  return new NextResponse(PRIVACY_POLICY, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
