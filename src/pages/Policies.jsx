import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const POLICIES = {
  privacy: {
    title: 'Privacy Policy',
    updated: '1 April 2026',
    content: `
## 1. Introduction

CoreSite ("we", "our", "us") is committed to protecting and respecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use the CoreSite platform at coresite.io.

CoreSite is operated from the United Kingdom and complies with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.

**Data Controller:** CoreSite
**Contact:** joe@coresite.io
**Registered Address:** [To be confirmed]
**Company Registration Number:** [To be confirmed]

## 2. Data We Collect

### 2.1 Account Data
When you or your employer creates an account, we collect:
- Full name
- Email address
- Password (stored securely using industry-standard hashing)
- Role and job title
- Company association

### 2.2 Worker / Operative Data
When workers are registered on the platform, we may collect:
- Full name, date of birth, National Insurance number
- Home address and postcode
- Contact number and email address
- Employment type (full-time/part-time)
- Trade and role
- Profile photograph
- Emergency contact details (name, relationship, phone number)
- Medical conditions (if voluntarily provided)
- Site roles and certifications (SSSTS, SMSTS, Fire Marshal, First Aider)
- Training and work placement information
- CSCS card and certificate uploads

### 2.3 Signature Data
- Digital signatures (drawn on screen)
- Typed name confirmations
- Date of birth verification
- IP address at time of signing
- Timestamp of each signature

### 2.4 Site Compliance Data
- Snag reports including photographs and descriptions
- Progress drawing markings
- Toolbox talk attendance records
- Document sign-off records
- H&S report data

### 2.5 Technical Data
- IP address
- Browser type and version
- Device information
- Pages visited and actions taken
- Login timestamps

## 3. How We Use Your Data

We use your personal data to:
- Provide and operate the CoreSite platform
- Manage site inductions and RAMS sign-offs
- Track snagging and progress on construction projects
- Generate compliance reports and audit trails
- Send email notifications (invitations, assignments, completions)
- Verify operative identity during document signing
- Maintain health and safety records as required by law
- Improve the platform and user experience

### Legal Bases for Processing (UK GDPR Article 6)
- **Contractual necessity:** Processing required to provide the service
- **Legal obligation:** Health and safety record-keeping requirements
- **Legitimate interests:** Platform security, fraud prevention, service improvement
- **Consent:** Where specifically obtained (e.g., marketing communications)

## 4. Data Sharing

We do not sell your personal data. We may share data with:

- **Your employer/contractor:** Company administrators can view worker profiles and compliance records within their own company
- **Supabase (database provider):** Our database is hosted by Supabase Inc. Data is stored in the EU (Ireland, eu-west-1)
- **Vercel (hosting provider):** Our application is hosted by Vercel Inc.
- **Resend (email provider):** Used to send transactional emails
- **Law enforcement:** Where required by law or court order

## 5. Data Retention

- **Active accounts:** Data is retained for the duration of the account
- **Deleted accounts:** Personal data is deleted within 30 days of account deletion
- **Health & safety records:** Retained for a minimum of 40 years in accordance with UK construction industry requirements (CDM Regulations 2015)
- **Signature records:** Retained as long as the associated project records exist
- **Snagging data:** Retained for the duration of the project plus 12 years (limitation period for construction claims)

## 6. Data Security

We implement appropriate technical and organisational measures to protect your data:
- All data transmitted via HTTPS/TLS encryption
- Database hosted in EU data centres with encryption at rest
- Row-level security ensuring company data isolation
- Access controls based on user roles
- Regular security reviews

## 7. Your Rights

Under UK GDPR, you have the right to:
- **Access** your personal data (Subject Access Request)
- **Rectification** of inaccurate data
- **Erasure** ("right to be forgotten") where applicable
- **Restrict processing** in certain circumstances
- **Data portability** — receive your data in a structured format
- **Object** to processing based on legitimate interests
- **Withdraw consent** where processing is based on consent

To exercise these rights, contact joe@coresite.io. We will respond within one calendar month.

## 8. Cookies and Local Storage

See our Cookie Policy for details on cookies and local storage usage.

## 9. International Transfers

Your data is primarily stored in the EU (Ireland). Where data is transferred outside the UK/EU (e.g., to US-based service providers), appropriate safeguards are in place including Standard Contractual Clauses.

## 10. Children

CoreSite is not intended for use by individuals under 16 years of age. We do not knowingly collect data from children.

## 11. Changes to This Policy

We may update this policy from time to time. Material changes will be notified via email or in-app notification. The "last updated" date at the top indicates when this policy was last revised.

## 12. Contact & Complaints

For any data protection enquiries: **joe@coresite.io**

If you are unsatisfied with our response, you have the right to lodge a complaint with the Information Commissioner's Office (ICO):
- Website: ico.org.uk
- Phone: 0303 123 1113
`,
  },

  terms: {
    title: 'Terms of Service',
    updated: '1 April 2026',
    content: `
## 1. Agreement

These Terms of Service ("Terms") govern your use of the CoreSite platform at coresite.io ("the Platform"). By accessing or using the Platform, you agree to be bound by these Terms.

CoreSite is operated from the United Kingdom.

**Contact:** joe@coresite.io

## 2. Definitions

- **"Platform"** means the CoreSite web application at coresite.io
- **"Company"** means an organisation with a registered account on the Platform
- **"User"** means any individual with login credentials to the Platform
- **"Worker/Operative"** means an individual registered as a worker on the Platform
- **"Content"** means any data, documents, images, or information uploaded to the Platform

## 3. Account Registration

- Each Company account is created by CoreSite upon agreement
- Users are created by Company administrators or CoreSite
- You are responsible for maintaining the confidentiality of your login credentials
- You must notify us immediately of any unauthorised use of your account
- You must provide accurate and complete information

## 4. Acceptable Use

You agree NOT to:
- Use the Platform for any unlawful purpose
- Upload malicious software or code
- Attempt to access data belonging to other companies
- Share login credentials with unauthorised persons
- Use the Platform to harass, abuse, or harm others
- Attempt to reverse-engineer or decompile the Platform
- Use automated tools to scrape or extract data
- Upload false or misleading compliance records

## 5. Company Responsibilities

Each Company using the Platform is responsible for:
- Ensuring all Users comply with these Terms
- Obtaining necessary consent from Workers before entering their personal data
- Ensuring the accuracy of data entered into the Platform
- Managing User access and permissions within their organisation
- Complying with all applicable health and safety legislation
- Maintaining appropriate insurance

## 6. Data Ownership

- **Your data remains yours.** CoreSite does not claim ownership of any Content uploaded to the Platform
- You grant CoreSite a licence to store, process, and display your Content solely for the purpose of providing the Platform
- CoreSite may generate anonymised, aggregated statistics from usage data

## 7. Service Availability

- We aim for 99.9% uptime but do not guarantee uninterrupted service
- We may perform scheduled maintenance with reasonable notice
- We are not liable for downtime caused by third-party providers, internet outages, or force majeure events

## 8. Subscription and Payment

- Subscription plans and pricing are agreed separately with each Company
- Trial accounts are subject to usage limits and time restrictions
- We reserve the right to suspend accounts with overdue payments after 14 days' notice
- Refunds are handled on a case-by-case basis

## 9. Intellectual Property

- The Platform, its design, code, and branding are owned by CoreSite
- Company logos and branding uploaded to the Platform remain the property of the respective Company
- You may not copy, modify, or distribute any part of the Platform without written permission

## 10. Limitation of Liability

To the maximum extent permitted by law:
- CoreSite is not liable for any indirect, incidental, or consequential damages
- Our total liability shall not exceed the fees paid by the Company in the 12 months preceding the claim
- CoreSite is not liable for decisions made based on data stored in the Platform
- The Platform supplements but does not replace proper health and safety procedures

## 11. Indemnification

You agree to indemnify CoreSite against any claims, damages, or expenses arising from:
- Your breach of these Terms
- Your use of the Platform
- Content you upload to the Platform
- Your violation of any applicable law

## 12. Termination

- Either party may terminate with 30 days' written notice
- We may suspend or terminate accounts that breach these Terms immediately
- Upon termination, you may request an export of your data within 30 days
- After 30 days, data may be permanently deleted

## 13. Governing Law

These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.

## 14. Changes to Terms

We may update these Terms from time to time. Continued use of the Platform after changes constitutes acceptance. Material changes will be notified via email.

## 15. Severability

If any provision of these Terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.

## 16. Contact

For any questions about these Terms: **joe@coresite.io**
`,
  },

  cookies: {
    title: 'Cookie Policy',
    updated: '1 April 2026',
    content: `
## 1. Introduction

This Cookie Policy explains how CoreSite uses cookies and similar technologies when you use our platform at coresite.io.

## 2. What Are Cookies?

Cookies are small text files stored on your device by your web browser. They help websites remember information about your visit.

## 3. Cookies We Use

### 3.1 Essential / Strictly Necessary
These are required for the Platform to function. They cannot be disabled.

| Name | Purpose | Duration |
|------|---------|----------|
| Session storage | Stores your login session and user data | Until browser is closed |
| coresite-theme | Stores your light/dark mode preference | Persistent |

### 3.2 Functional
These remember your preferences and settings.

| Name | Purpose | Duration |
|------|---------|----------|
| localStorage items | Stores UI preferences (sidebar state, etc.) | Persistent |

### 3.3 Third-Party
We use the following third-party services which may set their own cookies:

- **Supabase** — Database and authentication provider
- **Vercel** — Hosting and analytics
- **Resend** — Email delivery tracking

## 4. Local Storage

In addition to cookies, we use browser Local Storage to:
- Store your theme preference (light/dark mode)
- Cache certain UI state for performance

## 5. Managing Cookies

You can control cookies through your browser settings:
- **Chrome:** Settings > Privacy and Security > Cookies
- **Firefox:** Settings > Privacy & Security > Cookies
- **Safari:** Preferences > Privacy > Cookies
- **Edge:** Settings > Cookies and Site Permissions

Note: Disabling essential cookies will prevent the Platform from functioning correctly.

## 6. Changes

We may update this Cookie Policy from time to time. Changes will be posted on this page.

## 7. Contact

For questions about our use of cookies: **joe@coresite.io**
`,
  },

  acceptable: {
    title: 'Acceptable Use Policy',
    updated: '1 April 2026',
    content: `
## 1. Purpose

This Acceptable Use Policy sets out the rules for using the CoreSite platform. All Users must comply with this policy.

## 2. Permitted Use

The Platform may only be used for:
- Managing construction site inductions and RAMS sign-offs
- Recording toolbox talks and attendees
- Tracking snagging and remedial works
- Monitoring M&E installation progress
- Generating health and safety compliance reports
- Managing worker registrations and profiles
- Any other lawful purpose related to construction site compliance

## 3. Prohibited Use

You must NOT:
- **Upload illegal content** — including but not limited to content that is defamatory, obscene, or violates any person's rights
- **Falsify records** — enter false compliance data, forge signatures, or fabricate attendance records
- **Compromise security** — attempt to gain unauthorised access, probe for vulnerabilities, or introduce malware
- **Abuse the system** — use the Platform to send spam, conduct phishing, or harass users
- **Extract data** — scrape, crawl, or bulk-download data from the Platform
- **Impersonate others** — create accounts or sign documents on behalf of others without authorisation
- **Circumvent controls** — bypass access restrictions, role-based permissions, or company isolation measures
- **Overload the system** — make excessive API calls or take actions intended to degrade performance

## 4. Content Standards

All Content uploaded to the Platform must:
- Be accurate and not misleading
- Comply with applicable UK laws and regulations
- Not infringe any third party's intellectual property rights
- Not contain personal data of individuals without proper authorisation

## 5. Reporting Violations

If you become aware of any violation of this policy, report it immediately to **joe@coresite.io**.

## 6. Enforcement

Violations may result in:
- Warning and request to remedy the breach
- Temporary suspension of access
- Permanent termination of account
- Legal action where appropriate

We reserve the right to remove any Content that violates this policy without notice.

## 7. Contact

For questions about this policy: **joe@coresite.io**
`,
  },
}

