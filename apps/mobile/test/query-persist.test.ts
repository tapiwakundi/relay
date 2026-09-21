import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Query } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { queryCacheStorageKey, sanitizePersistedClient, shouldPersistQuery } from "../src/lib/query-persist-core";

function query(key: unknown[], status: Query["state"]["status"]): Query {
  return { queryKey: key, state: { status } } as Query;
}

function client(queries: PersistedClient["clientState"]["queries"]): PersistedClient {
  return {
    timestamp: 1,
    buster: "v1",
    clientState: { mutations: [{ mutationKey: ["send"] } as never], queries },
  };
}

describe("mobile query persistence", () => {
  it("namespaces the disk cache per account", () => {
    assert.equal(queryCacheStorageKey("u1"), "relay.rq.v1.u1");
  });

  it("persists chat data and skips search", () => {
    assert.equal(shouldPersistQuery(query(["messages", "c1", null], "success")), true);
    assert.equal(shouldPersistQuery(query(["me"], "success")), true);
    assert.equal(shouldPersistQuery(query(["bootstrap", "ws1"], "success")), true);
    assert.equal(shouldPersistQuery(query(["search", "ws1", "hi"], "success")), false);
    assert.equal(shouldPersistQuery(query(["messages", "c1", null], "pending")), false);
  });

  it("drops in-flight optimistic messages before writing to disk", () => {
    const next = sanitizePersistedClient(
      client([
        {
          queryHash: "messages",
          queryKey: ["messages", "c1", null],
          dehydratedAt: 1,
          state: {
            data: {
              messages: [
                { id: "1", pending: false },
                { id: "2", pending: true },
                { id: "3" },
              ],
            },
            dataUpdateCount: 1,
            dataUpdatedAt: 1,
            error: null,
            errorUpdateCount: 0,
            errorUpdatedAt: 0,
            fetchFailureCount: 0,
            fetchFailureReason: null,
            fetchMeta: null,
            isInvalidated: false,
            status: "success",
            fetchStatus: "idle",
          },
        },
      ]),
    );
    assert.deepEqual(next.clientState.mutations, []);
    assert.deepEqual((next.clientState.queries[0]?.state.data as { messages: { id: string }[] }).messages, [
      { id: "1", pending: false },
      { id: "3" },
    ]);
  });
});
