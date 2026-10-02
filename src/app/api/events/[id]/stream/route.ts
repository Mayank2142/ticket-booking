import { NextRequest } from "next/server";
import { subscribeToSeatUpdates, type SeatUpdate } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let stopSubscription: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        const idLine = id ? `id: ${id}\n` : "";
        controller.enqueue(encoder.encode(
          `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        ));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (stopSubscription) void stopSubscription();
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };

      req.signal.addEventListener("abort", close, { once: true });
      send("ready", { eventId: id, connectedAt: new Date().toISOString() });
      heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 15_000);

      stopSubscription = await subscribeToSeatUpdates(id, (update: SeatUpdate) => {
        send("inventory", update, update.id);
      });

      if (closed && stopSubscription) await stopSubscription();
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (stopSubscription) void stopSubscription();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
