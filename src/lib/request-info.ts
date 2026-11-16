import { headers } from "next/headers";

/**
 * Extracts client IP and origin from incoming request headers inside Server Actions.
 */
export async function readClientRequestInfo(): Promise<{
  ip: string;
  origin: string;
}> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  const realIp = hdrs.get("x-real-ip");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    "unknown";

  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const origin = host ? `${proto}://${host}` : "https://tendly.app";

  return { ip, origin };
}
