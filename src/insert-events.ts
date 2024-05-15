import { PrismaClient } from "@prisma/client";
import events from "../events.json";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DELETE_ALL) {
    await prisma.userEvent.deleteMany()
    await prisma.event.deleteMany()
  }

  for (const event of events) {
    await prisma.event.upsert({
      where: {
        id: event.id,
      },
      create: {
        id: event.id,
        name: event.name,
        date: event.date,
        description: event.description,
      },
      update: {
        name: event.name,
        date: event.date,
        description: event.description,
      },
    });
  }

  console.log("Done");
}

main();
