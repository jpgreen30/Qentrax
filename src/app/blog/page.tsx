"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { RouteFooter } from "@/components/network-marketing-page";

const notes=[
 ["01","LEAD QUALITY","Q","8 MIN READ","Why single-point lead validation is no longer enough","Fraud is a pattern, not a field. Network-level signals expose risk that isolated phone, email and identity checks miss."],
 ["02","COMPLIANCE","✓","6 MIN READ","Building a consent trail buyers can actually use","The source, timestamp, disclosure and delivery evidence that should travel with every consumer opportunity."],
 ["03","WORKFLOWS","→","7 MIN READ","Closing the loop between lead delivery and revenue","How disposition feedback makes routing, pricing and source optimization measurably smarter over time."],
 ["04","VERTICALS","Q","9 MIN READ","Designing eligibility rules before the first bid","A practical framework for state, product, age, consent and buyer-appetite rules in insurance demand."],
 ["05","VERTICALS","☀","7 MIN READ","The solar routing problem is really five problems","Territory, utility market, property fit, capacity and duplicate suppression must resolve in one decision."],
 ["06","MARKETPLACE","Q","5 MIN READ","Why transparent dispositions improve both sides of demand","Publishers need actionable feedback and buyers need accountability. A shared ledger aligns the market."]
];
const filters=["ALL","LEAD QUALITY","COMPLIANCE","WORKFLOWS","VERTICALS","MARKETPLACE"];

export default function BlogPage(){
 const [filter,setFilter]=useState("ALL");
 const [subscribed,setSubscribed]=useState(false);
 const filtered=useMemo(()=>filter==="ALL"?notes:notes.filter(note=>note[1]===filter),[filter]);
 function subscribe(event:FormEvent<HTMLFormElement>){event.preventDefault();setSubscribed(true)}
 return <main className="routePage blogPage">
  <nav className="routeNav shell"><Link className="routeBrand" href="/"><i>Q</i><span>QENTRAX</span></Link><div><Link href="/">Marketplace</Link><Link href="/#deployments">Case Studies</Link><Link href="/#company">Company</Link><Link href="/#contact">Contact</Link></div><Link className="routeRegister" href="/sign-in">ENTER NETWORK ↗</Link></nav>
  <section className="blogHero shell"><p className="routeEyebrow"><b/> QENTRAX FIELD NOTES</p><div><h1>Intelligence for the<br/><em>demand economy.</em></h1><p>Research, operating frameworks and practical guidance for teams that buy, generate and convert consumer demand.</p></div></section>
  <nav className="blogFilters shell" aria-label="Filter field notes"><span>EXPLORE</span>{filters.map(item=><button type="button" aria-pressed={filter===item} onClick={()=>setFilter(item)} key={item}>{item}</button>)}</nav>
  {filter==="ALL"&&<section className="featuredNote shell"><div className="qualitySignal"><label>FEATURED / Q-SHIELD</label><div><b>Q</b><span>QUALITY SIGNAL</span></div><small>IDENTITY　CONSENT　BEHAVIOR　BUYER FIT</small></div><article><label>FEATURED ANALYSIS · 11 MIN READ</label><h2>The new quality stack: from validation to evidence.</h2><p>Lead quality cannot be reduced to a phone check and a score. The modern stack evaluates identity, provenance, behavior, eligibility and outcome evidence as one continuous decision system.</p><small>BY QENTRAX RESEARCH　 AUGUST 14, 2026</small><Link href="#latest">READ THE ANALYSIS　↗</Link></article></section>}
  <section className="latestNotes shell" id="latest"><header className="routeSplit"><div><label>LATEST INTELLIGENCE</label><h2>From the network.</h2></div><p>Field notes for operators building more efficient, accountable demand programs.</p></header><div className="notesGrid">{filtered.map(note=><article key={note[0]}><span>{note[0]} / {note[1]}</span><i>{note[2]}</i><label>{note[1]} · {note[3]}</label><h3>{note[4]}</h3><p>{note[5]}</p><a href={`mailto:research@qentrax.io?subject=${encodeURIComponent(note[4])}`}>READ FIELD NOTE　↗</a></article>)}</div></section>
  <section className="subscribeSection"><form className="shell" onSubmit={subscribe}><div><label>THE QENTRAX FIELD NOTES</label><h2>One useful signal.<br/>Delivered monthly.</h2><p>Quality, compliance and demand operations. No noise.</p></div>{subscribed?<p className="subscribeSuccess" role="status">THANK YOU. SUBSCRIPTION REQUEST RECEIVED.</p>:<div className="subscribeControl"><label htmlFor="field-note-email">WORK EMAIL</label><input id="field-note-email" type="email" required placeholder="you@company.com"/><button className="primary" type="submit">SUBSCRIBE　↗</button></div>}</form></section>
  <RouteFooter copyright="FIELD NOTES"/>
 </main>
}
