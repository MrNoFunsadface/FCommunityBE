export interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface Chat {
  id: string;
  messages: Message[];
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receieverId: string;
}

export function isMessage(obj: unknown): obj is Message {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.senderId === "string" &&
    typeof o.text === "string" &&
    (typeof o.timestamp === "number" || typeof o.timestamp === "string")
  );
}

export default {};
