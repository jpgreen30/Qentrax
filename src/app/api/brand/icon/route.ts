import { QENTRAX_APPLE_ICON_PNG } from "@/lib/brand/qentrax-apple-icon";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return new Response(new Uint8Array(QENTRAX_APPLE_ICON_PNG), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
