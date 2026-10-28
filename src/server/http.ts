import { Duration, Effect, Option, Schema, Stream } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http"

export class DeepSeekError extends Schema.TaggedError<DeepSeekError>()("DeepSeekError", {
  status: Schema.Number,
  message: Schema.String,
  code: Schema.optionalKey(Schema.String),
  retryAfter: Schema.optionalKey(Schema.Number),
}) {}

const MAX_ERROR_RESPONSE_BYTES = 64 * 1024
const MAX_RETRY_AFTER_SECONDS = 30
const RETRY_BASE_DELAY_MS = 500
const RETRY_MAX_DELAY_MS = 8_000

export function request<
  F extends Schema.Struct.Fields,
  S extends Schema.ConstraintDecoder<unknown, never>,
>(
  http: HttpClient.HttpClient,
  input: {
    readonly apiKey: string
    readonly baseURL?: string
    readonly timeoutMs?: number
    readonly statusErrors: "typed" | "http"
  },
  path: string,
  schema: Schema.Struct<F> & Schema.ConstraintEncoder<unknown, never>,
  body: Schema.Struct.Type<F>,
  responseSchema: S,
  maximumResponseBytes: number,
  maxRetries: number,
): Effect.Effect<S["Type"], DeepSeekError | HttpClientError.HttpClientError> {
  return Effect.gen(function* () {
    const encodedBody = yield* Effect.try({
      try: () => Schema.encodeSync(schema)(body),
      catch: (cause) => cause,
    })
    const request = yield* HttpClientRequest.post(
      endpoint(input.baseURL ?? "https://api.deepseek.com", path),
    ).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bearerToken(input.apiKey),
      HttpClientRequest.bodyJson(encodedBody),
    )
    const attempt = (
      index: number,
    ): Effect.Effect<S["Type"], DeepSeekError | HttpClientError.HttpClientError> =>
      Effect.scoped(
        Effect.gen(function* () {
          const response = yield* http.execute(request)
          if (response.status >= 200 && response.status < 300) {
            return yield* decodeResponse(response, responseSchema, maximumResponseBytes)
          }

          if (input.statusErrors === "http") {
            return yield* HttpClientResponse.filterStatusOk(response).pipe(
              Effect.flatMap(() =>
                Effect.fail(
                  new DeepSeekError({
                    status: response.status,
                    message: `DeepSeek request failed (HTTP ${response.status})`,
                  }),
                ),
              ),
            )
          }

          const text = yield* readResponseBody(response, MAX_ERROR_RESPONSE_BYTES).pipe(
            Effect.orElseSucceed(() => ""),
          )
          const error = Option.getOrUndefined(decodeError(text))?.error
          const code = error?.code ?? error?.type
          const wait = retryAfter(response.headers["retry-after"])
          return yield* new DeepSeekError({
            status: response.status,
            message: error?.message ?? `DeepSeek request failed (HTTP ${response.status})`,
            ...(code === undefined ? {} : { code }),
            ...(wait === undefined ? {} : { retryAfter: wait }),
          })
        }),
      ).pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(clampTimeout(input.timeoutMs)),
          orElse: () =>
            Effect.fail(
              new DeepSeekError({
                status: 0,
                message: "DeepSeek request timed out",
                code: "timeout",
              }),
            ),
        }),
        Effect.mapError((cause) => {
          if (input.statusErrors === "http" && HttpClientError.isHttpClientError(cause)) {
            return cause
          }

          return asDeepSeekError(cause)
        }),
        Effect.catch(
          (cause): Effect.Effect<S["Type"], DeepSeekError | HttpClientError.HttpClientError> => {
            if (index >= maxRetries || !shouldRetry(cause)) {
              if (input.statusErrors === "http" && HttpClientError.isHttpClientError(cause)) {
                return Effect.fail(cause)
              }

              return Effect.fail(asDeepSeekError(cause))
            }

            return Effect.sleep(Duration.millis(retryDelayMs(cause, index))).pipe(
              Effect.flatMap(() => attempt(index + 1)),
            )
          },
        ),
      )

    return yield* attempt(0)
  }).pipe(
    Effect.mapError((cause) => {
      if (HttpClientError.isHttpClientError(cause)) {
        return cause
      }

      return asDeepSeekError(cause)
    }),
  )
}

