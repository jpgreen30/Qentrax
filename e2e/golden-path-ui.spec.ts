import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext, type Page, type ConsoleMessage } from "@playwright/test";
import { authCookieName, signIn } from "./harness/session";
