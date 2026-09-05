export const SUPPORT_EMAIL = "support@robopartpicker.com";
export const LEGAL_EFFECTIVE_DATE = "August 30, 2026";

export const LEGAL_DOCUMENT_IDS = [
  "legal",
  "privacy",
  "terms",
  "cookies",
  "acceptable-use",
  "marketplace-terms",
  "ai-notice",
  "intellectual-property",
  "accessibility",
  "contact",
] as const;

export type LegalDocumentId = typeof LEGAL_DOCUMENT_IDS[number];

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocument = {
  id: LegalDocumentId;
  path: `/${LegalDocumentId}`;
  title: string;
  shortTitle: string;
  description: string;
  summary: string;
  effectiveDate: string;
  updatedDate: string;
  sections: LegalSection[];
  related: LegalDocumentId[];
};

const document = (
  id: LegalDocumentId,
  title: string,
  shortTitle: string,
  description: string,
  summary: string,
  sections: LegalSection[],
  related: LegalDocumentId[],
): LegalDocument => ({ id, path: `/${id}`, title, shortTitle, description, summary, effectiveDate: LEGAL_EFFECTIVE_DATE, updatedDate: LEGAL_EFFECTIVE_DATE, sections, related });

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  legal: document(
    "legal",
    "Legal center",
    "Legal center",
    "RoboPartPicker policies, product notices, marketplace terms, accessibility information, and contact channels.",
    "These documents explain how RoboPartPicker operates today, what users can expect, and where important limits still apply.",
    [
      {
        id: "using-these-documents",
        title: "Using these documents",
        paragraphs: [
          "This legal center collects the policies and notices that apply to RoboPartPicker accounts, projects, bills of materials, builds, community features, AI tools, completed quotes, and marketplace records.",
          "The documents describe the deployed service and are not a representation that every legal requirement in every jurisdiction has been satisfied. Mandatory rights under applicable law are not limited by these documents.",
        ],
      },
      {
        id: "operator-and-contact",
        title: "Operator and contact",
        paragraphs: [
          `The public operator identity is RoboPartPicker. General support, privacy requests, legal notices, accessibility reports, security reports, and intellectual-property requests can be sent to ${SUPPORT_EMAIL}.`,
          "A registered legal entity name and business address are not currently published. Some jurisdictions and future payment or marketplace providers may require additional operator information before commercial launch.",
        ],
      },
      {
        id: "current-product-boundaries",
        title: "Current product boundaries",
        paragraphs: [
          "RoboPartPicker provides source-linked robotics information and Beta workflows. It does not certify engineering safety, compatibility, legal rights, supplier performance, inventory, or manufacturing outcomes.",
          "RoboPartPicker does not process marketplace payments, provide escrow, arrange shipping, inspect goods, or become a transaction party. Completed quotes are nonbinding price snapshots and AI output can be inaccurate.",
        ],
      },
      {
        id: "policy-index",
        title: "Policy index",
        paragraphs: ["Use the related policy links on this page to review the document that applies to your activity."],
        bullets: [
          "Privacy Policy for personal information and data rights",
          "Terms of Service for account and platform rules",
          "Cookies and Storage Policy for essential browser technologies",
          "Acceptable Use Policy for prohibited conduct",
          "Marketplace Terms for listings and direct user transactions",
          "AI Notice for Beta model-assisted features",
          "Intellectual Property Policy for user and upstream materials",
          "Accessibility Statement for barriers and alternative formats",
          "Contact page for support and formal requests",
        ],
      },
    ],
    ["privacy", "terms", "cookies", "acceptable-use", "marketplace-terms", "ai-notice", "intellectual-property", "accessibility", "contact"],
  ),

  privacy: document(
    "privacy",
    "Privacy Policy",
    "Privacy",
    "How RoboPartPicker collects, uses, stores, shares, and protects account, project, marketplace, community, and technical data.",
    "This policy explains personal-information processing, public visibility, infrastructure providers, analytics, retention, and user rights.",
    [
      {
        id: "scope-and-controller",
        title: "Scope and operator",
        paragraphs: [
          `This Privacy Policy applies to RoboPartPicker websites, APIs, account features, and connected services. RoboPartPicker is the public operator identity. Privacy questions and rights requests can be sent to ${SUPPORT_EMAIL}.`,
          "This policy does not control third-party websites, repositories, manufacturers, suppliers, AI providers, or services linked from RoboPartPicker. Their own policies apply when you leave the service or authorize their processing.",
        ],
      },
      {
        id: "information-we-process",
        title: "Information we process",
        paragraphs: ["The information processed depends on the features you use."],
        bullets: [
          "Account data such as name, email, verification status, profile image, authentication-provider records, sessions, roles, and organization memberships",
          "Projects, RPPS releases, BOMs, builds, files, project claims, evidence, organization records, community posts, notifications, marketplace listings, wanted requests, offer or message records, quote drafts, and quote recipients",
          "Google OAuth profile data when Google authentication is enabled, limited to identity information needed for sign-in such as name, email, and profile image",
          "AI prompts, conversation messages, selected catalog context, model output, and proposal status when AI features are used",
          "Request metadata used for service delivery, security, abuse prevention, debugging, and rate limiting",
          "Daily aggregate traffic and interaction counts that intentionally exclude raw search text, user identity, fingerprint, per-person history, and raw IP addresses from the analytics tables",
        ],
      },
      {
        id: "purposes",
        title: "Why we process information",
        paragraphs: ["RoboPartPicker processes information to provide requested services, maintain platform integrity, and meet legitimate operational or legal needs."],
        bullets: [
          "Authenticate users and secure accounts",
          "Store and publish content according to selected visibility settings",
          "Operate project, BOM, build, community, marketplace, quote, and organization workflows",
          "Respond to support, privacy, legal, safety, accessibility, and intellectual-property requests",
          "Detect abuse, enforce platform rules, rate-limit traffic, investigate faults, and preserve service security",
          "Generate daily aggregate product analytics and improve navigation and catalog quality",
          "Provide AI-assisted features at the user's request",
        ],
      },
      {
        id: "hosting-and-providers",
        title: "Hosting and service providers",
        paragraphs: [
          "Cloudflare provides website delivery and security services. Structured application records are stored in Cloudflare D1 and uploaded files are stored in Cloudflare R2. Cloudflare may process network identifiers and request metadata as part of content delivery, security, and platform operations.",
          "Google processes authentication data when Google OAuth is enabled and selected. A configured AI provider processes prompts and the minimum context sent for an AI request. Email-delivery and repository providers may process information when those optional integrations are configured and used.",
          "Information may be processed in countries other than the user's country. Provider contractual and technical safeguards apply according to each service and applicable law.",
        ],
      },
      {
        id: "cookies-and-analytics",
        title: "Cookies, browser storage, and analytics",
        paragraphs: [
          "RoboPartPicker uses essential authentication cookies to maintain secure sign-in sessions. Short-lived browser storage may preserve interface state or an in-progress import on the user's device.",
          "First-party traffic and interaction analytics are aggregated by day and do not use a dedicated analytics cookie. The analytics tables do not intentionally store raw IP addresses, cookies, user identities, fingerprints, raw search text, session histories, or per-person event trails.",
          "Cloudflare and security systems may process IP addresses and request metadata transiently or in keyed or derived form for delivery, abuse prevention, and security. See the Cookies and Storage Policy for details.",
        ],
      },
      {
        id: "public-content",
        title: "Public and private content",
        paragraphs: [
          "Projects, files, posts, listings, profiles, and other records can be public, unlisted, organization-scoped, or private depending on the feature and selected setting. Public content can be viewed, copied, indexed, archived, or redistributed by others outside RoboPartPicker.",
          "Private project-claim evidence, private builds, private organization records, account sessions, administrative analytics, and protected quote information are restricted by server authorization. No online system can guarantee absolute security.",
        ],
      },
      {
        id: "retention-and-deletion",
        title: "Retention and deletion",
        paragraphs: [
          "Information is retained while an account or record is active and as reasonably needed for service operation, security, dispute handling, abuse prevention, backups, and legal obligations. Retention varies by data type and operational context.",
          `Users can use available deletion controls or contact ${SUPPORT_EMAIL} to request access, correction, export, restriction, objection, or deletion. RoboPartPicker may need to verify identity and may retain limited records where required for security, legal obligations, or the rights of others.`,
        ],
      },
      {
        id: "children-and-changes",
        title: "Children and policy changes",
        paragraphs: [
          "RoboPartPicker is not directed to children under 13. Users must meet the minimum age required to consent to online services in their jurisdiction, and users under the age of legal majority must have appropriate guardian permission. Marketplace activity is intended for adults capable of entering agreements.",
          "This policy may be updated when the service or legal requirements change. The updated date identifies the current version. Material changes may be communicated through the website or account channels where practical.",
        ],
      },
    ],
    ["cookies", "terms", "ai-notice", "contact"],
  ),

  terms: document(
    "terms",
    "Terms of Service",
    "Terms",
    "Rules governing RoboPartPicker accounts, content, projects, builds, AI tools, completed quotes, community, and marketplace features.",
    "These Terms govern use of RoboPartPicker and allocate responsibility for content, engineering decisions, transactions, and Beta features.",
    [
      {
        id: "acceptance-and-eligibility",
        title: "Acceptance and eligibility",
        paragraphs: [
          "By accessing or using RoboPartPicker, you agree to these Terms and the policies incorporated by reference. If you do not agree, do not use the service.",
          "You must be at least 13 and legally able to use online services. Users below the age of legal majority need guardian permission. Marketplace publishing and transactions are intended for adults able to enter binding agreements.",
        ],
      },
      {
        id: "accounts",
        title: "Accounts and security",
        paragraphs: [
          "Provide accurate account information, protect authentication methods, and promptly report suspected compromise. You are responsible for activity through your account unless applicable law provides otherwise.",
          "RoboPartPicker may limit, suspend, or terminate accounts to protect users, enforce these Terms, comply with law, or address abuse. Features can change, pause, or be withdrawn, especially when marked Beta or Coming soon.",
        ],
      },
      {
        id: "content-and-licenses",
        title: "User content and licenses",
        paragraphs: [
          "You retain ownership of content you lawfully own. You grant RoboPartPicker a worldwide, non-exclusive, royalty-free license to host, reproduce, format, display, index, distribute, and technically process submitted content as needed to operate and promote the service according to its visibility setting.",
          "You must have the rights and permissions required to submit content. Upstream projects, documentation, CAD, firmware, images, trademarks, and datasets remain subject to their upstream licenses and rights. RoboPartPicker records do not replace license review.",
        ],
      },
      {
        id: "robotics-and-technical-risk",
        title: "Robotics and technical risk",
        paragraphs: [
          "Robotics projects can cause injury, fire, electrical hazards, mechanical failure, property damage, privacy harm, or regulatory violations. Records can be incomplete, stale, incompatible, or wrong.",
          "You are responsible for engineering review, professional advice where appropriate, safe construction and operation, testing, supervision, protective systems, laws, export controls, permits, standards, and upstream licenses. RoboPartPicker does not provide an engineering certification or safety approval.",
        ],
      },
      {
        id: "beta-ai-and-quotes",
        title: "Beta features, AI, and completed quotes",
        paragraphs: [
          "Project import and BOM generation, AI Assistant, completed quotes, marketplace publishing, and build or reproduction workflows are Beta. Beta features may contain errors, lose functionality, or change without notice.",
          "AI output can be inaccurate and is not engineering advice, legal advice, procurement advice, safety advice, financial advice, or professional advice. Verify every material claim against authoritative sources.",
          "A completed quote is a nonbinding price snapshot based on available internal observations. It does not guarantee identity, compatibility, inventory, fulfillment, shipping, tax, payment, purchase, or supplier performance.",
        ],
      },
      {
        id: "marketplace",
        title: "Marketplace",
        paragraphs: [
          "RoboPartPicker does not process marketplace payments, and it is not a transaction party. It does not provide escrow, shipping, inspection, KYC, returns, refunds, warranties, or dispute resolution for user transactions.",
          "Buyers and sellers are responsible for identity, authority, legality, condition, pricing, taxes, payment, delivery, export and import rules, safety, insurance, and disputes. Marketplace Terms apply in addition to these Terms.",
        ],
      },
      {
        id: "disclaimers-and-liability",
        title: "Disclaimers and liability",
        paragraphs: [
          "The service is provided on an as-available basis. To the maximum extent permitted by applicable law, RoboPartPicker disclaims implied warranties, including merchantability, fitness for a particular purpose, title, non-infringement, accuracy, availability, and safety.",
          "To the maximum extent permitted by applicable law, RoboPartPicker is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, personal injury caused by user engineering decisions, or losses arising from third-party transactions. Mandatory consumer and statutory rights remain unaffected.",
        ],
      },
      {
        id: "changes-and-contact",
        title: "Changes, severability, and contact",
        paragraphs: [
          "RoboPartPicker may update these Terms as the service changes. Continued use after an effective update constitutes acceptance where permitted by law. If one provision cannot be enforced, the remaining provisions continue to apply.",
          `Questions or legal notices can be sent to ${SUPPORT_EMAIL}. No governing jurisdiction, registered entity, arbitration forum, or business address is represented beyond information explicitly published by RoboPartPicker.`,
        ],
      },
    ],
    ["privacy", "acceptable-use", "marketplace-terms", "ai-notice", "intellectual-property", "contact"],
  ),

  cookies: document(
    "cookies",
    "Cookies and Storage Policy",
    "Cookies and storage",
    "Essential cookies, browser storage, aggregate analytics, and future consent requirements on RoboPartPicker.",
    "RoboPartPicker currently uses essential authentication cookies and limited browser storage, not a dedicated advertising or analytics cookie.",
    [
      {
        id: "essential-cookies",
        title: "Essential authentication cookies",
        paragraphs: [
          "RoboPartPicker uses secure, HTTP-only authentication cookies to keep signed-in sessions working, protect account routes, and reduce unauthorized access. These cookies are necessary for requested account functionality.",
          "Disabling essential cookies can prevent sign-in, organization access, private builds, notifications, publishing, and other account features from working.",
        ],
      },
      {
        id: "browser-storage",
        title: "Browser storage",
        paragraphs: [
          "The browser may store short-lived interface or workflow state, such as an in-progress project-import analysis. This storage stays on the device unless the user submits the information to RoboPartPicker.",
          "Browser settings can clear this state. Clearing it may reset unfinished forms or preferences.",
        ],
      },
      {
        id: "analytics",
        title: "Aggregate analytics",
        paragraphs: [
          "RoboPartPicker's first-party analytics aggregate page views and allowlisted interactions by day. The analytics system does not rely on a dedicated non-essential analytics cookie and does not intentionally create per-person event histories.",
          "Cloudflare may use its own necessary security and delivery technologies under its service terms. Request metadata may also be processed for rate limiting and abuse prevention.",
        ],
      },
      {
        id: "future-changes",
        title: "Future non-essential technologies",
        paragraphs: [
          "RoboPartPicker does not currently use advertising cookies or third-party behavioral tracking cookies. If non-essential cookies or similar technologies are introduced, this policy will be updated and an appropriate consent control will be provided before use where required.",
          `Questions can be sent to ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
    ["privacy", "terms", "contact"],
  ),

  "acceptable-use": document(
    "acceptable-use",
    "Acceptable Use Policy",
    "Acceptable use",
    "Conduct and content rules for RoboPartPicker accounts, APIs, projects, community, AI tools, uploads, and marketplace features.",
    "Use RoboPartPicker lawfully, honestly, safely, and without harming users, infrastructure, rights holders, or third parties.",
    [
      {
        id: "unlawful-and-harmful-use",
        title: "Unlawful and harmful use",
        paragraphs: ["Do not use RoboPartPicker to facilitate unlawful activity or material harm."],
        bullets: [
          "No illegal, stolen, counterfeit, controlled, sanctioned, or export-restricted goods or services",
          "No credible threats, harassment, exploitation, doxxing, hateful abuse, or non-consensual personal information",
          "No unsafe robotics instructions presented as certified, tested, or professionally approved when they are not",
          "No fraud, deceptive impersonation, false ownership, fabricated evidence, manipulated reviews, or misleading prices and availability",
        ],
      },
      {
        id: "security-and-access",
        title: "Security and access",
        paragraphs: ["Do not compromise or misuse the platform, accounts, data, or connected services."],
        bullets: [
          "No malware, credential theft, phishing, destructive payloads, or unauthorized code execution",
          "No bypassing authentication, authorization, rate limits, safety checks, moderation, or access controls",
          "No probing or exploiting vulnerabilities except through a lawful, good-faith report that avoids harm and data access",
          "No automated traffic that disrupts service, evades limits, or collects protected information without authorization",
        ],
      },
      {
        id: "content-and-intellectual-property",
        title: "Content and intellectual property",
        paragraphs: [
          "Submit only content you are authorized to use. Preserve upstream licenses, notices, attribution, source identity, and modification history where required.",
          "Do not upload private repositories, trade secrets, personal data, proprietary CAD, copyrighted media, or confidential documents without permission.",
        ],
      },
      {
        id: "enforcement-and-reporting",
        title: "Enforcement and reporting",
        paragraphs: [
          "RoboPartPicker may remove content, limit features, suspend accounts, preserve evidence, or report activity when reasonably necessary to enforce policy, protect users, or comply with law.",
          `Report suspected abuse to ${SUPPORT_EMAIL} with the relevant URL, account, evidence, and a concise explanation. Do not include passwords, tokens, private keys, or unrelated sensitive information.`,
        ],
      },
    ],
    ["terms", "marketplace-terms", "intellectual-property", "contact"],
  ),

  "marketplace-terms": document(
    "marketplace-terms",
    "Marketplace Terms",
    "Marketplace terms",
    "Terms for RoboPartPicker listings, wanted requests, offers, messages, and direct user transactions.",
    "The marketplace is a Beta information and communication layer. Users remain responsible for every transaction and product decision.",
    [
      {
        id: "platform-role",
        title: "RoboPartPicker's role",
        paragraphs: [
          "RoboPartPicker provides listing, wanted-request, evidence, offer, and internal-message records. RoboPartPicker is not a seller, buyer, broker, manufacturer, inspection service, payment processor, shipper, insurer, or transaction party.",
          "RoboPartPicker does not process marketplace payments, escrow, refunds, returns, shipping, tax, KYC, product inspection, or transaction guarantees. An offer record is a negotiation record, not a completed purchase.",
        ],
      },
      {
        id: "seller-responsibilities",
        title: "Seller and publisher responsibilities",
        paragraphs: ["A listing publisher must have authority to offer the item or service and must provide honest, current information."],
        bullets: [
          "Accurately identify the item, manufacturer, part number, revision, condition, quantity, price basis, location or region, and known defects",
          "Disclose whether images, test reports, ownership, stock, compatibility, safety, and provenance claims are verified or merely asserted",
          "Do not list stolen, counterfeit, recalled, prohibited, sanctioned, unsafe, or unlawfully exported goods",
          "Preserve applicable warranties, consumer rights, taxes, licenses, permits, export controls, and product-safety obligations",
        ],
      },
      {
        id: "buyer-responsibilities",
        title: "Buyer and requester responsibilities",
        paragraphs: [
          "Buyers and requesters must independently verify identity, condition, compatibility, authority, price, shipping, taxes, export or import status, and counterparty trust before exchanging money or goods.",
          "Robotics parts and systems can be dangerous. Arrange appropriate inspection, testing, professional review, insurance, safe transport, and safe construction and operation.",
        ],
      },
      {
        id: "disputes-and-removal",
        title: "Disputes, records, and removal",
        paragraphs: [
          "Users resolve transaction disputes directly with each other and any payment or shipping provider they selected outside RoboPartPicker. RoboPartPicker may preserve or remove records for safety, moderation, legal, or evidentiary reasons.",
          `Report suspected fraud, stolen goods, dangerous listings, counterfeit goods, or rights violations to ${SUPPORT_EMAIL}. RoboPartPicker does not promise recovery, reimbursement, enforcement, or dispute adjudication.`,
        ],
      },
    ],
    ["terms", "acceptable-use", "privacy", "intellectual-property", "contact"],
  ),

  "ai-notice": document(
    "ai-notice",
    "AI Transparency and Safety Notice",
    "AI notice",
    "How RoboPartPicker Beta AI features process prompts, use catalog context, create output, and require human verification.",
    "AI features can assist research and drafting, but they do not certify facts, engineering, safety, procurement, or legal rights.",
    [
      {
        id: "beta-status",
        title: "Beta status",
        paragraphs: [
          "The AI Assistant, AI drafting, AI review, and related model-assisted workflows are Beta. They can be unavailable, incomplete, inconsistent, or changed without notice.",
          "AI output can be inaccurate, outdated, incomplete, fabricated, or unsuitable for a specific application. A confident tone is not evidence of correctness.",
        ],
      },
      {
        id: "data-sent-to-providers",
        title: "Data sent to AI providers",
        paragraphs: [
          "When a user requests an AI feature, RoboPartPicker may send the prompt, selected conversation messages, requested form fields, and the minimum relevant catalog or project context to the configured AI provider. The provider processes that information under its own terms and policies.",
          "Do not enter passwords, authentication tokens, private keys, payment data, government identifiers, confidential designs, personal information about others, or material you are not authorized to share.",
        ],
      },
      {
        id: "required-verification",
        title: "Required human verification",
        paragraphs: [
          "AI output is not engineering advice, safety advice, legal advice, procurement advice, financial advice, medical advice, or professional advice. Verify material claims against authoritative manufacturer, repository, regulatory, and professional sources.",
          "AI does not certify component compatibility, BOM completeness, price, stock, source licenses, build safety, robot performance, ownership, or legal compliance. Users remain responsible for decisions and actions.",
        ],
      },
      {
        id: "proposals-and-contact",
        title: "AI proposals and reporting",
        paragraphs: [
          "Where an AI tool proposes a mutation, the proposal should remain reviewable before application. Server authorization and validation, not the model prompt, control protected actions.",
          `Report harmful, privacy-invasive, or materially incorrect AI behavior to ${SUPPORT_EMAIL} with the affected page and enough non-sensitive context to reproduce it.`,
        ],
      },
    ],
    ["privacy", "terms", "acceptable-use", "contact"],
  ),

  "intellectual-property": document(
    "intellectual-property",
    "Intellectual Property and Takedown Policy",
    "Intellectual property",
    "Ownership, upstream licensing, user-content permissions, attribution, and takedown requests on RoboPartPicker.",
    "RoboPartPicker distinguishes its platform materials, user submissions, and upstream robotics resources, each of which can have different rights.",
    [
      {
        id: "platform-materials",
        title: "RoboPartPicker materials",
        paragraphs: [
          "RoboPartPicker's brand, interface, original text, software, and original data organization are protected to the extent provided by applicable law and project licensing. No trademark license is granted by use of the service.",
          "Public APIs and RPPS materials can have separately stated licenses. Review the repository and applicable files before reuse.",
        ],
      },
      {
        id: "user-and-upstream-content",
        title: "User and upstream content",
        paragraphs: [
          "Users retain rights they lawfully hold and grant the operational license described in the Terms of Service. Users must have permission to upload, publish, transform, or distribute submitted material.",
          "Repository content, CAD, firmware, documentation, images, logos, manufacturer data, and other upstream materials retain their upstream licenses, attribution, trademarks, and restrictions. A RoboPartPicker record does not grant rights beyond the applicable upstream licenses.",
        ],
      },
      {
        id: "takedown-requests",
        title: "Takedown and correction requests",
        paragraphs: [
          `Send intellectual-property or attribution requests to ${SUPPORT_EMAIL}. RoboPartPicker has no registered DMCA agent and does not represent that this process replaces any formal statutory notice procedure.`,
          "A useful request should identify the requester, the protected work or right, the exact RoboPartPicker URL, the allegedly infringing material, the requested action, contact information, and a good-faith explanation of authority and accuracy.",
        ],
      },
      {
        id: "review-and-counter-information",
        title: "Review and response",
        paragraphs: [
          "RoboPartPicker may remove, restrict, preserve, correct, or restore material after reviewing available information. It may request additional evidence and may notify the affected user where appropriate and lawful.",
          "False, abusive, or misleading notices can harm users and rights holders. Submit only accurate requests you are authorized to make.",
        ],
      },
    ],
    ["terms", "acceptable-use", "privacy", "contact"],
  ),

  accessibility: document(
    "accessibility",
    "Accessibility Statement",
    "Accessibility",
    "RoboPartPicker's accessibility target, current practices, known limits, and channel for reporting barriers or requesting alternatives.",
    "RoboPartPicker targets accessible keyboard, contrast, structure, responsive layout, and clear status communication without claiming complete conformance.",
    [
      {
        id: "commitment-and-target",
        title: "Commitment and target",
        paragraphs: [
          "RoboPartPicker aims to make its public website and account workflows usable by people with disabilities. The WCAG 2.1 AA target guides interface work, testing, and remediation.",
          "This statement is not a claim that every route, document, third-party resource, uploaded file, or interactive workflow currently conforms to every WCAG success criterion.",
        ],
      },
      {
        id: "current-practices",
        title: "Current practices",
        paragraphs: ["Current engineering practices include:"],
        bullets: [
          "Semantic headings, links, buttons, labels, tables, status and alert roles",
          "Visible high-contrast keyboard focus indicators",
          "Responsive layouts and deliberate horizontal scrolling for wide technical tables",
          "Text labels in addition to color for Beta, status, evidence, and warning states",
          "Alternative text or clearly identified illustrations for catalog imagery",
          "Automated and browser-based checks for focus, labels, contrast samples, and overflow",
        ],
      },
      {
        id: "known-limits",
        title: "Known limits",
        paragraphs: [
          "Complex CAD viewers, diagrams, uploaded technical files, third-party content, and dense data tables can present barriers. Some source materials are controlled by upstream publishers and may not include accessible alternatives.",
          "Automated testing cannot establish complete accessibility. Manual keyboard and assistive-technology feedback remains important.",
        ],
      },
      {
        id: "feedback-and-alternatives",
        title: "Feedback and alternative formats",
        paragraphs: [
          `Email ${SUPPORT_EMAIL} to report an accessibility barrier or request a reasonable alternative format for RoboPartPicker-controlled content. Include the page URL, the task you were trying to complete, the browser or assistive technology involved, and the format that would help.`,
          "Do not include passwords, tokens, payment information, or unrelated health or disability details. RoboPartPicker will review actionable reports and prioritize fixes based on severity and feasibility.",
        ],
      },
    ],
    ["contact", "privacy", "terms"],
  ),

  contact: document(
    "contact",
    "Contact RoboPartPicker",
    "Contact",
    "Contact RoboPartPicker for support, privacy rights, legal notices, security reports, accessibility issues, and intellectual-property requests.",
    "Use the brand-owned support address and include only the information needed to investigate your request.",
    [
      {
        id: "support-email",
        title: "Support email",
        paragraphs: [
          `Email ${SUPPORT_EMAIL} for RoboPartPicker support. This is also the public contact used for Google OAuth application registration.`,
          "Include a concise subject, the relevant page URL, account email if necessary, timestamps, expected behavior, actual behavior, and non-sensitive evidence that helps reproduce the issue.",
        ],
      },
      {
        id: "request-types",
        title: "What to contact us about",
        paragraphs: ["The support address accepts:"],
        bullets: [
          "Account access, deletion, correction, export, and privacy-rights requests",
          "Project, BOM, component, price, media, attribution, and source corrections",
          "Marketplace safety, suspected fraud, counterfeit or stolen goods, and policy reports",
          "Security vulnerabilities and suspected account compromise",
          "Accessibility barriers and alternative-format requests",
          "Legal notices, intellectual-property requests, and takedown requests",
          "General product support and Google authentication issues",
        ],
      },
      {
        id: "do-not-email",
        title: "Do not email sensitive secrets",
        paragraphs: [
          "Do not email passwords, authentication codes, access tokens, API keys, private keys, seed phrases, full payment-card details, government identifiers, private medical information, or confidential third-party files.",
          "If a secret has been exposed, revoke or rotate it immediately before reporting the incident. RoboPartPicker will not ask for your password or private key.",
        ],
      },
      {
        id: "response-and-formal-notices",
        title: "Response and formal notices",
        paragraphs: [
          "Response time depends on request complexity, verification needs, risk, and available operator capacity. Sending an email does not create an emergency-response, legal-representation, dispute-resolution, or transaction-support obligation.",
          "Use a clear subject such as Privacy Request, Security Report, Accessibility, Marketplace Safety, or Intellectual Property. RoboPartPicker may request identity or authority verification before disclosing account information or acting on protected records.",
        ],
      },
    ],
    ["legal", "privacy", "terms", "accessibility", "intellectual-property"],
  ),
};

export function legalDocument(id: LegalDocumentId): LegalDocument {
  return LEGAL_DOCUMENTS[id];
}
