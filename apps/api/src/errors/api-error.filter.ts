import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { ApiError, createRequestId, mapApiErrorToResponse } from "@fococontext/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { resolveApiLocaleFromHeaders } from "./api-localization.js";

@Catch(ApiError)
export class ApiErrorFilter implements ExceptionFilter<ApiError> {
  catch(exception: ApiError, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const mapped = mapApiErrorToResponse(exception, createRequestId(), {
      locale: resolveApiLocaleFromHeaders(request.headers),
    });

    response.status(mapped.statusCode).send(mapped.body);
  }
}
