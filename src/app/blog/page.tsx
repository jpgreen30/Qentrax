import type {Metadata} from "next";
import Link from "next/link";

export const metadata:Metadata={
  title:"Qentrax Field Notes — Intelligence for the demand economy",
  description:"Research, operating frameworks and practical guidance for teams that buy, generate and convert consumer demand."
};

const notes=[
  ["01","LEAD QUALITY","Q","8 MIN","Why single-point lead validation is no longer enough","Fraud is a pattern, not a field. Network-level signals expose risk that isolated phone, email and identity checks miss.","graph","/blog/lead-validation"],
  ["02","CONSENT","✓","6 MIN","Building a consent trail buyers can actually use","The source, timestamp, disclosure and delivery evidence that should travel with every consumer opportunity.","proof","/blog/consent-trail"],
  ["03","WORKFLOWS","→","7 MIN","Closing the loop between lead delivery and revenue","How disposition feedback makes routing, pricing and source optimization measurably smarter over time.","flow","/blog/closed-loop-revenue"],
  ["04","INSURANCE","Q","9 MIN","Designing eligibility rules before the first bid","A practical framework for state, product, age, consent and buyer-appetite rules in insurance demand.","rules","/blog/insurance-eligibility-rules"],
  ["05","HOME SERVICES","☀","7 MIN","The solar routing problem is really five problems","Territory, utility market, property fit, capacity and duplicate suppression must resolve in one decision.","solar","/blog/solar-lead-routing"],
  ["06","MARKETPLACE","Q","5 MIN","Why transparent dispositions improve both sides of demand","Publishers need actionable feedback and buyers need accountability. A shared ledger aligns the market.","ledger","/blog/transparent-dispositions"],
];

export default function BlogPage(){
  return (
    <main className="blogPage">
      <nav className="blogNav shell">
        <Link className="brand" href="/"><i>Q</i>QENTRAX</Link>
        <div>
          <Link href="/">Marketplace</Link>
          <a href="/#case-studies">Case Studies</a>
          <a href="/#company">Company</a>
          <a href="/#contact">Contact</a>
        </div>
        <a className="blogNavCta" href="/#network">ENTER NETWORK ↗</a>
      </nav>

      <header className="blogHero shell">
        <div>
          <p><b /> QENTRAX FIELD NOTES</p>
          <h1>Intelligence for the<br/><em>demand economy.</em></h1>
        </div>
        <p>Research, operating frameworks and practical guidance for teams that buy, generate and convert consumer demand.</p>
      </header>

      <div className="blogCategories shell">
        <span>EXPLORE</span>
        <button className="on" type="button">ALL</button>
        <button type="button">LEAD QUALITY</button>
        <button type="button">COMPLIANCE</button>
        <button type="button">WORKFLOWS</button>
        <button type="button">VERTICALS</button>
        <button type="button">MARKETPLACE</button>
      </div>

      <section className="featured shell">
        <div className="featuredVisual">
          <span>FEATURED / Q-SHIELD</span>
          <div className="featureRadar">
            <i /><i />
            <b>Q</b>
            <em>QUALITY SIGNAL</em>
          </div>
          <small>IDENTITY　CONSENT　BEHAVIOR　BUYER FIT</small>
        </div>
        <article>
          <label>FEATURED ANALYSIS · 11 MIN READ</label>
          <h2>The new quality stack: from validation to evidence.</h2>
          <p>Lead quality cannot be reduced to a phone check and a score. The modern stack evaluates identity, provenance, behavior, eligibility and outcome evidence as one continuous decision system.</p>
          <div>
            <span>BY QENTRAX RESEARCH</span>
            <span>AUGUST 14, 2026</span>
          </div>
          <Link href="/blog/quality-stack">READ THE ANALYSIS　↗</Link>
        </article>
      </section>

      <section className="blogArticles shell" id="articles">
        <header>
          <div>
            <label>LATEST INTELLIGENCE</label>
            <h2>From the network.</h2>
          </div>
          <p>Field notes for operators building more efficient, accountable demand programs.</p>
        </header>
        <div className="articleGrid">
          {notes.map(([num, cat, icon, time, title, body, visual, href])=>(
            <article key={num}>
              <div className={`articleVisual ${visual}`}>
                <span>{num} / {cat}</span>
                <i /><i />
                <b>{icon}</b>
              </div>
              <small>{cat} · {time} READ</small>
              <h3>{title}</h3>
              <p>{body}</p>
              <Link href={href}>READ FIELD NOTE　↗</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="blogSubscribe">
        <div className="shell">
          <div>
            <label>THE QENTRAX FIELD NOTES</label>
            <h2>One useful signal.<br/>Delivered monthly.</h2>
          </div>
          <form action="#" method="post">
            <input type="email" required placeholder="Work email address" />
            <button type="submit">SUBSCRIBE ↗</button>
            <small>No spam. Unsubscribe any time.</small>
          </form>
        </div>
      </section>

      <footer className="blogFooter sitefoot shell">
        <Link className="brand" href="/"><i>Q</i>QENTRAX</Link>
        <p>The AI-native marketplace for consumer demand.</p>
        <div>
          <a href="/#platform">Platform</a>
          <a href="/#case-studies">Case Studies</a>
          <Link href="/blog">Blog</Link>
          <a href="/#about">About</a>
          <a href="/#contact">Contact</a>
        </div>
        <small>© 2026 QENTRAX, INC. · ALL SYSTEMS OPERATIONAL</small>
      </footer>
    </main>
  );
}
