import { AsyncLocalStorage } from "node:async_hooks";
import type { McpAuthContext } from "./auth.js";

export type RequestContext = {
  auth: McpAuthContext;
  accessToken?: string;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
