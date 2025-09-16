import Button from "@/components/ui/Button";
import { db } from "@/lib/db";

export default async function Home() {
  // test add to database
  await db.set("test", { hello: "world" });

  return <Button>Click me</Button>;
}