const decodeError = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      error: Schema.Struct({
        message: Schema.optionalKey(Schema.String),
        type: Schema.optionalKey(Schema.String),
        code: Schema.optionalKey(Schema.String),
      }),
    }),
  ),
)

const decodeResponse = Effect.fnUntraced(function* <
  S extends Schema.ConstraintDecoder<unknown, never>,
>(
  response: HttpClientResponse.HttpClientResponse,
  schema: S,
  maximumBytes: number,
): Effect.fn.Return<S["Type"], unknown> {
  const text = yield* readResponseBody(response, maximumBytes)
  return yield* Effect.try({
    try: () => Schema.decodeUnknownSync(Schema.fromJsonString(schema))(text),
    catch: (cause) => cause,
  })
})

const readResponseBody = Effect.fnUntraced(function* (
  response: HttpClientResponse.HttpClientResponse,
  maximumBytes: number,
): Effect.fn.Return<string, unknown> {
  const contentLength = response.headers["content-length"]
  const parsedSize = contentLength ? Number.parseInt(contentLength, 10) : undefined
  const declaredSize =
    parsedSize !== undefined && Number.isSafeInteger(parsedSize) && parsedSize >= 0
      ? parsedSize
      : undefined

  if (declaredSize !== undefined && declaredSize > maximumBytes) {
    return yield* new DeepSeekError({
      status: 0,
      message: `DeepSeek response exceeds the ${maximumBytes} byte limit`,
      code: "response_too_large",
    })
  }

  let body = new Uint8Array(Math.min(maximumBytes, declaredSize ?? 64 * 1024))
  let size = 0
  yield* Stream.runForEach(response.stream, (chunk) => {
    if (chunk.byteLength === 0) {
      return Effect.void
    }

    if (size + chunk.byteLength > maximumBytes) {
      return Effect.fail(
        new DeepSeekError({
          status: 0,
          message: `DeepSeek response exceeds the ${maximumBytes} byte limit`,
          code: "response_too_large",
        }),
      )
    }

    if (size + chunk.byteLength > body.byteLength) {
      const grown = new Uint8Array(
        Math.min(maximumBytes, Math.max(size + chunk.byteLength, body.byteLength * 2)),
      )
      grown.set(body.subarray(0, size))
      body = grown
    }

    body.set(chunk, size)
    size += chunk.byteLength
    return Effect.void
  })

  return new TextDecoder().decode(body.subarray(0, size))
})

function asDeepSeekError(cause: unknown) {
  if (cause instanceof DeepSeekError) {
    return cause
  }

  return new DeepSeekError({
    status: 0,
    message: message(cause),
    code: HttpClientError.isHttpClientError(cause) ? "network_error" : "invalid_response",
  })
}

function shouldRetry(error: unknown) {
  if (error instanceof DeepSeekError) {
    return (
      error.code === "network_error" ||
      error.code === "timeout" ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    )
  }

  if (!HttpClientError.isHttpClientError(error)) {
    return false
  }

  const status = error.response?.status
  return status === undefined || status === 408 || status === 429 || status >= 500
}

function retryDelayMs(error: unknown, attempt: number) {
  const retryAfterValue =
    error instanceof DeepSeekError
      ? error.retryAfter
      : HttpClientError.isHttpClientError(error)
        ? retryAfter(error.response?.headers["retry-after"])
        : undefined

  if (retryAfterValue !== undefined) {
    return Math.min(retryAfterValue * 1_000, MAX_RETRY_AFTER_SECONDS * 1_000)
  }

  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS)
}

function retryAfter(value: string | undefined) {
  const text = value?.trim()
  if (!text) {
    return undefined
  }

  const seconds = Number(text)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds
  }

  const date = Date.parse(text)
  if (!Number.isFinite(date)) {
    return undefined
  }

  return Math.max(0, (date - Date.now()) / 1_000)
}

function clampTimeout(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 30_000
  }

  return Math.min(120_000, Math.max(1_000, Math.round(value)))
}

function endpoint(baseURL: string, path: string) {
  const base = baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")
  return `${base}${path}`
}

function message(cause: unknown) {
  if (cause instanceof Error) {
    const text = cause.message.trim()
    if (text) {
      return text
    }

    const rendered = cause.toString().trim()
    if (rendered && rendered !== "Error") {
      return rendered
    }
  }

  const text = String(cause).trim()
  return text || "DeepSeek request failed"
}
