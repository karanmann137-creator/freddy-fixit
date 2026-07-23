export default function UserAgreement() {
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"var(--ff-bg)", color:"var(--ff-text)", minHeight:"100vh", padding:"6rem 1.5rem 4rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em} h2{color:#ea6b14} h3{color:var(--ff-text);font-size:1.05rem;margin-top:1.4rem;margin-bottom:.4rem} p,li{line-height:1.8;color:rgba(var(--ff-muted), .85);font-weight:300} strong{color:var(--ff-text);font-weight:500} a{color:#ea6b14} ul,ol{padding-left:1.5rem;margin:.5rem 0} li{margin:.3rem 0} .divider{border:none;border-top:1px solid rgba(var(--ff-fg), .08);margin:3rem 0}"}</style>
      <div style={{ maxWidth:"800px", margin:"0 auto" }}>

        {/* ─── PART I: GENERAL USER AGREEMENT ─── */}
        <h1 style={{ fontSize:"clamp(2.5rem,6vw,4rem)", color:"var(--ff-text)", marginBottom:".5rem" }}>User Agreement</h1>
        <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .4)", marginBottom:"3rem", textTransform:"uppercase", letterSpacing:".1em" }}>Effective Date: June 26, 2026 &nbsp;·&nbsp; Last Updated: July 22, 2026 &nbsp;·&nbsp; Freddy FixIt Contractors Inc.</p>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>1. Agreement to Terms</h2>
          <p>By creating an account on the Freddy Fix It platform (&ldquo;Platform&rdquo;), operated by <strong>Freddy FixIt Contractors Inc.</strong> (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you (&ldquo;User&rdquo;) agree to be legally bound by this User Agreement (&ldquo;Agreement&rdquo;) and our <a href="/privacy-policy">Privacy Policy</a>. If you do not agree, do not create an account or use the Platform.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>2. Definitions</h2>
          <ul>
            <li><strong>&ldquo;Platform&rdquo;</strong> means the Freddy Fix It website (freddyfixit.ca) and all related services and features.</li>
            <li><strong>&ldquo;Client&rdquo;</strong> means a User who posts service requests seeking home repair, maintenance, or related services.</li>
            <li><strong>&ldquo;Contractor&rdquo;</strong> means a User who offers and performs services through the Platform.</li>
            <li><strong>&ldquo;Services&rdquo;</strong> means the home repair, maintenance, and related services listed and performed through the Platform.</li>
            <li><strong>&ldquo;Job&rdquo;</strong> means an agreed-upon scope of work between a Client and a Contractor facilitated through the Platform.</li>
          </ul>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>3. Eligibility</h2>
          <p>You must be at least <strong>18 years of age</strong> to use the Platform. By registering, you represent that you are 18 or older and have full legal capacity to enter into this Agreement. If registering on behalf of a business entity, you represent that you have authority to bind that entity.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>4. Account Registration and Security</h2>
          <p>You agree to provide accurate, current, and complete information during registration and to keep your account information up to date. You are solely responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> if you suspect unauthorized access. We are not liable for any loss resulting from unauthorized use of your account.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>5. Platform Role — We Are a Connector, Not a Service Provider</h2>
          <p>Freddy FixIt Contractors Inc. is a technology platform that connects Clients with independent Contractors. The Company is <strong>not a party</strong> to any service agreement between a Client and a Contractor. Contractors are independent professionals — not employees, agents, or representatives of the Company. The Company does not perform, supervise, direct, or control the work performed by any Contractor and is not responsible for the outcome of any Job.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>6. Client Terms</h2>
          <p><strong>6.1 Service Requests.</strong> Clients may post requests describing work they need done. By submitting a request, you represent that all information provided is accurate and that you have lawful authority over the property where services will be performed.</p>
          <p><strong>6.2 Approval.</strong> Clients must approve the proposed schedule and price before a Job begins. By approving, you enter a direct service agreement with the Contractor.</p>
          <p><strong>6.3 Payment.</strong> Clients agree to pay the full agreed Job price through the Platform. For single-payment Jobs, your payment method is charged when you approve the estimate and schedule; the funds are then <strong>held securely by the Company through its payment processor</strong> and released to the Contractor only after the Job is completed and you confirm it (or it is auto-confirmed under Section 6.4). For staged Jobs, each stage is charged when you fund it (see Section 6.8). By using the Platform, you authorize the Company to collect payment on the Contractor&rsquo;s behalf.</p>
          <p><strong>6.4 Auto-Confirmation.</strong> After a Contractor marks a Job complete, Clients have <strong>3 calendar days</strong> to confirm or raise a concern. If no action is taken, the Job is automatically confirmed and payment is released to the Contractor.</p>
          <p><strong>6.5 Ratings.</strong> Clients may rate Contractors following Job completion. Ratings must be honest, based on direct experience, and must not contain false or defamatory statements.</p>
          <p><strong>6.6 Safety.</strong> You are responsible for ensuring safe access to your property. You agree not to ask Contractors to perform work that violates applicable building codes, safety standards, or the law.</p>
          <p><strong>6.7 Fees.</strong> The Job price you approve is the amount payable to the Contractor for the work. At the time of payment, the Company adds a <strong>Client service fee</strong> (currently <strong>3% of the Job price</strong>) to cover payment processing and platform costs; the total amount charged, including this fee, is shown to you before you confirm payment. The Company also retains a <strong>platform commission</strong> (currently <strong>7% of the Job price</strong>) from the amount paid to the Contractor. These amounts may change from time to time; the fees in effect are those disclosed to you at the time of the transaction. Payments are processed by Stripe, Inc.; the Company does not receive or store your full card details.</p>
          <p><strong>6.8 Milestone (Staged) Payments for Larger Jobs.</strong> For Jobs with an approved price <strong>over $2,000</strong>, you may be offered the option to pay in <strong>stages (&ldquo;milestones&rdquo;)</strong> rather than in a single payment. If you use staged payments: (a) the Contractor proposes a schedule of 2&ndash;5 stages whose amounts add up to the total Job price, and <strong>you approve that schedule before any money is charged</strong> &mdash; approving the schedule alone does not charge you anything; (b) you fund each stage separately, in order, at the time you choose to start it, and <strong>you are never required to fund a later stage</strong> &mdash; you may stop at any time, and any stage you have not funded creates no payment obligation; (c) the same <strong>3% Client service fee</strong> and <strong>7% platform commission</strong> apply to each stage, so the total you pay across all stages is the same as it would be if the Job were paid in a single payment, and the amount charged for each stage (including the service fee) is shown to you before you confirm that stage; (d) the funds for each stage you fund are <strong>held by the Company through its payment processor and released to the Contractor only after you approve that stage, or automatically 3 calendar days after the Contractor marks that stage complete</strong> if you take no action &mdash; the same confirmation window described in Section 6.4, applied per stage; and (e) you may raise a concern about an individual stage before it is released (see Section 6.9), in which case only that stage&rsquo;s funds are frozen and the remaining stages pause until the concern is resolved. Amounts held pending release are held on the Company&rsquo;s payment-processor balance; this is not a trust or escrow account, and no interest is payable to you on held amounts.</p>
          <p><strong>6.9 Concerns, Cancellations and Refunds.</strong> If a Contractor does not perform work you have paid for, performs it defectively, or abandons a Job, you may raise a concern through the Platform (or by emailing <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>) <strong>before the payment for that work is released</strong>. For single-payment Jobs this applies during the 3-day confirmation window; for staged Jobs it applies per stage, before that stage is released. Where a concern is raised in time, the affected funds are frozen and reviewed under the Company&rsquo;s claims process, and the Company may, at its reasonable discretion, release, partially refund, or fully refund the held amount for the affected work. <strong>You are only ever charged for stages you choose to fund</strong>, and refunds are limited to amounts still held by the Company and not yet released to the Contractor. This Section does not limit any non-waivable rights you may have under Alberta consumer-protection law.</p>
          <p><strong>6.10 Your Cancellation Rights Under Alberta Law.</strong> Many Jobs booked through the Platform are arranged away from the Contractor&rsquo;s fixed place of business, and payment is collected before the work is fully performed (this is true for both single-payment Jobs, where your card is charged and the funds held at checkout, and staged Jobs, where you fund each stage before it begins). Where that is the case, Alberta&rsquo;s <em>Consumer Protection Act</em> and its regulations may give you statutory cancellation rights that apply <strong>in addition to</strong>, and are not limited by, the concern-and-refund process in Section 6.9: <strong>(a)</strong> you may cancel the contract <strong>for any reason, without penalty, within 10 days</strong> after you receive your copy of the contract (the contract includes the scope of work, price, payment schedule, and start and completion dates recorded through the Platform, which we email to you when you approve the estimate; the 10-day period runs from when you receive that copy); <strong>(b)</strong> if the Services are not started or provided within <strong>30 days</strong> of the date stated in the contract, you may cancel within <strong>one year</strong> of the contract date, unless you accept performance after that 30-day period; and <strong>(c)</strong> on a valid cancellation, any deposit or advance payment you have made that has not yet been released to the Contractor will be refunded to you, and refundable amounts will be returned within the time required by law (currently <strong>15 days</strong>). To cancel, notify us through the Platform or at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> using a method that lets you prove you gave notice (such as email). <strong>Nothing in this Agreement waives, limits, or reduces any right you have under the <em>Consumer Protection Act</em> (Alberta) or its regulations;</strong> where any term of this Agreement conflicts with those non-waivable rights, the law prevails.</p>

          <p><strong>6.11 Service Agreements and Electronic Signatures.</strong> For <strong>every Job</strong> booked through the Platform, the Contractor will send you a <strong>written service agreement</strong> that you must review and sign electronically <strong>before any payment is collected</strong> for that Job. This applies to all Jobs &mdash; single-payment, staged (milestone), and recurring alike. The agreement sets out the parties, the service address, the scope of work, the price (or staged payment schedule), and the expected timing, and it incorporates this User Agreement and your Alberta cancellation rights in Section 6.10. You sign by typing your name and confirming your intent to be bound; you agree that this electronic signature has the <strong>same legal effect as a handwritten signature</strong> under Alberta&rsquo;s <em>Electronic Transactions Act</em>, and you consent to contracting electronically. When both parties have signed, the Platform generates a final signed copy that records each signer&rsquo;s name and the date, time, and network address of signing as a tamper-evident record, and makes it available to you to view and download. <strong>The service agreement is between you and the Contractor only.</strong> The Company is not a party to it and provides the signing tool solely as a convenience; the Company&rsquo;s role remains that of a connector as described in Section 5, and nothing in a service agreement (including any document a Contractor uploads) creates any obligation, warranty, or liability on the part of the Company or overrides this User Agreement or your non-waivable rights under Alberta law.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>7. Content and Photos</h2>
          <p><strong>7.1 Licence.</strong> By uploading photos, descriptions, reviews, or other content to the Platform (&ldquo;User Content&rdquo;), you grant the Company a <strong>non-exclusive, royalty-free, worldwide licence</strong> to use, store, display, and reproduce that content solely for the purpose of operating and improving the Platform. You retain ownership of your User Content and represent that you have all rights necessary to upload it and that it does not infringe the rights of any third party.</p>
          <p><strong>7.2 Prohibited Content.</strong> You agree not to upload User Content that is unlawful, defamatory, harassing, hateful, fraudulent, sexually explicit, or that infringes any copyright, trademark, privacy, or other right of a third party, or that contains another person&rsquo;s personal information without their consent.</p>
          <p><strong>7.3 Notice and Takedown.</strong> If you believe any User Content on the Platform infringes your rights or otherwise violates Section 7.2, you may request its removal by emailing <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> with the subject line &ldquo;Content Removal Request&rdquo; and including: (a) a description and location (URL or job reference) of the content; (b) the reason for removal and, where applicable, the right you claim is being infringed; and (c) your contact information and a good-faith statement that your complaint is accurate. We will acknowledge your request within <strong>5 business days</strong> and, where the complaint is valid, remove or disable access to the content within a reasonable time. We may notify the user who posted the content and give them an opportunity to respond.</p>
          <p><strong>7.4 Our Right to Remove.</strong> The Company may, at its sole discretion and without prior notice, remove, disable, or restrict any User Content that it reasonably believes violates this Agreement or applicable law, or that exposes the Company or its users to liability. Repeated violations may result in suspension or termination of your account.</p>
          <p><strong>7.5 Truthful and Accurate Information.</strong> <strong>We expect everything you upload or submit to the Platform to be truthful and accurate.</strong> This applies to all information and content you provide, including your name and contact details, profile information, licences, certifications, insurance and other credential documents, service requests and job descriptions, photos and videos, estimates and prices, invoices, completion records, reviews and ratings, and messages sent through the Platform. You must not submit information or documents that are false, misleading, altered, fabricated, or that misrepresent you, your qualifications, your business, the condition of a property, or the work performed. Other Users and the Company rely on what you upload to make real decisions — hiring a Contractor, approving an estimate, releasing payment, or resolving a claim. The Company may (but is not obligated to) verify any information or document you provide and may request supporting evidence at any time. Submitting false or misleading information or documents is a <strong>material breach</strong> of this Agreement and may result in immediate suspension or termination of your account, removal of content, reversal or withholding of payments connected to the falsified information, and, where appropriate, referral to law enforcement or regulatory authorities.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>8. Prohibited Conduct</h2>
          <p>While using the Platform, you agree that you will not:</p>
          <ol type="a">
            <li>Register more than one account, register an account for someone else without authority, or impersonate any person or entity, or otherwise misrepresent your identity or affiliation;</li>
            <li>Post a service request you do not intend to have completed or pay for, or (as a Contractor) submit a bid or estimate for work you do not intend or are not qualified to perform;</li>
            <li>Arrange, solicit, or accept payment outside the Platform for services introduced through the Platform, or recruit other Users to competing services;</li>
            <li>Harass, stalk, threaten, intimidate, or collect personal information about other Users other than as needed to complete a Job;</li>
            <li>Request, offer, or perform any service that is unlawful or that you have no legal right to request or perform;</li>
            <li>Scrape, data-mine, reverse engineer, interfere with, or disrupt the Platform, attempt to gain unauthorized access to it, or use it to build a competing product; or</li>
            <li>Use the Platform for any purpose other than requesting or providing Services as permitted by this Agreement.</li>
          </ol>
          <p>Violation of this Section is grounds for suspension or termination of your account, in addition to any other remedy available to the Company.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>9. Disclaimer of Warranties</h2>
          <p>THE PLATFORM IS PROVIDED <strong>&ldquo;AS IS&rdquo;</strong> AND <strong>&ldquo;AS AVAILABLE&rdquo;</strong> WITHOUT WARRANTIES OF ANY KIND. THE COMPANY DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED OR ERROR-FREE, NOR DOES IT GUARANTEE THE QUALITY, SAFETY, OR LEGALITY OF ANY SERVICES PROVIDED BY CONTRACTORS.</p>
          <p>References on the Platform to a Contractor being &ldquo;vetted,&rdquo; &ldquo;verified,&rdquo; &ldquo;approved,&rdquo; or similar mean only that the Contractor has completed the Company&rsquo;s review process at the relevant time. They are not a guarantee or endorsement of any Contractor&rsquo;s identity, qualifications, workmanship, or conduct, and you should exercise your own judgment when hiring.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>10. Limitation of Liability</h2>
          <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FREDDY FIXIT CONTRACTORS INC. AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM OR ANY SERVICES ARRANGED THROUGH IT.</p>
          <p>THE COMPANY&rsquo;S TOTAL CUMULATIVE LIABILITY SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL PLATFORM FEES PAID IN CONNECTION WITH YOUR ACCOUNT IN THE PRECEDING 12 MONTHS; OR (B) <strong>ONE HUNDRED CANADIAN DOLLARS ($100 CAD)</strong>.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>11. Indemnification</h2>
          <p>You agree to defend, indemnify, and hold harmless Freddy FixIt Contractors Inc. and its officers, directors, employees, and agents from any claims, damages, losses, and expenses (including legal fees) arising from: (a) your use of the Platform; (b) your breach of this Agreement; (c) services you perform or receive through the Platform; (d) your User Content; or (e) your violation of any third-party rights.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>12. Changes to This Agreement</h2>
          <p>We may update this Agreement from time to time. For material changes, we will provide at least <strong>14 days&rsquo; advance notice</strong> by email. Your continued use of the Platform after the effective date constitutes acceptance of the revised Agreement.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>13. Governing Law</h2>
          <p>This Agreement is governed by the laws of the <strong>Province of Alberta</strong> and the federal laws of Canada. Any dispute shall be submitted exclusively to the courts of <strong>Calgary, Alberta</strong>.</p>
        </section>

        <section style={{ marginBottom:"3rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>14. General Provisions</h2>
          <p><strong>14.1 Entire Agreement.</strong> This Agreement, together with the Privacy Policy, constitutes the entire agreement between you and the Company and supersedes all prior agreements.</p>
          <p><strong>14.2 Severability.</strong> If any provision is found invalid or unenforceable, the remaining provisions continue in full force.</p>
          <p><strong>14.3 No Waiver.</strong> The Company&rsquo;s failure to enforce any right shall not constitute a waiver.</p>
          <p><strong>14.4 Assignment.</strong> You may not assign your rights without prior written consent. The Company may assign its rights freely.</p>
          <p><strong>14.5 Language.</strong> This Agreement is written in English. In any conflict with a translation, the English version prevails.</p>
        </section>

        <hr className="divider" />

        {/* ─── PART II: CONTRACTOR PROFESSIONAL TERMS ─── */}
        <h1 style={{ fontSize:"clamp(2.2rem,5vw,3.5rem)", color:"var(--ff-text)", marginBottom:".5rem" }}>Contractor Professional Terms</h1>
        <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .4)", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:".1em" }}>Effective Date: June 26, 2026 &nbsp;·&nbsp; Freddy FixIt Contractors Inc.</p>
        <p style={{ marginBottom:"3rem" }}>These Contractor Professional Terms (&ldquo;Contractor Terms&rdquo;) apply to every User who registers as a Contractor on the Platform. They form part of and are incorporated into the User Agreement above. In the event of conflict, these Contractor Terms prevail with respect to Contractor obligations. By registering as a Contractor, you agree to be bound by these Contractor Terms.</p>

        {/* Section 1 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>1. Becoming a Contractor</h2>

          <h3>a. Customer Service &amp; Professionalism</h3>
          <p>As a Contractor on the Freddy Fix It Platform, you agree to conduct yourself with the highest standard of professionalism at all times. This includes, but is not limited to: responding to Client messages promptly; arriving at appointments on time or providing reasonable advance notice of any delay; treating Clients, their property, and all other persons with courtesy and respect; presenting yourself and your work in a clean and professional manner; and resolving any Client concerns or complaints in good faith and without hostility. The Company reserves the right to remove any Contractor whose conduct is deemed unprofessional, harmful, or detrimental to the Platform&rsquo;s reputation.</p>

          <h3>b. Qualified</h3>
          <p>You represent and warrant that you are fully qualified to perform each category of service you offer through the Platform. You must hold all licences, trade certifications, permits, and government-issued credentials required by applicable law in Alberta for the trades and services you advertise. You agree to provide copies of all relevant credentials to the Company upon request and to keep those credentials current throughout the duration of your use of the Platform. Offering services for which you are not lawfully qualified is grounds for immediate account termination.</p>

          <h3>c. Insurance</h3>
          <p>You must maintain, at your own expense and at all times while active on the Platform: (i) <strong>commercial general liability insurance</strong> of not less than <strong>$2,000,000 CAD per occurrence</strong> covering bodily injury, property damage, and completed operations; and (ii) valid <strong>Workers&rsquo; Compensation Board (WCB) of Alberta</strong> coverage for yourself and any workers or subcontractors you engage, to the extent required by Alberta law. You agree to provide proof of insurance to the Company or to a Client upon request. If your insurance lapses or is cancelled, you must notify the Company immediately and cease accepting new Jobs until valid coverage is reinstated.</p>

          <h3>d. Quality of Work Standards</h3>
          <p>You agree to perform all Services in a <strong>good and workmanlike manner</strong>, consistent with industry standards and best practices for the applicable trade. All work must comply with the Alberta Building Code, the National Building Code, and all other applicable codes, regulations, and standards. You are responsible for obtaining any required permits before work commences. Substandard work, code violations, or repeated Client complaints regarding quality may result in account suspension or termination.</p>

          <h3>e. Prepaid Contracting Licence (Alberta)</h3>
          <p>Payment for Jobs is collected through the Platform <strong>before the work is fully performed</strong> &mdash; your card-holding at checkout for single-payment Jobs, and Client funding of each stage before it begins for staged (milestone) Jobs. Under Alberta&rsquo;s <em>Consumer Protection Act</em> and the <em>Prepaid Contracting Business Licensing Regulation</em>, a business that solicits or concludes contracts away from a fixed place of business and accepts money before all the work is done, for the <strong>construction, maintenance, repair, alteration, addition to, or improvement of private dwellings</strong> (or associated real property such as landscaping), is a <strong>&ldquo;prepaid contracting business&rdquo; that must be licensed</strong> by Service Alberta and Red Tape Reduction (subject to exemptions, such as strictly commercial work, work between contractors and subtrades, and homes covered by a recognized new-home warranty program). You are solely responsible for determining whether this applies to your services and, where it does, for <strong>obtaining and maintaining a valid prepaid contracting business licence and any required security (bond or equivalent)</strong> before accepting payment through the Platform. You must also comply with the resulting obligations, including using a <strong>written contract that states the scope of work, materials, start and completion dates, payment schedule, and the Client&rsquo;s cancellation rights</strong>, and <strong>refunding deposits or advance payments without delay on a valid cancellation</strong>. The Company may require proof of licensing and may suspend or remove your account if you cannot demonstrate compliance. This Section describes a legal requirement in general terms and is not legal advice; you should confirm your own obligations with Service Alberta or your own legal advisor.</p>
        </section>

        {/* Section 2 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>2. Accepting Jobs</h2>

          <h3>a. Agreement with Client</h3>
          <p>When you accept a Job through the Platform, you enter into a direct service agreement with the Client for the scope of work, price, and schedule as confirmed through the Platform. You acknowledge that the Company is not a party to this service agreement and is not responsible for any dispute, liability, or outcome arising from it. You agree to perform the Job in accordance with the confirmed terms and not to request additional compensation beyond the agreed price without Client consent and Platform documentation.</p>

          <h3>b. Procedure</h3>
          <p>Once a Job is assigned to you: (i) you must confirm your acceptance within the timeframe indicated in the dispatch notification; (ii) you must propose a specific appointment date and time through the Platform prior to attending the property; (iii) you must not attend the Client&rsquo;s property without a confirmed appointment; and (iv) you must update the Job status on the Platform when you arrive on site, when work is in progress, and when work is complete. Failure to follow the required procedure may result in the Job being reassigned and may affect your standing on the Platform.</p>

          <h3>c. Responsibilities</h3>
          <p>You are solely responsible for: (i) assessing the scope of work and confirming that you are able to complete it before accepting the Job; (ii) supplying all labour, tools, equipment, and materials required to complete the Job unless otherwise agreed with the Client in writing through the Platform; (iii) ensuring that any workers or subcontractors you bring on site are qualified, insured, and compliant with applicable law; (iv) leaving the work area clean and in at least as good a condition as it was found; and (v) any damage caused to the Client&rsquo;s property or to third parties arising from your work.</p>

          <h3>d. Completing the Job</h3>
          <p>A Job is considered complete when you have performed all Services in the confirmed scope of work and have marked the Job as &ldquo;complete&rdquo; in the Platform. Upon marking a Job complete, the Client will have <strong>3 calendar days</strong> to confirm completion or raise a concern. If no action is taken within that period, the Job is automatically confirmed and payment is released to you. You must not mark a Job complete until all work in the scope has been performed to a satisfactory standard. Marking a Job complete prematurely or without Client knowledge is a material breach of these Contractor Terms.</p>
        </section>

        {/* Section 3 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>3. Cancellation</h2>

          <h3>a. Cancellation by Client</h3>
          <p>A Client may cancel a confirmed Job at any time before the scheduled appointment. If the Client cancels with less than <strong>24 hours&rsquo; notice</strong>, you may be entitled to a cancellation fee as set out in the applicable Job posting or as otherwise agreed through the Platform. The Company will make reasonable efforts to facilitate payment of any applicable cancellation fee but does not guarantee collection from the Client. The Company reserves the right to modify cancellation fee policies from time to time upon notice.</p>

          <h3>b. Cancellation by Contractor</h3>
          <p>You may cancel a confirmed Job only in exceptional circumstances, such as a genuine emergency, illness, or force majeure event. Cancellations must be communicated to the Client and recorded through the Platform as soon as possible. <strong>If you cancel a confirmed Job less than 24 hours before the scheduled appointment without a valid reason acceptable to the Company, you agree that a cancellation fee of up to $50 CAD may be charged against your account balance or deducted from a future payment.</strong> Repeated or chronic cancellations may result in your account being suspended or permanently terminated. The Company tracks cancellation rates and uses this data in calculating your reliability score visible to Clients.</p>
        </section>

        {/* Section 4 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>4. Fees &amp; Payment Terms</h2>

          <h3>a. No Additional Charges</h3>
          <p>You agree that the price confirmed through the Platform is the total amount you are entitled to charge the Client for the agreed scope of work. You must not charge the Client any additional fees, surcharges, materials markups, or other amounts not documented and agreed through the Platform prior to commencement of work. If you identify additional work beyond the original scope, you must submit a change-order request through the Platform and obtain Client approval before performing that additional work or billing for it.</p>

          <h3>b. Platform Rates</h3>
          <p>By accepting Jobs through the Platform, you agree that the rates you charge are competitive and reflect fair market value for the Calgary area. The Company reserves the right to remove listings or Job bids where rates are determined to be unreasonable, predatory, or inconsistent with market norms. The Company may, from time to time, publish recommended rate guidelines for common services; these are advisory only.</p>

          <h3>c. Invoicing</h3>
          <p>The Platform generates an invoice on your behalf upon Job completion. You agree that the Platform-generated invoice constitutes a valid commercial invoice for the services rendered. You must not issue a separate invoice to the Client for the same services. You may request a copy of any invoice through your Contractor dashboard. You are solely responsible for ensuring that all invoice details (services performed, amounts, dates) are accurate and consistent with the confirmed scope of work.</p>

          <h3>d. Service Fee</h3>
          <p>The Company charges a <strong>service fee</strong> (&ldquo;Service Fee&rdquo;) on each completed Job. The Service Fee is automatically deducted from the Job payment before disbursement to you. The Service Fee compensates the Company for providing the Platform, dispatch services, payment processing, and Client acquisition. The Service Fee applies to the full Job amount including any agreed change orders. The Company reserves the right to modify the Service Fee upon 30 days&rsquo; written notice.</p>

          <h3>e. Payment Processing</h3>
          <p>Payment processing services are provided by <strong>Stripe, Inc.</strong> By using the Platform&rsquo;s payment features, you also agree to <a href="https://stripe.com/en-ca/legal/ssa" target="_blank" rel="noopener noreferrer">Stripe&rsquo;s Services Agreement</a>. Payment processing fees charged by Stripe are separate from and in addition to the Service Fee, and are disclosed at the time of account setup. The Company is not responsible for errors, delays, or failures caused by Stripe. Funds are disbursed to your registered bank account or payout method within the timeframe specified on your Contractor dashboard, following Job confirmation.</p>

          <h3>f. Homeowner Protection Promise Obligations</h3>
          <p>The Company offers Clients a <strong><a href="/homeowner-protection-promise">Homeowner Protection Promise</a></strong> — a discretionary, claims-based satisfaction program that is <strong>not insurance</strong> and not a warranty on your work. You acknowledge that this program exists and agree to cooperate in good faith with any claim that involves your work, including by providing information, photos, and reasonable access, and by remedying defective work where the Company reasonably requires it. The Promise does not transfer your responsibility to the Client or to the Company. If the Company, at its discretion, provides any remedy or makes any payment to a Client arising from your defective work, negligence, or breach, you agree to fully reimburse the Company for that amount, and you authorize the Company to deduct any such reimbursement from your future earnings or to pursue recovery by other lawful means.</p>

          <h3>g. Taxes</h3>
          <p>You are solely responsible for all tax obligations arising from income earned through the Platform. This includes, without limitation: reporting and remitting federal and provincial income tax; collecting, reporting, and remitting <strong>GST/HST</strong> if you are a registrant or required to be a registrant under the <em>Excise Tax Act</em>; and any other applicable provincial or municipal taxes. The Company does not withhold taxes on your behalf and does not provide tax advice. You should consult a qualified accountant or tax advisor regarding your obligations. The Company will provide annual earnings summaries upon request to assist with your tax filings.</p>

          <h3>h. Contractor Credits</h3>
          <p>The Company may, from time to time, issue promotional credits to your Contractor account (&ldquo;Credits&rdquo;). Credits have no cash value, are non-transferable, cannot be redeemed for cash, and may only be applied toward Service Fees on future Jobs. Credits expire 12 months from the date of issuance unless otherwise specified. The Company reserves the right to modify, suspend, or discontinue any Credits program at any time.</p>
        </section>

        {/* Section 5 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>5. Professional Conduct — Things You Must Not Do</h2>
          <p>In addition to the general Prohibited Conduct in Section 8 of the User Agreement and the accuracy obligations in Section 7.5, as a Contractor you specifically agree that you will not:</p>
          <ol type="a">
            <li><strong>Misrepresent your qualifications.</strong> Claim to hold any licence, certification, insurance, or credential that you do not currently and validly hold;</li>
            <li><strong>Circumvent the Platform.</strong> Solicit, accept, or arrange payment from a Client outside the Platform for any services introduced through the Platform, whether during or after a Job engagement (see Section 6 for full Non-Circumvention terms);</li>
            <li><strong>Conduct yourself unsafely.</strong> Perform work that you know or reasonably ought to know poses a safety risk to the Client, occupants, neighbouring properties, or the public;</li>
            <li><strong>Abandon a Job.</strong> Leave a Job incomplete without Client agreement and without arranging an appropriate remedy, including referral to another qualified contractor;</li>
            <li><strong>Overcharge or upsell deceptively.</strong> Inflate the scope of work, recommend unnecessary repairs, or charge for work not performed;</li>
            <li><strong>Damage or misuse property.</strong> Intentionally or recklessly damage Client property, or use the Client&rsquo;s property, tools, or materials for any purpose other than the agreed Job;</li>
            <li><strong>Harass or intimidate.</strong> Use abusive, threatening, discriminatory, or harassing language or conduct toward Clients, Company staff, or any other person in connection with the Platform;</li>
            <li><strong>Operate without insurance.</strong> Accept or begin a Job when your required insurance coverage has lapsed, been cancelled, or is otherwise not in force;</li>
            <li><strong>Falsify records.</strong> Submit false, altered, or fabricated invoices, completion records, photos, certifications, or other documentation to the Company or to any Client.</li>
          </ol>
          <p>Breach of any item in this section is a <strong>material breach</strong> of these Contractor Terms and may result in immediate account suspension, termination, recovery of damages, and referral to applicable regulatory or law enforcement authorities.</p>
        </section>

        {/* Section 6 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>6. Non-Circumvention</h2>
          <p>The Platform invests significantly in Client acquisition and matching. In consideration of access to the Platform and its Client base, you agree that:</p>
          <p><strong>6.1</strong> For a period of <strong>36 months</strong> following the date on which you are first introduced to a Client through the Platform (the &ldquo;Exclusivity Period&rdquo;), you will not, directly or indirectly, provide the same or similar services to that Client outside the Platform, whether for payment or otherwise, without the Company&rsquo;s prior written consent.</p>
          <p><strong>6.2</strong> During the Exclusivity Period, if a Client contacts you directly and requests that you perform services outside the Platform, you must decline and direct the Client to use the Platform to book those services.</p>
          <p><strong>6.3</strong> In the event of a breach of this Section, the Company may, in addition to any other remedies, charge a <strong>circumvention fee equal to 20% of the estimated value of the circumvented services</strong>, as determined by the Company in good faith, and deduct that amount from any amounts owed to you or recover it by other lawful means.</p>
          <p><strong>6.4</strong> Nothing in this Section prevents you from servicing existing customers who were your customers prior to, and independently of, any introduction through the Platform, provided you can demonstrate that prior relationship.</p>
        </section>

        {/* Section 7 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>7. Step-In Rights</h2>
          <p><strong>7.1</strong> If, in the Company&rsquo;s reasonable judgment, you have: (a) abandoned a Job; (b) performed work that is unsafe, non-compliant, or substandard; (c) become unreachable after accepting a Job; or (d) failed to remedy a Client complaint within a reasonable time; the Company reserves the right to <strong>step in</strong> by arranging for another Contractor to complete or remediate the work.</p>
          <p><strong>7.2</strong> The cost of any step-in contractor, including any premium or expedited pricing, shall be <strong>deducted from amounts owed to you</strong> or recovered from you directly. If the step-in cost exceeds the Job value, you are liable for the difference.</p>
          <p><strong>7.3</strong> Exercise of step-in rights does not waive any other remedy available to the Company or to the Client, and does not limit your liability for any damages arising from your failure to perform.</p>
        </section>

        {/* Section 8 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>8. Termination</h2>
          <p><strong>8.1 By You.</strong> You may close your Contractor account at any time through your account settings. All Jobs in progress must be completed or transferred to another contractor with Client consent before deletion. Outstanding payments for completed Jobs will still be processed following account closure.</p>
          <p><strong>8.2 By Us.</strong> The Company may suspend or permanently terminate your Contractor account at any time, with or without notice, for: violation of these Contractor Terms or the User Agreement; fraudulent, abusive, or unsafe conduct; failure to maintain required insurance or licences; a pattern of poor performance, Client complaints, or low ratings; or any conduct we determine, in our sole discretion, to be detrimental to Clients, other Users, or the Platform.</p>
          <p><strong>8.3 Re-registration.</strong> If your account is terminated by the Company for cause, you may not re-register as a Contractor without the Company&rsquo;s prior written consent. The Company may use identifying information to prevent re-registration by terminated Contractors.</p>
          <p><strong>8.4 Effect of Termination.</strong> Upon termination: your right to access the Platform and accept new Jobs ceases immediately; the Company will process payment for any Jobs completed prior to termination in the ordinary course; and Sections 4(f), 4(g), 5, 6, 7, 9, and 10 of these Contractor Terms survive termination indefinitely.</p>
        </section>

        {/* Section 9 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>9. Disputes and Release</h2>
          <p><strong>9.1 Contractor-Client Disputes.</strong> Disputes between Contractors and Clients regarding quality, payment, or scope of work must first be submitted to the Company at <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> within <strong>7 days of Job completion</strong>. The Company will attempt to mediate disputes in good faith but does not guarantee any particular outcome. The Company&rsquo;s determination on dispute matters is final and binding on both parties for amounts within the Platform&rsquo;s control.</p>
          <p><strong>9.2 Release.</strong> To the fullest extent permitted by law, you hereby release the Company and its officers, directors, employees, and agents from any and all claims, demands, liabilities, and damages (actual and consequential) of every kind and nature, known and unknown, arising out of or in any way connected with disputes between you and any Client. You acknowledge that the Company is a neutral marketplace and that you assume all risks associated with Jobs arranged through the Platform.</p>
          <p><strong>9.3 Indemnification by Contractor.</strong> You agree to defend, indemnify, and hold harmless the Company from any third-party claims arising from: (a) your performance or non-performance of Services; (b) your breach of these Contractor Terms; (c) damage to property or injury to persons caused by you or your workers; or (d) your failure to comply with applicable laws, codes, or regulations.</p>
          <p><strong>9.4 Staged (Milestone) Jobs.</strong> On Jobs paid in stages, each stage is treated separately for payment and dispute purposes. Payment for a stage is held and released independently of the other stages (Client approval, or automatic release 3 calendar days after you mark that stage complete). If a Client raises a concern about a particular stage, <strong>only that stage&rsquo;s funds are frozen</strong> and the remaining schedule pauses while the concern is reviewed under Section 9.1; stages already released are unaffected. You acknowledge that a Client is not obligated to fund later stages, that you are paid only for stages that are funded and approved (or auto-approved), and that where the Company reasonably determines a stage was not performed or was defective, the held funds for that stage may be refunded to the Client in whole or in part.</p>

          <p><strong>9.5 Service Agreements, Uploaded Documents, and Electronic Signatures.</strong> For <strong>every Job</strong> you accept, you must send the Client a written service agreement through the Platform and <strong>both you and the Client must sign it electronically before any payment can be collected</strong> for that Job (single-payment, staged, and recurring alike). You may use the agreement the Platform generates from the Job details (and add your own additional clauses), or you may upload your own contract document. <strong>You are solely responsible for the content, accuracy, legality, and enforceability of any clauses you add or any document you upload,</strong> and for ensuring it complies with applicable law (including Alberta&rsquo;s <em>Consumer Protection Act</em>, prepaid-contracting rules, and the cancellation rights owed to the Client). Any service agreement or uploaded document is <strong>strictly between you and the Client.</strong> The Company is not a party to it, does not review or endorse it, and it must not, and will be deemed not to, <strong>place any liability, obligation, indemnity, warranty, or duty of any kind on the Company</strong>, waive or diminish any Client right under this Agreement or Alberta law, or purport to make the Company responsible for your Services; any such term is void as against the Company, and this User Agreement and the Client&rsquo;s non-waivable statutory rights prevail. You agree to defend, indemnify, and hold the Company harmless from any claim arising out of a clause you added or a document you uploaded. By typing your name and confirming your intent, you adopt an <strong>electronic signature with the same legal effect as a handwritten signature</strong> under Alberta&rsquo;s <em>Electronic Transactions Act</em>; the Platform records your name and the date, time, and network address of signing as a tamper-evident audit record. You must not send an agreement to sign until you are ready to be bound by it, and you must not collect or request payment for a gated Job outside the Platform to avoid this signing requirement.</p>
        </section>

        {/* Section 10 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>10. No Guarantee</h2>
          <p><strong>10.1</strong> The Company makes no guarantee that: (a) you will receive any minimum number of Job dispatches; (b) any particular volume of work will be available in your trade or service area; (c) any Job you are dispatched to will result in a confirmed booking; or (d) Client demand on the Platform will remain at any particular level.</p>
          <p><strong>10.2</strong> Your use of the Platform is entirely at-will. The Company may at any time modify dispatch criteria, expand or contract the Contractor pool, adjust service areas, or otherwise change the Platform in ways that affect the volume or type of work available to you, without liability to you.</p>
          <p><strong>10.3</strong> The Company does not guarantee payment from Clients beyond the amounts held or processed through the Platform. The Company is not responsible for Client non-payment where funds have not been collected through the Platform.</p>
        </section>

        {/* Section 11 */}
        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>11. Notifications</h2>
          <p><strong>11.1 Consent to Receive Communications.</strong> By registering as a Contractor, you expressly consent to receive communications from the Company by email, SMS, or push notification. These communications may include: new Job dispatch alerts; scheduling and appointment reminders; payment confirmations and receipts; policy updates and amendments to these Contractor Terms; promotional offers and Platform updates; and account status notices.</p>
          <p><strong>11.2 Dispatch Alerts.</strong> Job dispatch notifications are time-sensitive. You acknowledge that the Company cannot guarantee delivery of dispatch alerts and that delays caused by your email provider, device settings, or connectivity are not the Company&rsquo;s responsibility. You agree to maintain a valid, regularly monitored email address on your account at all times.</p>
          <p><strong>11.3 Opt-Out.</strong> You may opt out of non-essential marketing communications at any time by using the unsubscribe link in any email or by updating your notification preferences in your Contractor dashboard. You may not opt out of transactional or legal communications (such as payment receipts, account notices, and policy updates) while your account is active.</p>
          <p><strong>11.4 Legal Notices.</strong> Any notice required under these Contractor Terms must be sent by email to <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> (if to the Company) or to your registered email address (if to you). Legal notices are deemed received: (a) if sent by email, 24 hours after transmission; and (b) if sent by registered mail to the address on file, 5 business days after mailing.</p>
        </section>

        <section style={{ marginBottom:"2.5rem" }}>
          <h2 style={{ fontSize:"1.4rem", marginBottom:".75rem" }}>12. Contact Us</h2>
          <p>
            <strong>Freddy FixIt Contractors Inc.</strong><br />
            20 Whiteram Mews NE<br />
            Calgary, AB &nbsp;T1Y 5W5<br />
            <a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a>
          </p>
        </section>

        <div style={{ borderTop:"1px solid rgba(var(--ff-fg), .08)", paddingTop:"2rem", marginTop:"2rem", textAlign:"center" }}>
          <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .3)" }}>
            &copy; {new Date().getFullYear()} Freddy FixIt Contractors Inc. &nbsp;·&nbsp;
            <a href="/privacy-policy" style={{ color:"rgba(var(--ff-muted), .4)" }}>Privacy Policy</a> &nbsp;·&nbsp;
            <a href="/homeowner-protection-promise" style={{ color:"rgba(var(--ff-muted), .4)" }}>Protection Promise</a>
          </p>
        </div>
      </div>
    </div>
  );
}
