export default function PrivacyPolicy() {
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"var(--ff-bg)", color:"var(--ff-text)", minHeight:"100vh", padding:"6rem 1.5rem 4rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em} h2{color:#ea6b14} p,li{line-height:1.8;color:rgba(var(--ff-muted), .85);font-weight:300} strong{color:var(--ff-text);font-weight:500} a{color:#ea6b14} ul,ol{padding-left:1.5rem;margin:.5rem 0} li{margin:.3rem 0} table{width:100%;border-collapse:collapse;margin:1rem 0} td,th{padding:.6rem 1rem;border:1px solid rgba(var(--ff-fg), .1);font-size:.85rem;color:rgba(var(--ff-muted), .8);text-align:left} th{color:var(--ff-text);background:rgba(var(--ff-fg), .04)}"}</style>
      <div style={{ maxWidth:"800px", margin:"0 auto" }}>

        <h1 style={{ fontSize:"clamp(2.5rem,6vw,4rem)", color:"var(--ff-text)", marginBottom:".5rem" }}>Privacy Policy</h1>
        <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .4)", marginBottom:"3rem", textTransform:"uppercase", letterSpacing:".1em" }}>Effective Date: June 4, 2026 &nbsp;·&nbsp; Freddy FixIt Contractors Inc.</p>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>1. Introduction</h2>
          <p><strong>Freddy FixIt Contractors Inc.</strong> (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the Freddy Fix It platform at <a href="https://freddyfixit.ca">freddyfixit.ca</a> (&ldquo;Platform&rdquo;). We are committed to protecting the privacy of our users in compliance with Alberta&rsquo;s <em>Personal Information Protection Act</em>, S.A. 2003, c. P-6.5 (&ldquo;PIPA&rdquo;), and Canada&rsquo;s <em>Personal Information Protection and Electronic Documents Act</em> (&ldquo;PIPEDA&rdquo;) where applicable. This Privacy Policy explains what personal information we collect, why we collect it, how we use and disclose it, and what rights you have.</p>
          <p>By creating an account or using the Platform, you consent to the collection, use, and disclosure of your personal information as described in this Policy.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>2. Who We Are</h2>
          <p>
            <strong>Privacy Officer</strong><br />
            Freddy FixIt Contractors Inc.<br />
            20 Whiteram Mews NE, Calgary, AB &nbsp;T1Y 5W5<br />
            <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>
          </p>
          <p>For any privacy-related inquiries, corrections, or complaints, please contact us at the address above. We will respond within <strong>30 days</strong>.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>3. Personal Information We Collect</h2>
          <p>We collect personal information that you provide directly, that is generated through your use of the Platform, and in some cases, that we receive from third parties.</p>

          <p><strong>3.1 Account and Profile Information (all users)</strong></p>
          <ul>
            <li>Full name, email address, phone number</li>
            <li>Account role (client or contractor)</li>
            <li>Password (stored in encrypted form; we do not have access to your plaintext password)</li>
          </ul>

          <p><strong>3.2 Client Information</strong></p>
          <ul>
            <li>Service address and location</li>
            <li>Service history and job descriptions</li>
            <li>Photos of problems or issues uploaded with requests</li>
            <li>Ratings and reviews given to contractors</li>
            <li>Client type (household or small business)</li>
          </ul>

          <p><strong>3.3 Contractor Information</strong></p>
          <ul>
            <li>Company name and business details</li>
            <li>Trade specialties and service areas</li>
            <li>Availability windows</li>
            <li>Portfolio photos</li>
            <li>Google Reviews URL (if provided)</li>
            <li>Cumulative earnings and job count (platform-maintained aggregates)</li>
            <li>Ratings and reviews received from clients</li>
          </ul>

          <p><strong>3.4 Compliance Information (contractors only)</strong></p>
          <ul>
            <li>Licensing status and trade certification declarations</li>
            <li>Insurance status</li>
            <li>WCB (Workers&rsquo; Compensation Board) coverage status</li>
            <li>Professional references</li>
          </ul>
          <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .5)" }}>We collect this information solely for the purpose of vetting contractors before granting platform access. We do not store or verify the underlying documents directly.</p>

          <p><strong>3.5 Service and Communication Content</strong></p>
          <ul>
            <li>Messages exchanged between clients and contractors through the in-platform chat</li>
            <li>Job completion photos uploaded by contractors</li>
            <li>Notifications sent and received</li>
          </ul>

          <p><strong>3.6 Payment Information</strong></p>
          <ul>
            <li>Transaction amounts, dates, and job references</li>
            <li>Payment status records</li>
          </ul>
          <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .5)" }}>Full payment card details are collected and stored by <strong>Stripe, Inc.</strong> directly. We do not receive or store card numbers, CVV codes, or full banking credentials on our systems.</p>

          <p><strong>3.7 Technical Information (collected automatically)</strong></p>
          <ul>
            <li>IP address and approximate geographic location</li>
            <li>Browser type, version, and device type</li>
            <li>Pages visited and interaction logs</li>
            <li>Session authentication tokens</li>
          </ul>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>4. How We Use Your Personal Information</h2>
          <p>We collect and use personal information only for purposes that a reasonable person would consider appropriate given the circumstances, and only with your consent or as otherwise permitted by PIPA. Specifically, we use your information to:</p>
          <ol type="a">
            <li>Create, verify, and manage your account;</li>
            <li>Match Clients with suitable Contractors based on location, specialties, and availability;</li>
            <li>Facilitate, process, and record payments for completed Jobs;</li>
            <li>Send transactional communications: job updates, booking confirmations, notifications, and invoices, via email and in-app notifications;</li>
            <li>Enable messaging and communication between Clients and Contractors;</li>
            <li>Review and approve Contractor applications;</li>
            <li>Maintain platform integrity: detect and prevent fraud, abuse, circumvention, and policy violations;</li>
            <li>Operate, maintain, and improve the Platform and our services;</li>
            <li>Comply with legal obligations under Alberta and Canadian law;</li>
            <li>Where you have given express consent: send marketing or promotional communications about the Platform.</li>
          </ol>
          <p>We will not use your personal information for purposes other than those listed above without your consent, except as required by law.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>5. Consent</h2>
          <p>Under PIPA, we collect personal information with your consent, obtained at account registration. By creating an account, you expressly consent to the collection, use, and disclosure of your personal information as described in this Policy.</p>
          <p>You may withdraw consent at any time by contacting us at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> or by deleting your account. Note that withdrawing consent may affect our ability to provide you with the Platform&rsquo;s services, and we may retain certain information where required by law or legitimate business purposes (see Section 8).</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>6. Sharing and Disclosure of Personal Information</h2>
          <p>We do not sell, rent, or trade your personal information. We share it only as described below.</p>
          <p><strong>6.1 Between Users.</strong> When a Client and a Contractor are matched on a Job, limited profile information (name, contact number, and general location) is shared with each party to enable Job coordination. Both parties agree to use this information solely for the purposes of the Job and not to contact each other for unrelated purposes.</p>
          <p><strong>6.2 Service Providers.</strong> We share personal information with third-party service providers who help us operate the Platform. These providers are contractually required to keep your information confidential and to handle it in a manner consistent with this Policy and applicable law. Our current providers are:</p>
          <table>
            <thead>
              <tr><th>Provider</th><th>Purpose</th><th>Data Location</th></tr>
            </thead>
            <tbody>
              <tr><td>Supabase, Inc.</td><td>Database, authentication, and file storage</td><td>United States</td></tr>
              <tr><td>Vercel, Inc.</td><td>Web hosting and deployment</td><td>United States</td></tr>
              <tr><td>Resend, Inc.</td><td>Transactional email delivery</td><td>United States</td></tr>
              <tr><td>Stripe, Inc.</td><td>Payment processing</td><td>United States</td></tr>
              <tr><td>Google LLC</td><td>Website analytics (Google Analytics 4)</td><td>United States</td></tr>
            </tbody>
          </table>
          <p><strong>6.3 Advertising.</strong> We do not currently share your personal information with advertising partners. In the future, we may work with third-party advertising networks to display relevant advertisements on the Platform. If and when we do so, we will update this Policy and, where required by PIPA, obtain your express consent before sharing your information for advertising purposes. You will have the right to opt out.</p>
          <p><strong>6.4 Legal Disclosure.</strong> We may disclose personal information without your consent if required or permitted by law, including in response to a court order, subpoena, warrant, or lawful request from a government authority, or where we reasonably believe disclosure is necessary to protect the rights, property, or safety of the Company, our users, or the public.</p>
          <p><strong>6.5 Business Transfers.</strong> If the Company undergoes a merger, acquisition, reorganization, or sale of all or substantially all of its assets, your personal information may be transferred as part of that transaction. We will notify you by email and by posting a notice on the Platform at least <strong>30 days</strong> before your information is transferred and becomes subject to a different privacy policy.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>7. Transfer of Information Outside Canada</h2>
          <p>Our service providers operate servers located in the United States. As a result, your personal information may be transferred to, stored, and processed in the United States, where privacy laws may differ from those in Alberta or Canada and may not provide the same level of protection. By using the Platform, you consent to this transfer.</p>
          <p>We require our U.S.-based service providers to protect your information to a standard substantially equivalent to Canadian requirements and to use it only as directed by us.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>8. Data Retention</h2>
          <p>We retain your personal information for as long as your account is active and for a reasonable period afterward to fulfil legal, audit, regulatory, and legitimate business requirements. Specific retention periods:</p>
          <ul>
            <li><strong>Account and profile data:</strong> Retained for up to <strong>3 years</strong> after account deletion, unless a longer period is required by law.</li>
            <li><strong>Payment and transaction records:</strong> Retained for <strong>7 years</strong> in compliance with Canada Revenue Agency requirements under the <em>Income Tax Act</em>.</li>
            <li><strong>Chat messages and uploaded photos:</strong> Deleted within <strong>90 days</strong> of account deletion.</li>
            <li><strong>Contractor compliance declarations:</strong> Retained for the duration of the contractor relationship and for up to <strong>2 years</strong> thereafter.</li>
          </ul>
          <p>When personal information is no longer required, we will destroy, erase, or de-identify it in a secure manner.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>9. Security</h2>
          <p>We implement reasonable technical, administrative, and organizational safeguards designed to protect your personal information against unauthorized access, use, disclosure, alteration, or destruction. These measures include:</p>
          <ul>
            <li>Encrypted data transmission using HTTPS/TLS;</li>
            <li>Encrypted password storage (bcrypt hashing via Supabase Auth);</li>
            <li>Row-level security controls on the database;</li>
            <li>Access controls limiting staff access to personal information on a need-to-know basis;</li>
            <li>Secure cloud infrastructure managed by Supabase and Vercel.</li>
          </ul>
          <p>No method of electronic transmission or storage is completely secure. We cannot guarantee absolute security, and we are not responsible for breaches caused by factors outside our reasonable control. In the event of a breach that poses a real risk of significant harm to you, we will notify you and the Office of the Information and Privacy Commissioner of Alberta as required by PIPA.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>10. Your Rights Under PIPA</h2>
          <p>As an Alberta resident, you have the following rights with respect to your personal information held by us:</p>
          <ul>
            <li><strong>Right of Access.</strong> You may request access to the personal information we hold about you, the purposes for which it is being used, and the names of any third parties to whom it has been disclosed.</li>
            <li><strong>Right of Correction.</strong> You may request that we correct any personal information that is inaccurate or incomplete.</li>
            <li><strong>Right to Withdraw Consent.</strong> You may withdraw consent to the collection, use, or disclosure of your personal information at any time, subject to legal and contractual restrictions and reasonable notice.</li>
            <li><strong>Right to Delete.</strong> You may delete your account and request erasure of your personal information through your account settings, subject to the retention obligations described in Section 8.</li>
          </ul>
          <p>To exercise any of these rights, contact our Privacy Officer at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>. We will respond within <strong>30 days</strong>. If you are not satisfied with our response, you have the right to contact the <a href="https://www.oipc.ab.ca" target="_blank" rel="noopener noreferrer">Office of the Information and Privacy Commissioner of Alberta</a>.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>11. Cookies and Tracking Technologies</h2>
          <p>The Platform uses <strong>essential session cookies</strong> required for user authentication and platform security. These cookies are strictly necessary for the Platform to function and cannot be disabled without affecting your ability to log in.</p>
          <p>We use <strong>Google Analytics 4</strong> to understand how visitors use the Platform (for example, which pages are viewed and how people reach us) so we can improve it. This sets analytics cookies and shares limited usage data with Google LLC. We enable IP-address anonymization, and we do not use advertising cookies or sell your information. You can opt out at any time by installing the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics Opt-out Browser Add-on</a> or by using your browser&rsquo;s cookie controls. Essential session cookies (described above) cannot be disabled without affecting login.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>12. Children&rsquo;s Privacy</h2>
          <p>The Platform is intended exclusively for users <strong>18 years of age or older</strong>. We do not knowingly collect personal information from individuals under 18. If we become aware that personal information has been collected from a person under 18, we will delete it promptly. If you believe we have inadvertently collected such information, please contact us at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>13. Marketing Communications</h2>
          <p>If you provide express consent at account sign-up or at any time thereafter, we may send you email communications about Platform updates, new features, and promotions. You may opt out of marketing emails at any time by clicking &ldquo;Unsubscribe&rdquo; in any such email, or by contacting us at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>. Opting out of marketing communications will not affect transactional messages related to your account or Jobs.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>14. Changes to This Privacy Policy</h2>
          <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. When we make material changes, we will notify you by email to your registered address and by posting the revised Policy on the Platform with an updated effective date, at least <strong>14 days</strong> before the changes take effect. Your continued use of the Platform after the effective date constitutes your acceptance of the revised Policy.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>15. Contact and Privacy Officer</h2>
          <p>For all privacy-related questions, requests, or complaints, please contact:</p>
          <p>
            <strong>Privacy Officer</strong><br />
            Freddy FixIt Contractors Inc.<br />
            20 Whiteram Mews NE<br />
            Calgary, AB &nbsp;T1Y 5W5<br />
            <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>
          </p>
          <p>We will acknowledge receipt of your inquiry within <strong>5 business days</strong> and will provide a substantive response within <strong>30 days</strong>. If you are not satisfied with our response, you may contact the <strong>Office of the Information and Privacy Commissioner of Alberta</strong> at <a href="https://www.oipc.ab.ca" target="_blank" rel="noopener noreferrer">www.oipc.ab.ca</a>.</p>
        </section>

        <div style={{ borderTop:"1px solid rgba(var(--ff-fg), .08)", paddingTop:"2rem", marginTop:"2rem", textAlign:"center" }}>
          <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .3)" }}>
            &copy; {new Date().getFullYear()} Freddy FixIt Contractors Inc. &nbsp;·&nbsp;
            <a href="/user-agreement" style={{ color:"rgba(var(--ff-muted), .4)" }}>User Agreement</a> &nbsp;·&nbsp;
            <a href="/homeowner-protection-promise" style={{ color:"rgba(var(--ff-muted), .4)" }}>Protection Promise</a>
          </p>
        </div>
      </div>
    </div>
  );
}
