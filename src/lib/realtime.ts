import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

export type SeatUpdateReason =
  | "held"
  | "released"
  | "booked"
  | "cancelled"
  | "waitlist-offer"
  | "offer-expired";

export type SeatUpdate = {
  id: string;
  eventId: string;
  reason: SeatUpdateReason;
  occurredAt: string;
};

const globalRealtime = globalThis as typeof globalThis & {
  cinebookSeatEvents?: EventEmitter;
  cinebookRedisPublisher?: RedisClient;
  cinebookRedisPublisherPromise?: Promise<RedisClient | null>;
  cinebookRedisRetryAfter?: number;
};

const localEvents = globalRealtime.cinebookSeatEvents ?? new EventEmitter();
localEvents.setMaxListeners(0);
globalRealtime.cinebookSeatEvents = localEvents;

function redisUrl() {
  return process.env.REDIS_URL?.trim() || null;
}

function channel(eventId: string) {
  return `cinebook:events:${eventId}:inventory`;
}

function logRedisFailure(operation: string, error: unknown) {
  console.warn(JSON.stringify({
    level: "warn",
    component: "realtime",
    operation,
    message: error instanceof Error ? error.message : String(error),
  }));
}

function newRedisClient(url: string) {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });
  client.on("error", (error) => logRedisFailure("connection", error));
  return client;
}

export async function getRedisClient() {
  const url = redisUrl();
  if (!url) return null;
  if ((globalRealtime.cinebookRedisRetryAfter ?? 0) > Date.now()) return null;

  const existing = globalRealtime.cinebookRedisPublisher;
  if (existing?.isReady) return existing;
  if (globalRealtime.cinebookRedisPublisherPromise) {
    return globalRealtime.cinebookRedisPublisherPromise;
  }

  const connecting = (async () => {
    const client = newRedisClient(url);
    try {
      await client.connect();
      globalRealtime.cinebookRedisPublisher = client;
      globalRealtime.cinebookRedisRetryAfter = undefined;
      return client;
    } catch (error) {
      logRedisFailure("publisher-connect", error);
      globalRealtime.cinebookRedisRetryAfter = Date.now() + 5_000;
      if (client.isOpen) client.destroy();
      return null;
    } finally {
      globalRealtime.cinebookRedisPublisherPromise = undefined;
    }
  })();

  globalRealtime.cinebookRedisPublisherPromise = connecting;
  return connecting;
}

export async function publishSeatUpdate(eventId: string, reason: SeatUpdateReason) {
  const update: SeatUpdate = {
    id: randomUUID(),
    eventId,
    reason,
    occurredAt: new Date().toISOString(),
  };

  localEvents.emit(channel(eventId), update);

  try {
    const publisher = await getRedisClient();
    if (publisher?.isReady) await publisher.publish(channel(eventId), JSON.stringify(update));
  } catch (error) {
    logRedisFailure("publish", error);
  }

  return update;
}

export async function subscribeToSeatUpdates(
  eventId: string,
  onUpdate: (update: SeatUpdate) => void
) {
  const eventChannel = channel(eventId);
  const seen = new Set<string>();
  const dispatch = (update: SeatUpdate) => {
    if (update.eventId !== eventId || seen.has(update.id)) return;
    seen.add(update.id);
    if (seen.size > 200) seen.delete(seen.values().next().value as string);
    onUpdate(update);
  };

  localEvents.on(eventChannel, dispatch);
  let subscriber: RedisClient | null = null;

  try {
    const publisher = await getRedisClient();
    if (publisher?.isReady) {
      subscriber = publisher.duplicate();
      subscriber.on("error", (error) => logRedisFailure("subscriber-connection", error));
      await subscriber.connect();
      await subscriber.subscribe(eventChannel, (message) => {
        try {
          dispatch(JSON.parse(message) as SeatUpdate);
        } catch (error) {
          logRedisFailure("subscriber-message", error);
        }
      });
    }
  } catch (error) {
    logRedisFailure("subscribe", error);
    if (subscriber?.isOpen) subscriber.destroy();
    subscriber = null;
  }

  return async () => {
    localEvents.off(eventChannel, dispatch);
    if (!subscriber) return;
    try {
      if (subscriber.isReady) await subscriber.unsubscribe(eventChannel);
    } catch (error) {
      logRedisFailure("unsubscribe", error);
    } finally {
      if (subscriber.isOpen) subscriber.destroy();
    }
  };
}
