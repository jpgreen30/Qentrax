import Link from "next/link";
import ContactForm from "@/components/ContactForm";

const markets=[
 ["01","⌂","Real estate","Buyer, seller, investor and property inquiry opportunities routed by location, intent and timeframe.","BUYER · SELLER · INVESTOR"],
 ["02","◇","Insurance","Consumer demand across protection products, matched against geography, eligibility and buyer appetite.","AUTO · LIFE · HOME · HEALTH"],
 ["03","▦","Mortgage","Purchase, refinance and home-equity interest filtered by borrower profile and campaign criteria.","PURCHASE · REFI · HELOC"],
 ["04","§","Legal","Case inquiries evaluated for practice-area fit, jurisdiction, timing and intake requirements.","PI · MASS TORT · CONSUMER"],
 ["05","⌁","Home services","Project-ready homeowners connected to qualified providers based on service need and coverage area.","SOLAR · ROOFING · HVAC · WINDOWS"],
 ["06","$","Finance","Borrowers and business owners matched to lending programs by intent, profile and product criteria.","PERSONAL LOANS · BUSINESS LOANS"]
];
const shield=[
 ["01","IDENTITY","Contact integrity","Phone, email, address and carrier signals are normalized and checked for validity before bidding begins.","VALIDATE"],
 ["02","CONSENT","Proof attached","Consent metadata, source, timestamp and disclosure context travel with the opportunity for traceable review.","VERIFY"],
 ["03","FRAUD GRAPH","Patterns exposed","Velocity, duplication, device and behavioral anomalies are evaluated across the network—not in isolation.","DETECT"],
 ["04","BUYER FIT","Rules enforced","Geo, schedule, caps, exclusions, economics and custom acceptance logic determine the optimal destination.","ROUTE"]
];
const connectors=[["↯","Real-time delivery","REST API, ping/post and configurable webhooks deliver accepted opportunities in milliseconds."],["⌘","CRM-ready mapping","Map Qentrax data into your existing objects, fields, owners, campaigns and lead statuses."],["☎","Call routing","Send qualified calls and contact records into dialers, queues and call-center workflows."],["↻","Closed-loop feedback","Return dispositions, sales outcomes and rejects to continuously improve routing decisions."],["◇","Automation layer","Trigger notifications and downstream workflows through Zapier, Make, n8n, email, SMS or Slack."],["▦","Flexible transfer","Support secure batch delivery and scheduled exports when real-time delivery is not required."]];

