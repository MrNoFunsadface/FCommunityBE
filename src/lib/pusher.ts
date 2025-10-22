import PusherServer from "pusher";

const appId =
  process.env.PUSHER_APP_ID ?? process.env.NEXT_PUBLIC_PUSHER_APP_ID;
const key =
  process.env.PUSHER_APP_KEY ?? process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
const secret =
  process.env.PUSHER_APP_SECRET ?? process.env.NEXT_PUBLIC_PUSHER_APP_SECRET;

/** Minimal interface describing the parts of Pusher we use */
interface PusherLike {
  trigger(channel: string, event: string, data?: unknown): Promise<void>;
}

let _pusherServer: PusherLike;

if (!appId || !key || !secret) {
  console.warn(
    "Pusher credentials are missing. Falling back to no-op pusherServer. Set PUSHER_APP_ID/KEY/SECRET to enable Pusher."
  );

  _pusherServer = {
    async trigger(
      _channel: string,
      _event: string,
      _data?: unknown
    ): Promise<void> {
      // no-op; return void promise to match real Pusher API
      return Promise.resolve();
    },
  };
} else {
  // The PusherServer instance implements trigger(channel, event, data)
  // We cast to PusherLike to keep the exported API narrow and typed.
  _pusherServer = new PusherServer({
    appId,
    key,
    secret,
    cluster: "ap1",
    useTLS: true,
  }) as unknown as PusherLike;
}

export const pusherServer = _pusherServer;
