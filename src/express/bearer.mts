export interface BearerToken {
  token: string;
  raw: string;
}

export function extractBearerToken(
  header: string | undefined,
): BearerToken | null {
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return { token, raw: header };
}
