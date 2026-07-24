/**
 * IP del cliente para rate limiting (puro, testeable). En Vercel el IP real llega en
 * `x-forwarded-for` (primer hop = cliente; el resto son proxies); `x-real-ip` de respaldo.
 * Nunca confíes en esto para autorización — es spoofeable; sirve solo para throttling.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}
