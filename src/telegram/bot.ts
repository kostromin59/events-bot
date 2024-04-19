import { Bot, GrammyError, HttpError, InlineKeyboard, session } from "grammy";
import { prisma } from "../database";
import { BotContext, SessionData } from "./context";
import { SessionActions, Messages, Actions, DateFormat } from "../utils";
import { baseMenu, showRegisteredEventsMenu, skipPhoneMenu } from "./menu";

export class TelegramBot {
  private readonly bot: Bot<BotContext>;
  private readonly admins: number[];

  constructor(token: string, admins: number[]) {
    this.admins = admins;

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
    bot.use(showRegisteredEventsMenu);

    this.bot.catch((err) => {
      const ctx = err.ctx;
      console.error(`Error while handling update ${ctx.update.update_id}:`);
      const e = err.error;
      if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
      } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
      } else {
        console.error("Unknown error:", e);
        ctx.reply(Messages.ERROR);
      }
    });

    this.bindCommands();
    this.bindUserEvents();
  }

  start() {
    this.bot.start();
  }

  private bindCommands() {
    this.bot.api.setMyCommands([
      { command: "id", description: "Узнать свой ID" },
      { command: "start", description: "Начать работу бота" },
    ]);

    this.bot.command("id", (ctx) => {
      if (!ctx.from?.id) throw new Error("Id not found");
      ctx.reply(ctx.from.id.toString());
    });
  }

  private bindUserEvents() {
    this.bot
      .command("start", async (ctx) => {
        const id = ctx.from?.id;
        if (!id) throw new Error("Id not found");

        const user = await prisma.user.findUnique({
          where: {
            telegramId: id.toString(),
          },
        });

        // Спросить ФИО
        if (!user) {
          ctx.session.action = SessionActions.WAITING_FOR_NAME;
          return await ctx.reply(Messages.NEED_NAME);
        }

        // Спросить телефон
        if (!user.phone) {
          ctx.session.action = SessionActions.WAITING_FOR_PHONE;
          return await ctx.reply(Messages.NEED_PHONE, {
            reply_markup: skipPhoneMenu,
          });
        }

        await ctx.reply(Messages.MENU_ACCESS, { reply_markup: baseMenu });
      })
      .filter((ctx) => this.filterAdmins(ctx.from?.id));

    this.bot
      .hears(Actions.SHOW_EVENTS, async (ctx) => {
        const events = await prisma.event.findMany();

        const message = events.reduce((acc, event, index) => {
          acc += `<b>${index + 1}) ${event.name}</b> `;
          acc += `(${new Intl.DateTimeFormat("ru-RU", DateFormat).format(event.date)})\n`;
          acc += `${event.description}\n\n`;

          return acc;
        }, "Список мероприятий:\n");

        return ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: showRegisteredEventsMenu,
        });
      })
      .filter((ctx) => this.filterAdmins(ctx.from?.id));

    this.bot
      .hears(Actions.REGISTER_TO_EVENT, async (ctx) => {
        const events = await prisma.event.findMany();
        const menu = new InlineKeyboard();

        events.forEach((event) => {
          menu.text(event.name, Actions.SELECTED_EVENT + `:${event.id}`).row();
        });

        await ctx.reply(Messages.SELECT_EVENTS, { reply_markup: menu });
      })
      .filter((ctx) => this.filterAdmins(ctx.from?.id));

    this.bot
      .on("callback_query:data", async (ctx) => {
        if (!ctx.callbackQuery.data.startsWith(Actions.SELECTED_EVENT))
          throw new Error("Must be selected event");

        const user = await prisma.user.findUnique({
          where: {
            telegramId: ctx.from.id.toString(),
          },
        });

        if (!user) return await ctx.answerCallbackQuery(Messages.USE_START);
        const eventId = ctx.callbackQuery.data.split(":").at(-1)?.trim();

        if (!eventId) return await ctx.answerCallbackQuery(Messages.ERROR);

        const record = await prisma.userEvent.findFirst({
          where: {
            userId: user.id,
            eventId: Number(eventId),
          },
        });

        if (record) {
          return await ctx.answerCallbackQuery(Messages.ALREADY_REGISTERED);
        }

        await prisma.userEvent.create({
          data: {
            userId: user.id,
            eventId: Number(eventId),
          },
        });

        await ctx.answerCallbackQuery(Messages.SUCCESS_REGISTER);
        await ctx.reply(Messages.FIND_REGISTERED_EVENTS);
      })
      .filter((ctx) => this.filterAdmins(ctx.from.id));

    this.bot
      .on("message:text", async (ctx) => {
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
            await ctx.reply(Messages.NEED_PHONE, {
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

            await ctx.reply(Messages.MENU_ACCESS, { reply_markup: baseMenu });
            return;
        }
      })
      .filter((ctx) => this.filterAdmins(ctx.from.id));
  }

  filterAdmins(id?: number): boolean {
    if (!id) return false;
    return !this.admins.includes(id);
  }
}