export default function Home(){return <main>
 <nav className="nav shell"><a className="brand" href="#top"><i>Q</i>QENTRAX</a><div><a href="#verticals">Markets</a><Link href="/advertiser">Advertisers</Link><Link href="/publisher">Publishers</Link><a href="#security">Q-Shield</a><Link href="/blog">Blog</Link><a href="#company">Company</a><a href="#contact">Contact</a></div><Link href="/sign-in">ENTER NETWORK <span>↗</span></Link></nav>
 <section className="hero shell" id="top"><div><p className="eyebrow"><b/> THE DEMAND EXCHANGE IS LIVE</p><h1>Consumer demand.<br/><em>Cleared in real time.</em></h1><p className="lede">One AI-native connection to verify, enrich, bid, route and deliver high-intent consumer opportunities.</p><aside><a className="primary" href="#network">BUY OPPORTUNITIES <span>↗</span></a><a className="outline" href="#network">MONETIZE TRAFFIC</a></aside><small>✓ TCPA CONSENT PROOF　 ✓ REAL-TIME VALIDATION　 ✓ API-FIRST DELIVERY</small></div><div className="terminal"><header><span><b/> QENTRAX LIVE</span><span>US-EAST · 12MS</span></header><div className="radar"><i/><i/><strong>Q<small>ROUTING</small></strong><b/><b/><b/></div><section>{[["QL-88214","AUTO","VERIFIED","$42.80"],["QL-88215","SOLAR","3 BIDS","$68.25"],["QL-88216","LIFE","ROUTED","$31.40"],["QL-88217","HOME","VERIFIED","$54.10"]].map(r=><div key={r[0]}><code>{r[0]}</code><span>{r[1]}</span><b>{r[2]}</b><strong>{r[3]}</strong></div>)}</section><footer><span>98.7% ACCEPTED</span><span>$2.4M CLEARED / 24H</span></footer></div></section>
 <div className="ticker"><span>01　<b>VERIFY</b>　Identity, phone, email & consent</span><span>02　<b>ENRICH</b>　Append intent & audience data</span><span>03　<b>BID</b>　Compete in milliseconds</span><span>04　<b>ROUTE</b>　Deliver to any endpoint</span></div>
 <section className="verticals shell" id="verticals"><header><label>ACTIVE MARKETS</label><h2>High-intent demand.<br/>Across essential categories.</h2><p>One exchange, purpose-built rules. Qentrax adapts validation, compliance, scoring and delivery logic to the economics of each market.</p></header><div className="verticalGrid">{markets.map(m=><article key={m[0]}><span>{m[0]}</span><i>{m[1]}</i><h3>{m[2]}</h3><p>{m[3]}</p><small>{m[4]}</small></article>)}</div><div className="sectionFoot"><span>NEED A CUSTOM MARKET?</span><p>Qentrax rules can be configured for additional high-consideration consumer categories.</p><a href="mailto:network@qentrax.io">TALK TO THE NETWORK ↗</a></div></section>
 <section className="rolesBlock shell" id="network"><header className="splitHead"><div><label>01 / THE NETWORK</label><h2>Built for both sides<br/>of the transaction.</h2></div><p>Qentrax connects trusted demand sources to serious buyers with transparent economics, programmable controls and intelligence at every hop.</p></header><div className="roles"><article><label>FOR ADVERTISERS</label><h3>Buy outcomes,<br/>not empty clicks.</h3><p>Define exactly what you want. Set filters, bids, caps and delivery rules. Pay only for accepted opportunities.</p><ul><li>Real-time ping/post bidding</li><li>Flexible targeting & bid rules</li><li>CRM, webhook & call delivery</li><li>Returns and dispute controls</li></ul><Link href="/sign-in">REGISTER AS AN ADVERTISER ↗</Link></article><article><label>FOR PUBLISHERS</label><h3>Turn intent into<br/>durable revenue.</h3><p>Connect your forms, calls or traffic once. Access qualified buyers, clear pricing and automated reconciliation.</p><ul><li>One integration, multiple buyers</li><li>Live bid and disposition data</li><li>Quality feedback by source</li><li>Transparent earnings ledger</li></ul><Link href="/sign-in">REGISTER AS A PUBLISHER ↗</Link></article></div></section>
 <section className="engine"><div className="shell"><div><label>02 / INTELLIGENCE LAYER</label><h2>Every opportunity<br/>earns its route.</h2><p>Qentrax scores identity, consent, intent, duplication and buyer fit before your team ever sees the record.</p></div><div className="score"><header>OPPORTUNITY / QL-88218 <b>LIVE SCORE</b></header><section><strong>94<small>Q-SCORE</small></strong><div>{[["IDENTITY","96"],["INTENT","91"],["CONSENT","100"],["BUYER FIT","89"]].map(x=><p key={x[0]}><span>{x[0]}</span><i style={{width:`${x[1]}%`}}/><b>{x[1]}</b></p>)}</div></section><footer><span>DECISION</span><b>ACCEPT & ROUTE</b><strong>$61.20</strong></footer></div></div></section>
 <section className="shield" id="security"><div className="shell"><header className="splitHead"><div><label>03 / Q-SHIELD™ FILTERING</label><h2>Bad data stops here.</h2></div><p>Our proprietary decision layer examines every opportunity across identity, consent, behavior and buyer-specific rules—then blocks, scores or routes it in milliseconds.</p></header><div className="filterFlow">{shield.map(s=><article key={s[0]}><span>{s[0]}</span><i>{s[1]}</i><h3>{s[2]}</h3><p>{s[3]}</p><b>● {s[4]}</b></article>)}</div><div className="securityGrid"><div><label>SECURITY-GRADE CONTROLS</label><h3>Protected from intake<br/>to final delivery.</h3><p>Qentrax minimizes exposure while keeping every action attributable. Sensitive lead data stays behind controlled delivery paths, with accountability built into the transaction lifecycle.</p><ul><li><strong>Tokenized identifiers</strong><span>Limit unnecessary PII exposure during matching and bidding.</span></li><li><strong>Encrypted transport</strong><span>Protected API and webhook delivery between approved endpoints.</span></li><li><strong>Role-based access</strong><span>Keep campaign, billing and lead permissions separated by responsibility.</span></li><li><strong>Immutable event trail</strong><span>Trace validation, bid, route, delivery and disposition events.</span></li></ul></div><div className="vault"><header><span>Q-SHIELD / EVENT TRACE</span><b>PROTECTED</b></header><div className="vaultCore"><i>Q</i><strong>TRUST ENVELOPE</strong><small>OPPORTUNITY QL-88218</small></div><section>{[["CONSENT PROOF","ATTACHED"],["PII EXPOSURE","MINIMIZED"],["ENDPOINT","AUTHORIZED"],["EVENT LEDGER","SEALED"]].map(x=><p key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></p>)}</section><footer>RELEASED TO APPROVED BUYER · 14MS</footer></div></div></div></section>
 <section className="workflow"><div className="shell"><header className="splitHead"><div><label>04 / WORKFLOW INTEGRATION</label><h2>Fits the workflow<br/>you already run.</h2></div><p>Keep your CRM, dialer and sales process. Qentrax becomes the intelligence and routing layer between consumer demand and your existing revenue workflow.</p></header><div className="workflowMap"><div><small>DEMAND INPUTS</small><span>→ WEB FORMS</span><span>→ INBOUND CALLS</span><span>→ PARTNER API</span><span>→ BATCH SOURCES</span></div><div className="qLayer"><em>Q</em><strong>QENTRAX</strong><span>INTELLIGENCE LAYER</span><ul><li>FILTER</li><li>SCORE</li><li>MATCH</li><li>DELIVER</li></ul></div><div><small>YOUR EXISTING STACK</small><span>CRM ✓</span><span>DIALER / CALL CENTER ✓</span><span>MARKETING AUTOMATION ✓</span><span>DATA WAREHOUSE ✓</span></div></div><div className="connectors">{connectors.map(c=><article key={c[1]}><i>{c[0]}</i><div><h3>{c[1]}</h3><p>{c[2]}</p></div></article>)}</div></div></section>
 <section className="api shell" id="api"><div><label>05 / ONE CONNECTION</label><h2>From signal to sale<br/>in milliseconds.</h2><p>Modern APIs. Familiar workflows. Full visibility from first ping to final disposition.</p></div><pre>{`POST /v1/opportunities\n\n{\n  "vertical": "solar",\n  "consent": { "verified": true },\n  "location": { "state": "CA" },\n  "intent_score": 94\n}\n\n→ 200 ACCEPTED  $61.20`}</pre></section>
 <section className="intelligence" id="insights"><div className="shell"><header className="splitHead"><div><label>06 / SIGNALS</label><h2>Signals worth<br/>paying attention to.</h2></div><p>Analysis and practical guidance for teams buying, monetizing and operationalizing consumer demand.</p></header><div className="signalGrid">
  <article><span>01</span><label>Q-SHIELD / LEAD QUALITY</label><p style={{marginTop:12}}>Why single-point lead validation is no longer enough</p><p style={{fontSize:11,color:"#7a8b8f",marginTop:16}}>Fraud is a pattern, not a field. Learn how network-level signals expose risk that isolated checks miss.</p><Link href="/blog/lead-validation" style={{position:"absolute",bottom:25,font:"8px var(--mono)",color:"var(--acid)"}}>READ THE BRIEFING ↗</Link></article>
  <article><span>02</span><label>COMPLIANCE / CONSENT</label><p style={{marginTop:12}}>Building a consent trail buyers can actually use</p><p style={{fontSize:11,color:"#7a8b8f",marginTop:16}}>What source, timestamp, disclosure and delivery evidence should travel with every opportunity.</p><Link href="/blog/consent-trail" style={{position:"absolute",bottom:25,font:"8px var(--mono)",color:"var(--acid)"}}>READ THE BRIEFING ↗</Link></article>
  <article><span>03</span><label>OPERATIONS / WORKFLOWS</label><p style={{marginTop:12}}>Closing the loop between lead delivery and revenue</p><p style={{fontSize:11,color:"#7a8b8f",marginTop:16}}>How disposition feedback makes routing, pricing and source optimization smarter over time.</p><Link href="/blog/closed-loop-revenue" style={{position:"absolute",bottom:25,font:"8px var(--mono)",color:"var(--acid)"}}>READ THE BRIEFING ↗</Link></article>
 </div></div></section>
<section className="cases" id="case-studies">
<div className="shell">
<header>
<div>
<label>07 / CASE STUDIES</label>
<h2>Demand systems built<br/>around the outcome.</h2>
</div>
<p>Two examples of how Qentrax can be configured around vertical-specific quality, economics and delivery requirements.</p>
</header>
<div className="caseGrid">
<article className="lifeCase">
<div className="caseTop">
<span>CASE STUDY / LIFE INSURANCE</span>
<b>MODELED OUTCOMES</b>
</div>
<div className="caseHero">
<div>
<small>NATIONAL LIFE INSURANCE BUYER</small>
<h3>More conversations with prospects who actually fit.</h3>
<p>A multi-state insurance buyer needed to reduce invalid contacts, enforce state and product eligibility, and deliver qualified prospects into its existing sales workflow without slowing response time.</p>
</div>
<i>LI</i>
</div>
<div className="caseBody">
<div>
<label>THE CHALLENGE</label>
<ul>
<li>Duplicate and recycled prospect records</li>
<li>Inconsistent consent evidence by source</li>
<li>State, age and product-fit complexity</li>
<li>Limited feedback from policy outcomes</li>
</ul>
</div>
<div>
<label>THE QENTRAX CONFIGURATION</label>
<ul>
<li>Phone, email and identity verification</li>
<li>Consent proof attached to each record</li>
<li>Eligibility rules before bidding</li>
<li>CRM disposition feedback into Q-Score</li>
</ul>
</div>
</div>
<div className="caseMetrics">
<span>
<strong>−34%</strong>
<small>MODELED INVALID CONTACTS</small>
</span>
<span>
<strong>+22%</strong>
<small>MODELED CONTACT RATE</small>
</span>
<span>
<strong>18ms</strong>
<small>DECISION TARGET</small>
</span>
</div>
<footer>
<p>Qentrax sits between acquisition sources and the buyer’s CRM, filtering for insurable intent before the sales team spends time or money.</p>
<a href="#contact">BUILD A LIFE CAMPAIGN ↗</a>
</footer>
</article>
<article className="solarCase">
<div className="caseTop">
<span>CASE STUDY / HOME SERVICES</span>
<b>MODELED OUTCOMES</b>
</div>
<div className="caseHero">
<div>
<small>REGIONAL SOLAR INSTALLER NETWORK</small>
<h3>Route every homeowner to the right market, team and bid.</h3>
<p>A solar network needed to identify project-ready homeowners, prevent duplicate distribution and route each opportunity by service area, utility market and installer capacity.</p>
</div>
<i>☀</i>
</div>
<div className="caseBody">
<div>
<label>THE CHALLENGE</label>
<ul>
<li>Overlapping territories and buyer coverage</li>
<li>Duplicate homeowners across campaigns</li>
<li>Property and utility qualification gaps</li>
<li>Capacity changing throughout the day</li>
</ul>
</div>
<div>
<label>THE QENTRAX CONFIGURATION</label>
<ul>
<li>Address, homeowner and service-area checks</li>
<li>Network-level duplicate suppression</li>
<li>Dynamic caps, schedules and bid rules</li>
<li>Instant CRM and call-center delivery</li>
</ul>
</div>
</div>
<div className="caseMetrics">
<span>
<strong>+29%</strong>
<small>MODELED ACCEPTANCE</small>
</span>
<span>
<strong>−41%</strong>
<small>MODELED DUPLICATES</small>
</span>
<span>
<strong>94</strong>
<small>TARGET Q-SCORE</small>
</span>
</div>
<footer>
<p>Qentrax turns one solar inquiry into a controlled marketplace decision—matching geography, quality and live installer demand.</p>
<a href="#contact">BUILD A SOLAR CAMPAIGN ↗</a>
</footer>
</article>
</div>
<div className="caseDisclosure">
<span>ABOUT THESE STUDIES</span>
<p>Figures shown are modeled program outcomes for illustrative configurations, not claims of historical client performance. Verified results can replace them as programs mature.</p>
</div>
</div>
</section>
 <section className="company" id="company"><div className="shell"><div><label>08 / ABOUT QENTRAX</label><h2>Infrastructure for a more accountable demand market.</h2><p>Qentrax is an AI-native marketplace built for the teams that create, buy and convert consumer demand. We connect trusted publishers with serious advertisers, then apply intelligence to every step between first signal and final outcome.</p><p style={{color:"var(--muted)",lineHeight:1.7,marginTop:16}}>Our platform is designed around a simple principle: better evidence creates better transactions. That means clearer quality signals, programmable economics, protected delivery and feedback that improves the network.</p><div className="stats"><span><b>REAL TIME</b><small>DECISIONING</small></span><span><b>TWO-SIDED</b><small>MARKETPLACE</small></span><span><b>API FIRST</b><small>INFRASTRUCTURE</small></span></div></div><div className="mission"><label>OUR MISSION</label><h3>Make every consumer opportunity traceable, measurable and worthy of action.</h3><p>We are building the trust and intelligence layer for consumer demand—so publishers are rewarded for quality, buyers gain control, and consumers move through a more responsible ecosystem.</p><ul style={{listStyle:"none",padding:0,marginTop:24}}><li style={{padding:"8px 0",borderTop:"1px solid #ffffff1b",fontSize:13}}><strong>01</strong> · Raise the quality floor — Evidence before volume.</li><li style={{padding:"8px 0",borderTop:"1px solid #ffffff1b",fontSize:13}}><strong>02</strong> · Protect the transaction — Control access and exposure.</li><li style={{padding:"8px 0",borderTop:"1px solid #ffffff1b",fontSize:13}}><strong>03</strong> · Align every outcome — Learn from real dispositions.</li></ul></div></div></section>
 <section className="contact shell" id="contact"><div><label>08 / CONTACT THE NETWORK</label><h2>Let’s design your<br/>connection.</h2><p>Tell us whether you buy demand, generate it, or need a custom integration. Our network team will map the right path.</p><a href="mailto:network@qentrax.io">network@qentrax.io</a></div><ContactForm/></section>
 <section className="cta"><div className="shell"><label>THE MARKET IS MOVING.</label><h2>Connect to demand<br/>that compounds.</h2><aside><Link className="ctaPrimary" href="/advertiser">START BUYING ↗</Link><Link className="ctaSecondary" href="/publisher">START EARNING ↗</Link></aside></div></section>
 <footer className="sitefoot shell"><a className="brand" href="#top"><i>Q</i>QENTRAX</a><p>The AI-native marketplace for consumer demand.</p><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link><Link href="/blog">Blog</Link><a href="#contact">Contact</a></div><small>© 2026 QENTRAX, INC. · ALL SYSTEMS OPERATIONAL · Powered by Qentrax MCP</small></footer>
 </main>}
