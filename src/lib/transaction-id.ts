/** Public marketplace transaction id, e.g. QL-90184 */
export function generatePublicTransactionId(): string {
  const n = Math.floor(10000 + Math.random() * 90000);
  return `QL-${n}`;
}
