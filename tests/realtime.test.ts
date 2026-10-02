import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as openSeatStream } from "../src/app/api/events/[id]/stream/route";
import { publishSeatUpdate, subscribeToSeatUpdates } from "../src/lib/realtime";

test("local seat invalidation reaches only subscribers for the matching event", async () => {
  const received: string[] = [];
  const stop = await subscribeToSeatUpdates("event-a", (update) => received.push(update.reason));

  await publishSeatUpdate("event-b", "held");
  await publishSeatUpdate("event-a", "booked");

  assert.deepEqual(received, ["booked"]);
  await stop();
});

test("unsubscribed listeners no longer receive invalidations", async () => {
  let count = 0;
  const stop = await subscribeToSeatUpdates("event-c", () => { count += 1; });
  await publishSeatUpdate("event-c", "released");
  await stop();
  await publishSeatUpdate("event-c", "cancelled");

  assert.equal(count, 1);
});

test("SSE route sends a complete ready event and live inventory event", async () => {
  const abort = new AbortController();
  const request = new NextRequest("http://localhost/api/events/event-stream/stream", {
    signal: abort.signal,
  });
  const response = await openSeatStream(request, { params: Promise.resolve({ id: "event-stream" }) });
  const reader = response.body?.getReader();
  assert.ok(reader);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);

  const decoder = new TextDecoder();
  const ready = await reader.read();
  assert.match(decoder.decode(ready.value), /^event: ready\ndata: .+\n\n$/);

  const inventoryRead = reader.read();
  await publishSeatUpdate("event-stream", "held");
  const inventory = await inventoryRead;
  const payload = decoder.decode(inventory.value);
  assert.match(payload, /^id: .+\nevent: inventory\ndata: .+\n\n$/);
  assert.match(payload, /"reason":"held"/);

  abort.abort();
  await reader.cancel().catch(() => undefined);
});
