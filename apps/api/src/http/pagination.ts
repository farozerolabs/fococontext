import { ApiError } from "@fococontext/contracts";

export interface PaginationQuery {
  page?: string;
  page_size?: string;
}

export interface CursorPaginationQuery extends PaginationQuery {
  cursor?: string;
  limit?: string;
}

export interface PaginationInput {
  page: number;
  pageSize: number;
}

export interface CursorPaginationInput extends PaginationInput {
  cursor?: string;
}

export function parsePaginationQuery(
  query: PaginationQuery,
  input: {
    defaultPageSize?: number;
    maxPageSize?: number;
  } = {},
): PaginationInput {
  const defaultPageSize = input.defaultPageSize ?? 20;
  const maxPageSize = input.maxPageSize ?? 100;

  return {
    page: parsePaginationInteger(query.page, {
      fallback: 1,
      field: "page",
      min: 1,
    }),
    pageSize: parsePaginationInteger(query.page_size, {
      fallback: defaultPageSize,
      field: "page_size",
      max: maxPageSize,
      min: 1,
    }),
  };
}

export function parseCursorPaginationQuery(
  query: CursorPaginationQuery,
  input: {
    defaultPageSize?: number;
    maxPageSize?: number;
  } = {},
): CursorPaginationInput {
  const defaultPageSize = input.defaultPageSize ?? 20;
  const maxPageSize = input.maxPageSize ?? 100;
  const cursor = query.cursor?.trim();

  if (cursor !== undefined && cursor.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.pagination_invalid",
      details: {
        fields: ["cursor"],
      },
    });
  }

  return {
    page: parsePaginationInteger(query.page, {
      fallback: 1,
      field: "page",
      min: 1,
    }),
    pageSize: parsePaginationInteger(query.limit ?? query.page_size, {
      fallback: defaultPageSize,
      field: query.limit === undefined ? "page_size" : "limit",
      max: maxPageSize,
      min: 1,
    }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function parsePaginationInteger(
  value: string | undefined,
  input: {
    fallback: number;
    field: string;
    max?: number;
    min: number;
  },
): number {
  if (value === undefined) {
    return input.fallback;
  }

  const parsed = Number(value);
  const overMax = input.max !== undefined && parsed > input.max;

  if (!Number.isSafeInteger(parsed) || parsed < input.min || overMax) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.pagination_invalid",
      details: {
        fields: [input.field],
        max: input.max,
        min: input.min,
      },
    });
  }

  return parsed;
}
