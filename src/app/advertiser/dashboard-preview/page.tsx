import type {Metadata} from "next";
import Dashboard from "@/components/Dashboard";
export const metadata:Metadata={title:"Advertiser Dashboard Preview — Qentrax",description:"Explore the Qentrax advertiser workspace for campaigns, quality, delivery and outcomes."};
export default function AdvertiserDashboardPreview(){return <Dashboard role="advertiser"/>}
