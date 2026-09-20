export function accountAuthHeaders(creds: { token?: string; cookie?: string } | null) {
  const headers: Record<string, string> = {};
  if (creds?.token) headers.Authorization = `Bearer ${creds.token}`;
  if (creds?.cookie) headers.Cookie = creds.cookie;
  return headers;
}
