/**
 * Zod-based request validation middleware.
 * Validates body, params, and query against Zod schemas.
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Express middleware factory that validates request parts against Zod schemas.
 * Returns 400 with structured errors on validation failure.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: { field: string; message: string }[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error, "body"));
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error, "params"));
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error, "query"));
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        ok: false,
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    next();
  };
}

function formatZodErrors(
  error: ZodError,
  source: string
): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: `${source}.${issue.path.join(".")}`,
    message: issue.message,
  }));
}
