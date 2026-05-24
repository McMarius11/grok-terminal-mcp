/**
 * HTTP Client Tools for grok-terminal-mcp
 *
 * Provides a powerful, structured way to make HTTP requests directly from the AI.
 * This is especially useful for API development, testing, and automation without
 * having to write raw curl commands.
 */

import { setTimeout as sleep } from "timers/promises";

export interface HttpRequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string | Record<string, any> | null;
  timeout?: number;           // milliseconds
  followRedirects?: boolean;
  maxRedirects?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyJson?: any;             // parsed if content-type is json
  url: string;                // final URL after redirects
  durationMs: number;
  redirected: boolean;
  ok: boolean;
}

/**
 * Performs an HTTP request with good defaults and structured output.
 */
export async function httpRequest(opts: HttpRequestOptions): Promise<HttpResponse> {
  const {
    url,
    method = "GET",
    headers = {},
    body = null,
    timeout = 30000,
    followRedirects = true,
    maxRedirects = 5,
  } = opts;

  const startTime = Date.now();

  const requestHeaders: Record<string, string> = {
    "User-Agent": "grok-terminal-mcp/0.6",
    ...headers,
  };

  let requestBody: BodyInit | undefined = undefined;

  if (body !== null && body !== undefined) {
    if (typeof body === "object") {
      requestBody = JSON.stringify(body);
      if (!requestHeaders["Content-Type"]) {
        requestHeaders["Content-Type"] = "application/json";
      }
    } else {
      requestBody = body;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      redirect: followRedirects ? "follow" : "manual",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text();
    let bodyJson: any = undefined;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        bodyJson = JSON.parse(responseBody);
      } catch {
        // leave as undefined
      }
    }

    const durationMs = Date.now() - startTime;

    // Convert headers to plain object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      bodyJson,
      url: response.url,
      durationMs,
      redirected: response.redirected,
      ok: response.ok,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      throw new Error(`HTTP request to ${url} timed out after ${timeout}ms`);
    }

    throw new Error(`HTTP request failed: ${err.message}`);
  }
}
