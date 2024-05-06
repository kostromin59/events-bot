import { Keyboard } from "grammy";
import { Menu } from "@grammyjs/menu";
import { BotContext } from "./context";
import { Actions, AdminsActions, DateFormat } from "../utils";
import { prisma } from "../database";

export const baseMenu = new Keyboard()
  .text(Actions.SHOW_EVENTS)
  .text(Actions.REGISTER_TO_EVENT)
  .resized();

export const adminsMenu = new Keyboard()
  .text(AdminsActions.SHOW_STATISTICS)
  .text(AdminsActions.GENERATE_EXCEL)
  .resized();

// export const skipPhoneMenu = new Menu<BotContext>("skipPhoneMenu").text(
//   "Не указывать",
//   async (ctx) => {
//     ctx.session.action = undefined;
//
//     await ctx.reply(Messages.MENU_ACCESS, { reply_markup: baseMenu });
//   },
// );

export const sendContactMenu = new Keyboard()
  .requestContact("Отправить контакт")
  .placeholder("Номер телефона")
  .resized();

export const showRegisteredEventsMenu = new Menu<BotContext>(
  "showRegisteredEvents",
).text("Мои записи", async (ctx) => {
  const events = await prisma.userEvent.findMany({
    where: {
      user: {
        telegramId: ctx.from.id.toString(),
      },
    },
    include: {
      event: true,
    },
  });

  if (!events.length) {
    return await ctx.reply("Вы ещё никуда не записаны!");
  }

  const message = events.reduce((acc, event, index) => {
    acc += `${index + 1}) <b>${event.event.name}</b> (${new Intl.DateTimeFormat("ru-RU", DateFormat).format(event.event.date)})\n`;
    return acc;
  }, "Вы записаны на:\n");

  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: baseMenu,
  });
});
