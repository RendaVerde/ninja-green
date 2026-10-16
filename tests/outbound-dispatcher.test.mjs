import assert from "node:assert/strict";
import test from "node:test";

import {
  isProvablyNotSent,
  isCircuitFailure,
  runOutboundDispatcher,
} from "../lib/outbound-dispatcher-core.ts";

function createMessage() {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    ownerId: "10000000-0000-4000-8000-000000000002",
    contactId: "10000000-0000-4000-8000-000000000003",
    connectionId: "10000000-0000-4000-8000-000000000004",
    body: "Mensagem de teste",
    source: "quick",
    claimToken: "10000000-0000-4000-8000-000000000005",
    attemptCount: 1,
  };
}

function createStore(overrides = {}) {
  const events = [];
  let available = true;
  const message = createMessage();
  return {
    events,
    store: {
      async claim() {
        if (!available) return [];
        available = false;
        events.push("claimed");
        return [message];
      },
      async loadContext(value) {
        events.push("context");
        return { ...value, phone: "5511999999999", baseUrl: "https://provider.test" };
      },
      async markRequestStarted() {
        events.push("request_started");
        return true;
      },
      async markSent() {
        events.push("sent");
      },
      async markFailed(_message, failure) {
        events.push(`failed:${failure.code}`);
      },
      async markUnknown(_message, failure) {
        events.push(`unknown:${failure.code}`);
      },
      async markRetry(_message, failure, delaySeconds, consumeAttempt) {
        events.push(`retry:${failure.code}:${delaySeconds}:${consumeAttempt}`);
      },
      async recordProviderSuccess() {
        events.push("provider:success");
      },
      async recordProviderFailure(_context, failure) {
        events.push(`provider:failure:${failure.code}`);
      },
      async releaseUnstarted(values) {
        events.push(`released:${values.length}`);
      },
      ...overrides,
    },
  };
}

const options = {
  maxDurationMs: 38_000,
  providerBudgetMs: 12_000,
  batchSize: 3,
  perConnectionLimit: 1,
  leaseSeconds: 75,
};

test("duas execuções concorrentes enviam a mesma mensagem uma única vez", async () => {
  const { store, events } = createStore();
  let providerCalls = 0;
  const providerFactory = async () => ({
    async sendText() {
      providerCalls += 1;
      return { provider: "simulated", providerMessageId: "fake-1" };
    },
  });

  const results = await Promise.all([
    runOutboundDispatcher(store, providerFactory, options),
    runOutboundDispatcher(store, providerFactory, options),
  ]);

  assert.equal(providerCalls, 1);
  assert.equal(results.reduce((total, result) => total + result.sent, 0), 1);
  assert.deepEqual(events, ["claimed", "context", "request_started", "sent", "provider:success"]);
});

test("timeout depois do início da chamada agenda uma única retentativa com a mesma chave", async () => {
  const { store, events } = createStore();
  const providerFactory = async () => ({
    async sendText() {
      throw Object.assign(new Error("Tempo esgotado"), {
        code: "ZPRO_TIMEOUT",
        status: 504,
      });
    },
  });

  const result = await runOutboundDispatcher(store, providerFactory, options);

  assert.equal(result.unknown, 0);
  assert.equal(result.retried, 1);
  assert.equal(result.failed, 0);
  assert.ok(events.includes("retry:ZPRO_TIMEOUT:60:true"));
  assert.ok(events.includes("provider:failure:ZPRO_TIMEOUT"));
  assert.ok(!events.some((event) => event.startsWith("failed:")));
});

test("segunda falha ambígua vira envio incerto", async () => {
  const { store, events } = createStore({
    async claim() {
      return [{ ...createMessage(), attemptCount: 2 }];
    },
  });
  const providerFactory = async () => ({
    async sendText() {
      throw Object.assign(new Error("Tempo esgotado"), {
        code: "ZPRO_TIMEOUT",
        status: 504,
      });
    },
  });
  const result = await runOutboundDispatcher(store, providerFactory, options);
  assert.equal(result.unknown, 1);
  assert.ok(events.includes("unknown:ZPRO_TIMEOUT"));
});

test("429 respeita Retry-After sem consumir tentativa", async () => {
  const { store, events } = createStore();
  const providerFactory = async () => ({
    async sendText() {
      throw Object.assign(new Error("Limite atingido"), {
        code: "ZPRO_RATE_LIMITED",
        status: 429,
        retryAfterSeconds: 180,
      });
    },
  });
  const result = await runOutboundDispatcher(store, providerFactory, options);
  assert.equal(result.deferred, 1);
  assert.ok(events.includes("retry:ZPRO_RATE_LIMITED:180:false"));
});

test("erro 4xx comprovadamente anterior ao envio vira falha definitiva", async () => {
  const { store, events } = createStore();
  const providerFactory = async () => ({
    async sendText() {
      throw Object.assign(new Error("Credencial inválida"), {
        code: "ZPRO_INVALID_CREDENTIALS",
        status: 401,
      });
    },
  });

  const result = await runOutboundDispatcher(store, providerFactory, options);

  assert.equal(result.failed, 1);
  assert.equal(result.unknown, 0);
  assert.ok(events.includes("failed:ZPRO_INVALID_CREDENTIALS"));
});

test("classificação conservadora não considera timeout, conflito ou 5xx como não enviados", () => {
  assert.equal(isProvablyNotSent({ code: "BAD_REQUEST", message: "", status: 400 }), true);
  assert.equal(isProvablyNotSent({ code: "TIMEOUT", message: "", status: 408 }), false);
  assert.equal(isProvablyNotSent({ code: "CONFLICT", message: "", status: 409 }), false);
  assert.equal(isProvablyNotSent({ code: "RATE_LIMIT", message: "", status: 429 }), false);
  assert.equal(isProvablyNotSent({ code: "SERVER", message: "", status: 500 }), false);
});

test("disjuntor considera somente rede, timeout e 502 a 504", () => {
  assert.equal(isCircuitFailure({ code: "ZPRO_CONNECTION_ERROR", message: "" }), true);
  assert.equal(isCircuitFailure({ code: "ZPRO_TIMEOUT", message: "" }), true);
  assert.equal(isCircuitFailure({ code: "SERVER", message: "", status: 503 }), true);
  assert.equal(isCircuitFailure({ code: "SERVER", message: "", status: 500 }), false);
  assert.equal(isCircuitFailure({ code: "ZPRO_RATE_LIMITED", message: "", status: 429 }), false);
});
