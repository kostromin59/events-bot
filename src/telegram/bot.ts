import { Bot, session } from "grammy";
import { prisma } from "../database";
import { BotContext, SessionData } from "./context";
import { Actions, Messages } from "../utils";
import { skipPhoneMenu } from "./menu";

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
        ctx.session.action = Actions.WAITING_FOR_NAME;
        return await ctx.reply("Перед началом работы бота введите ФИО");
      }

      if (!user.phone) {
        ctx.session.action = Actions.WAITING_FOR_PHONE;
        return await ctx.reply("Укажите телефон для связи", {
          reply_markup: skipPhoneMenu,
        });
      }

      // TODO: Вывод меню
    });

    this.bot.on("message:text", async (ctx) => {
      switch (ctx.session.action) {
        // Сохранить ФИО
        case Actions.WAITING_FOR_NAME:
          await prisma.user.create({
            data: {
              telegramId: ctx.from.id.toString(),
              fio: ctx.message.text,
            },
          });

          // Спросить телефон
          ctx.session.action = Actions.WAITING_FOR_PHONE;
          await ctx.reply("Укажите телефон для связи", {
            reply_markup: skipPhoneMenu,
          });

          return;

        // Сохранить телефон
        case Actions.WAITING_FOR_PHONE:
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

          // TODO: Отправить меню
          await ctx.reply("ok");
          return;
      }
    });

    this.bot.catch((e) => {
      console.error(e.error);
      e.ctx.reply(Messages.ERROR);
    });
  }
}
