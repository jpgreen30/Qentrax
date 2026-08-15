import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Qentrax | Verified demand. Measurable growth.", description: "Qentrax connects verified consumer demand with qualified advertisers." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
