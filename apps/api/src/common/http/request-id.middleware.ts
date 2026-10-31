import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export type RequestWithId = Request & { requestId: string };

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = request.header("x-request-id")?.trim() || randomUUID();
  (request as RequestWithId).requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
