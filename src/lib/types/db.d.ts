interface User {
  name: string | null;
  email: string | null;
  image: string | null;
  id: string;
}

interface Chat {
  id: string;
  messages: Message[];
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: number;
}

interface FriendRequest {
  id: string;
  senderId: string;
  receieverId: string;
}
