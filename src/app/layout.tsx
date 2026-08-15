import type { Metadata } from "next";
import "./globals.css";
import "./cases.css";
import "./dashboard.css";
import "./portal-adv.css";
import "./blog.css";
import "./site-footer.css";
import "./workspace-actions.css";
export const metadata: Metadata = {
  title: "Qentrax | Verified demand. Measurable growth.",
  description: "Qentrax connects verified consumer demand with qualified advertisers.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
