import PusherServer from "pusher";

const appId =
  process.env.PUSHER_APP_ID ?? process.env.NEXT_PUBLIC_PUSHER_APP_ID;
const key =
  process.env.PUSHER_APP_KEY ?? process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
const secret =
  process.env.PUSHER_APP_SECRET ?? process.env.NEXT_PUBLIC_PUSHER_APP_SECRET;

let _pusherServer: {
  trigger: (...args: any[]) => Promise<any>;
};

if (!appId || !key || !secret) {
  console.warn(
    "Pusher credentials are missing. Falling back to no-op pusherServer. Set PUSHER_APP_ID/KEY/SECRET to enable Pusher."
  );

  _pusherServer = {
    trigger: async (..._args: any[]) => Promise.resolve(),
  };
} else {
  _pusherServer = new PusherServer({
    appId,
    key,
    secret,
    cluster: "ap1",
    useTLS: true,
  });
}

export const pusherServer = _pusherServer;
