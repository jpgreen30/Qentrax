import type { Metadata } from "next";
import { NetworkMarketingPage } from "@/components/network-marketing-page";

export const metadata:Metadata={title:"Qentrax for Advertisers — Buy Qualified Consumer Demand",description:"Build campaigns around qualified consumer opportunities with real-time verification, bidding, routing and outcome feedback."};
export default function AdvertiserPage(){return <NetworkMarketingPage kind="advertiser"/>}
