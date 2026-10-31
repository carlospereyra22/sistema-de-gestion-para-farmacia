import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";

type ErrorResponse = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (
      (exception instanceof Prisma.PrismaClientKnownRequestError ||
        exception instanceof Prisma.PrismaClientUnknownRequestError) &&
      /BRANCH_PRODUCT_(REMOVED|UNAVAILABLE)/.test(
        exception.message +
          (exception instanceof Prisma.PrismaClientKnownRequestError
            ? JSON.stringify(exception.meta)
            : ""),
      )
    ) {
      exception = new HttpException(
        "El producto está archivado o eliminado de esta sucursal. Actualizá el catálogo y revisá la operación.",
        HttpStatus.CONFLICT,
      );
    }
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === "P2034"
    ) {
      exception = new HttpException(
        "Otra operación modificó estos datos. Actualizá y volvé a intentarlo.",
        HttpStatus.CONFLICT,
      );
    }
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.toBody(exception, status, request.requestId);
    response.status(status).json(body);
  }

  private toBody(
    exception: unknown,
    status: number,
    requestId?: string,
  ): ErrorResponse {
    if (!(exception instanceof HttpException)) {
      return {
        code: "INTERNAL_SERVER_ERROR",
        message: "Ocurrió un error interno.",
        requestId,
      };
    }
    const response = exception.getResponse();
    if (typeof response === "string") {
      return {
        code: HttpStatus[status] ?? "HTTP_ERROR",
        message: response,
        requestId,
      };
    }
    const details = (response as { message?: string | string[] }).message;
    const error = (response as { error?: string }).error;
    return {
      code: error ?? HttpStatus[status] ?? "HTTP_ERROR",
      message: Array.isArray(details)
        ? details.join(", ")
        : (details ?? exception.message),
      ...(Array.isArray(details) ? { details } : {}),
      requestId,
    };
  }
}
