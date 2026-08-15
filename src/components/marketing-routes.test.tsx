import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BlogPage from "@/app/blog/page";
import { NetworkMarketingPage } from "./network-marketing-page";

describe("approved marketing routes",()=>{
  it("renders advertiser controls and evidence without requiring funding at registration",()=>{
    const html=renderToStaticMarkup(<NetworkMarketingPage kind="advertiser"/>);
    expect(html).toContain("Demand that fits.");
    expect(html).toContain("FUND WHEN YOU LAUNCH");
    expect(html).toContain("Traceable decision reasons");
  });

  it("renders publisher source controls and the configured payout threshold",()=>{
    const html=renderToStaticMarkup(<NetworkMarketingPage kind="publisher"/>);
    expect(html).toContain("More value from");
    expect(html).toContain("PAYOUTS AFTER THE $100 THRESHOLD");
    expect(html).toContain("Do I pay anything to register?");
  });

  it("renders the approved Field Notes categories and featured analysis",()=>{
    const html=renderToStaticMarkup(<BlogPage/>);
    expect(html).toContain("Intelligence for the");
    expect(html).toContain("LEAD QUALITY");
    expect(html).toContain("The new quality stack: from validation to evidence.");
  });
});
