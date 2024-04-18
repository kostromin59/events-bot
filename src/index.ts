import { prisma } from "./database";

async function main() {
  const events = await prisma.event.findMany();
  console.log(events);
}

main();
