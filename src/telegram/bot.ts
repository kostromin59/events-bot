import { Bot, session } from "grammy";
import { prisma } from "../database";
import { BotContext, SessionData } from "./context";
import { SessionActions, Messages, Actions } from "../utils";
import { baseMenu, skipPhoneMenu } from "./menu";

export class TelegramBot {
  private readonly bot: Bot<BotContext>;

  constructor(token: string) {
    const bot = new Bot<BotContext>(token);
    this.bot = bot;

    // Сессия
    this.bot.use(
      session({
        initial(): SessionData {
          return {};
        },
      }),
    );

    bot.use(skipPhoneMenu);

    this.bindEvents();
  }

  start() {
    this.bot.start();
  }

  private bindEvents() {
    this.bot.command("start", async (ctx) => {
      const id = ctx.from?.id;
      if (!id) return console.error("ID NOT FOUND", ctx.from);

      const user = await prisma.user.findUnique({
        where: {
          telegramId: id.toString(),
        },
      });

      // Спросить ФИО
      if (!user) {
        ctx.session.action = SessionActions.WAITING_FOR_NAME;
        return await ctx.reply("Перед началом работы бота введите ФИО");
      }

      // Спросить телефон
      if (!user.phone) {
        ctx.session.action = SessionActions.WAITING_FOR_PHONE;
        return await ctx.reply("Укажите телефон для связи", {
          reply_markup: skipPhoneMenu,
        });
      }

      await ctx.reply("Вам доступно меню!", { reply_markup: baseMenu });
    });

    this.bot.on("message:text", async (ctx) => {
      switch (ctx.session.action) {
        // Сохранить ФИО
        case SessionActions.WAITING_FOR_NAME:
          await prisma.user.create({
            data: {
              telegramId: ctx.from.id.toString(),
              fio: ctx.message.text,
            },
          });

          // Спросить телефон
          ctx.session.action = SessionActions.WAITING_FOR_PHONE;
          await ctx.reply("Укажите телефон для связи", {
            reply_markup: skipPhoneMenu,
          });

          return;

        // Сохранить телефон
        case SessionActions.WAITING_FOR_PHONE:
          const user = await prisma.user.findUnique({
            where: {
              telegramId: ctx.from.id.toString(),
            },
          });

          if (!user) {
            return await ctx.reply(Messages.USE_START);
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { phone: ctx.message.text },
          });

          await ctx.reply("Вам доступно меню!", { reply_markup: baseMenu });
          return;
      }

      // Обработать пользовательские нажатия
      if (ctx.message.text === Actions.SHOW_EVENTS) {
        const events = await prisma.event.findMany();

        const message = events.reduce((acc, event, index) => {
          acc += `<b>${index + 1}) ${event.name}</b> `;
          acc += `(${new Intl.DateTimeFormat("ru-RU", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(event.date)})\n`;
          acc += `${event.description}\n\n`;

          return acc;
        }, "Список мероприятий:\n");

        return ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: baseMenu,
        });
      } else if (ctx.message.text === Actions.REGISTER_TO_EVENT) {
        return ctx.reply("reg", { reply_markup: baseMenu });
      }
    });

    this.bot.catch((e) => {
      console.error(e.error);
      e.ctx.reply(Messages.ERROR);
    });
  }
}
