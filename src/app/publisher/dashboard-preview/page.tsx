import type {Metadata} from "next";
import Dashboard from "@/components/Dashboard";
export const metadata:Metadata={title:"Publisher Dashboard Preview — Qentrax",description:"Explore the Qentrax publisher workspace for sources, quality, earnings, transactions and payouts."};
export default function PublisherDashboardPreview(){return <Dashboard role="publisher"/>}
