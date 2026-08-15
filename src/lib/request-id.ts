const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export function requestId(incoming?: string | null): string {
  return incoming && SAFE_ID.test(incoming) ? incoming : `req_${crypto.randomUUID()}`;
}
