import type { Metadata } from "next";
import { NetworkMarketingPage } from "@/components/network-marketing-page";

export const metadata:Metadata={title:"Qentrax for Publishers — Monetize Qualified Consumer Demand",description:"Connect qualified consumer demand to eligible buyers with validation, bidding, routing and transparent earnings."};
export default function PublisherPage(){return <NetworkMarketingPage kind="publisher"/>}
