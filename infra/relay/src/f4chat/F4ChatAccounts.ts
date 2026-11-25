import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Base64Url from "effect/encoding/Base64Url";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { RelayF4ChatLink } from "@f4code/contracts/relay";

import * as RelayConfiguration from "../Config.ts";

const LINK_TOKEN_TTL_SECONDS = 10 * 60;
const F4CHAT_REQUEST_TIMEOUT = "5 seconds";

const decodeLinkResponse = Schema.decodeUnknownEffect(
  Schema.Struct({ link: Schema.NullOr(RelayF4ChatLink) }),
);

export class F4ChatNotConfigured extends Schema.TaggedError<F4ChatNotConfigured>()(
  "F4ChatNotConfigured",
  {},
) {
  override get message(): string {
    return "F4 Chat linking is not configured on this relay";
  }
}

export class ClerkUserLookupFailed extends Schema.TaggedError<ClerkUserLookupFailed>()(
  "ClerkUserLookupFailed",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not read the Clerk user's primary email";
  }
}

export class F4ChatRequestFailed extends Schema.TaggedError<F4ChatRequestFailed>()(
  "F4ChatRequestFailed",
  {
    operation: Schema.Literals(["get-link", "unlink"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `F4 Chat '${this.operation}' request failed`;
  }
}

/**
 * Bridge to F4 Chat. F4 Chat owns the account link; the relay
 * signs link requests and asks F4 Chat for the linked account's plan.
 */
export class F4ChatAccounts extends Context.Service<
  F4ChatAccounts,
  {
    readonly available: boolean;
    readonly createLinkUrl: (input: {
      readonly userId: string;
    }) => Effect.Effect<string, F4ChatNotConfigured | ClerkUserLookupFailed>;
    readonly getLink: (input: {
      readonly userId: string;
    }) => Effect.Effect<RelayF4ChatLink | null, F4ChatNotConfigured | F4ChatRequestFailed>;
    readonly unlink: (input: {
      readonly userId: string;
    }) => Effect.Effect<void, F4ChatNotConfigured | F4ChatRequestFailed>;
  }
>()("f4code-relay/f4chat/F4ChatAccounts") {}

/** Token format shared with F4 Chat: `<base64url JSON payload>.<base64url HMAC-SHA256>`. */
export const signLinkToken = (
  secret: string,
  payload: { readonly sub: string; readonly email: string; readonly exp: number },
) => {
  const encoded = Base64Url.encode(JSON.stringify({ v: 1, ...payload }));
  const signature = hmac(
    sha256,
    new TextEncoder().encode(secret),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${Base64Url.encode(signature)}`;
};

export const make = Effect.gen(function* () {
  const config = yield* RelayConfiguration.RelayConfiguration;
  const client = yield* HttpClient.HttpClient;
  const settings = config.f4Chat;

  const requireSettings = settings
    ? Effect.succeed(settings)
    : Effect.fail(new F4ChatNotConfigured());

  // The timeout covers the body read so a stalled response still fails fast.
  const post = Effect.fn("relay.f4chat.post")(function* (
    operation: F4ChatRequestFailed["operation"],
    path: string,
    userId: string,
  ) {
    const { baseUrl, linkSecret } = yield* requireSettings;
    return yield* HttpClientRequest.post(new URL(path, baseUrl).toString()).pipe(
      HttpClientRequest.bearerToken(Redacted.value(linkSecret)),
      HttpClientRequest.bodyJsonUnsafe({ clerkUserId: userId }),
      client.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.json),
      Effect.timeout(F4CHAT_REQUEST_TIMEOUT),
      Effect.mapError((cause) => new F4ChatRequestFailed({ operation, cause })),
    );
  });

  const lookupClerkPrimaryEmail = Effect.fn("relay.f4chat.lookup_clerk_primary_email")(function* (
    _userId: string,
  ) {
    return yield* new ClerkUserLookupFailed({
      cause: new Error("Clerk authentication has been removed from this fork."),
    });
  });

  return F4ChatAccounts.of({
    available: settings !== undefined,
    createLinkUrl: Effect.fn("relay.f4chat.create_link_url")(function* (input) {
      const { baseUrl, linkSecret } = yield* requireSettings;
      const email = yield* lookupClerkPrimaryEmail(input.userId);
      const now = yield* DateTime.now;
      const token = signLinkToken(Redacted.value(linkSecret), {
        sub: input.userId,
        email,
        exp: Math.floor(now.epochMilliseconds / 1_000) + LINK_TOKEN_TTL_SECONDS,
      });
      const url = new URL("/link/f4code", baseUrl);
      url.searchParams.set("token", token);
      return url.toString();
    }),
    getLink: Effect.fn("relay.f4chat.get_link")(function* (input) {
      const body = yield* post("get-link", "/api/f4code/link", input.userId);
      const decoded = yield* decodeLinkResponse(body).pipe(
        Effect.mapError((cause) => new F4ChatRequestFailed({ operation: "get-link", cause })),
      );
      return decoded.link;
    }),
    unlink: Effect.fn("relay.f4chat.unlink")(function* (input) {
      yield* post("unlink", "/api/f4code/unlink", input.userId);
    }),
  });
});

export const layer = Layer.effect(F4ChatAccounts, make);
