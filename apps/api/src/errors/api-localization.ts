import {
  hasApiMessageKey,
  resolveApiLocale,
  translateApiMessage,
  translateApiMessageText,
  type SupportedApiLocale,
} from "@fococontext/contracts";
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { map, type Observable } from "rxjs";

export const apiLocaleHeaderName = "x-fococontext-locale";

@Injectable()
export class ApiLocalizationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const locale = resolveApiLocaleFromHeaders(request.headers);

    return next.handle().pipe(map((body: unknown) => localizeApiResponseBody(body, locale)));
  }
}

export function resolveApiLocaleFromHeaders(
  headers: FastifyRequest["headers"],
): SupportedApiLocale {
  return resolveApiLocale({
    acceptLanguage: headers["accept-language"],
    explicitLocale: headers[apiLocaleHeaderName],
  });
}

export function localizeApiResponseBody<TBody>(body: TBody, locale: SupportedApiLocale): TBody {
  return localizeValue(body, locale, undefined) as TBody;
}

function localizeValue(
  value: unknown,
  locale: SupportedApiLocale,
  key: string | undefined,
): unknown {
  if (typeof value === "string") {
    return shouldLocalizeStringKey(key) ? localizeMessageString(value, locale) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => localizeValue(item, locale, key));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      localizeValue(childValue, locale, childKey),
    ]),
  );
}

function shouldLocalizeStringKey(key: string | undefined): boolean {
  return key === "message" || key === "progress_message";
}

function localizeMessageString(value: string, locale: SupportedApiLocale): string {
  return hasApiMessageKey(value)
    ? translateApiMessage(value, locale)
    : translateApiMessageText(value, locale);
}
