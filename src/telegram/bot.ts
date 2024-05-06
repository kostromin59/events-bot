import {
  Bot,
  GrammyError,
  HttpError,
  InlineKeyboard,
  InputFile,
  session,
} from "grammy";
import { prisma } from "../database";
import { BotContext, SessionData } from "./context";
import xlsx from "xlsx";
import {
  SessionActions,
  Messages,
  Actions,
  DateFormat,
  AdminsActions,
  phoneMask,
} from "../utils";
import {
  adminsMenu,
  baseMenu,
  sendContactMenu,
  showRegisteredEventsMenu,
} from "./menu";
import { Readable } from "stream";

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

    // bot.use(skipPhoneMenu);
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
    this.bindAdminEvents();
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

    this.bot.command("start", async (ctx) => {
      const id = ctx.from?.id;
      if (!id) throw new Error("Id not found");

      if (this.isAdmin(id)) {
        return await ctx.reply(Messages.MENU_ACCESS, {
          reply_markup: adminsMenu,
        });
      }

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
          reply_markup: sendContactMenu,
        });
      }

      await ctx.reply(Messages.MENU_ACCESS, { reply_markup: baseMenu });
    });
  }

  private bindAdminEvents() {
    this.bot
      .hears(AdminsActions.SHOW_STATISTICS, async (ctx) => {
        const events = await prisma.event.findMany({
          select: {
            name: true,
            UserEvent: {
              select: { id: true },
            },
          },
        });
        const message = events.reduce((acc, event, index) => {
          acc += `${index + 1}) ${event.name}: ${event.UserEvent.length}\n\n`;
          return acc;
        }, "Статистика:\n");

        await ctx.reply(message, { reply_markup: adminsMenu });
      })
      .filter((ctx) => this.isAdmin(ctx.from?.id));

    this.bot
      .hears(AdminsActions.GENERATE_EXCEL, async (ctx) => {
        const events = await prisma.event.findMany({
          include: {
            UserEvent: {
              include: {
                user: true,
              },
            },
          },
        });

        const workbook = xlsx.utils.book_new();

        events.forEach((event, index) => {
          const worksheet = xlsx.utils.aoa_to_sheet([
            [event.name],
            ["ФИО", "Телефон", "Посетил"],
          ]);

          const userData = event.UserEvent.map((userEvent) => [
            userEvent.user.fio,
            userEvent.user.phone,
          ]);

          xlsx.utils.sheet_add_aoa(worksheet, userData, { origin: 2 });
          xlsx.utils.book_append_sheet(workbook, worksheet, index.toString());
        });

        const buffer = xlsx.write(workbook, { type: "buffer" });
        const stream = Readable.from(buffer);

        await ctx.replyWithDocument(new InputFile(stream, "sheet.xlsx"));
      })
      .filter((ctx) => this.isAdmin(ctx.from?.id));
  }

  private bindUserEvents() {
    this.bot
      .hears(Actions.SHOW_EVENTS, async (ctx) => {
        const events = await prisma.event.findMany({
          orderBy: {
            date: "asc"
          }
        });

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
              reply_markup: sendContactMenu,
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

            if (!phoneMask.test(ctx.message.text)) {
              return await ctx.reply(Messages.INVALID_PHONE);
            }

            await prisma.user.update({
              where: { id: user.id },
              data: { phone: ctx.message.text },
            });

            ctx.session.action = undefined;
            await ctx.reply(Messages.MENU_ACCESS, { reply_markup: baseMenu });
            return;
        }
      })
      .filter((ctx) => this.filterAdmins(ctx.from.id));

    this.bot
      .on(":contact", async (ctx) => {
        if (ctx.session.action !== SessionActions.WAITING_FOR_PHONE) return;

        if (!ctx.from?.id) {
          throw new Error(Messages.ERROR);
        }

        const user = await prisma.user.findUnique({
          where: {
            telegramId: ctx.from.id.toString(),
          },
        });

        if (!user) {
          return await ctx.reply(Messages.USE_START);
        }

        if (!ctx.message?.contact) {
          throw new Error(Messages.ERROR);
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { phone: ctx.message.contact.phone_number },
        });

        ctx.session.action = undefined;
        await ctx.reply(Messages.MENU_ACCESS, { reply_markup: baseMenu });
      })
      .filter((ctx) => this.filterAdmins(ctx.from?.id));
  }

  private filterAdmins(id?: number): boolean {
    if (!id) return false;
    return !this.admins.includes(id);
  }

  private isAdmin(id?: number): boolean {
    if (!id) return false;
    return this.admins.includes(id);
  }

  public async notify() {
    const now = new Date(Date.now());

    // Не выполнять функцию до 17 часов
    if (now.getHours() < 17) {
      return;
    }

    const events = await prisma.userEvent.findMany({
      where: {
        isNotified: false,
        event: {
          date: {
            // 31 час, потому что нужно за весь следующий день, а проверка начинается с 17 часов
            lt: new Date(now.getTime() + 1000 * 60 * 60 * 31),
            gt: now,
          },
        },
      },
      include: {
        event: true,
        user: true,
      },
    });

    events.forEach(async (event) => {
      await this.bot.api.sendMessage(
        event.user.telegramId,
        `Вы записаны на мероприятие "${event.event.name}", которое будет проходить ${new Intl.DateTimeFormat("ru-RU", DateFormat).format(event.event.date)}. Ждём вас!`,
      );
      await prisma.userEvent.update({
        where: {
          id: event.id,
        },
        data: {
          isNotified: true,
        },
      });
    });
  }
}
