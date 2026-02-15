/**
 * Rate limiting middleware.
 * Different limits for different endpoint groups.
 */

import rateLimit from "express-rate-limit";

/** General API endpoints: 100 requests per minute per IP */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many requests, please try again later.",
  },
});

/** Battle start: 10 requests per minute per IP (expensive - triggers on-chain tx) */
export const battleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many battle requests. Please wait before starting another.",
  },
});

/** Auth endpoints: 20 requests per minute per IP */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many auth requests. Please slow down.",
  },
});

/** Webhooks: 300 requests per minute (from indexer services) */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Webhook rate limit exceeded.",
  },
});