function MarkdownRenderer({ content }) {
  // Simple markdown-to-HTML renderer for policies
  const html = content
    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold mt-6 mb-2" style="color:var(--text-primary)">$1</h2>')
    .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-1" style="color:var(--text-primary)">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p class="mb-3 text-sm leading-relaxed" style="color:var(--text-secondary)">')
    .replace(/\n- (.*)/g, '<li class="ml-4 text-sm" style="color:var(--text-secondary);list-style:disc">$1</li>')
    .replace(/\| (.*?) \| (.*?) \| (.*?) \|/g, '<tr><td class="border px-2 py-1 text-xs" style="border-color:var(--border-color)">$1</td><td class="border px-2 py-1 text-xs" style="border-color:var(--border-color)">$2</td><td class="border px-2 py-1 text-xs" style="border-color:var(--border-color)">$3</td></tr>')
    .replace(/\|.*?\|.*?\|.*?\|/g, '') // remove table separator rows
  return <div dangerouslySetInnerHTML={{ __html: `<p class="mb-3 text-sm leading-relaxed" style="color:var(--text-secondary)">${html}</p>` }} />
}

export default function Policies() {
  const { policyId } = useParams()
  const navigate = useNavigate()
  const policy = POLICIES[policyId]

  if (!policy) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: 'var(--bg-main)' }}>
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Policy not found</h1>
          <Link to="/" className="text-sm" style={{ color: 'var(--primary-color)' }}>Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--bg-main)' }}>
      <header className="bg-[#1A2744] px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 text-white/60 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <img src="/coresite-logo.svg" alt="CoreSite" className="h-7 brightness-0 invert" />
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-xl p-6 sm:p-8" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{policy.title}</h1>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>Last updated: {policy.updated}</p>
          <MarkdownRenderer content={policy.content} />
        </div>

        <div className="mt-8 text-center space-x-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          {Object.entries(POLICIES).map(([key, p]) => (
            <Link key={key} to={`/policies/${key}`} className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{p.title}</Link>
          ))}
        </div>

        <p className="text-center text-[10px] mt-4" style={{ color: 'var(--text-muted)' }}>
          &copy; {new Date().getFullYear()} CoreSite — Site Compliance Platform
        </p>
      </div>
    </div>
  )
}
