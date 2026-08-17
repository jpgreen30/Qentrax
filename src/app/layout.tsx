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
  description:
    "Qentrax connects verified consumer demand with qualified advertisers.",
  applicationName: "Qentrax",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "any" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: "/icon.png",
  },
  openGraph: {
    title: "Qentrax | Verified demand. Measurable growth.",
    description:
      "Qentrax connects verified consumer demand with qualified advertisers.",
    url: "https://www.qentrax.io",
    siteName: "Qentrax",
    images: [{ url: "/icon.png", width: 180, height: 180, alt: "Qentrax" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Qentrax",
    description:
      "Qentrax connects verified consumer demand with qualified advertisers.",
    images: ["/icon.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
