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
  AdminsActions,
  phoneMasks,
} from "../utils";
import {
  adminsMenu,
  baseMenu,
  sendContactMenu,
} from "./menu";
import { Readable } from "stream";
import { Record } from "@prisma/client/runtime/library";

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
    // bot.use(showRegisteredEventsMenu);

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

  async start(notifyMessage?: string) {
    this.bot.start();

    if (notifyMessage) {
      const users = await prisma.user.findMany();

      for (const user of users) {
        try {
          await this.bot.api.sendMessage(user.telegramId, notifyMessage)
        } catch(e) {
          console.error(e)
        }
      }
    }
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
      .filter((ctx) => {return this.isAdmin(ctx.from?.id)})
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
      });

    this.bot
      .filter((ctx) => this.isAdmin(ctx.from?.id))
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
  }

  private bindUserEvents() {
    this.bot
      .filter((ctx) => this.filterAdmins(ctx.from?.id))
      .hears(Actions.SHOW_EVENTS, async (ctx) => {
        const events = await prisma.event.findMany({
          orderBy: {
            date: "asc"
          },
        });

        const eventsGroupedByDay = events.reduce((acc, event) => {
          const date = event.date.toISOString().split('T')[0];
          if (!acc[date]) {
            acc[date] = []
          }
          acc[date].push(event)
          return acc;
        }, {} as Record<string, {
          id: number;
          name: string;
          date: Date;
          description: string;
        }[]>);

        const message = Object.entries(eventsGroupedByDay).reduce((acc, [date, events]) => {
          acc += `<b>${new Intl.DateTimeFormat("ru-RU", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date(date))}</b>`

          acc += "\n"

          acc += events.reduce((acc, event) => {
            acc += new Intl.DateTimeFormat("ru-RU", {
              hour: "numeric",
              minute: "numeric",
              timeZone: "UTC"
            }).format(event.date)

            acc += ` - ${event.name}`
            if (event.description.length) {
              acc += `\n${event.description}`
            }

            acc += "\n\n"

            return acc
          }, "")

          return acc
        }, "")

        return ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: baseMenu
        });
      });

    this.bot
      .filter((ctx) => this.filterAdmins(ctx.from?.id))
      .hears(Actions.MY_EVENTS, async (ctx) => {
        if (!ctx.from?.id) return;

        const events = await prisma.userEvent.findMany({
          where: {
            user: {
              telegramId: ctx.from.id.toString(),
            },
          },
          include: {
            event: true,
          },
          orderBy: {
            event: {
              date: "asc"
            }
          }
        });

        if (!events.length) {
          return await ctx.reply("Вы ещё никуда не записаны!");
        }

        const eventsGroupedByDay = events.reduce((acc, event) => {
          const date = event.event.date.toISOString().split('T')[0];
          if (!acc[date]) {
            acc[date] = []
          }
          acc[date].push(event.event)
          return acc;
        }, {} as Record<string, {
          id: number;
          name: string;
          date: Date;
          description: string;
        }[]>);

        const message = Object.entries(eventsGroupedByDay).reduce((acc, [date, events]) => {
          acc += `<b>${new Intl.DateTimeFormat("ru-RU", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date(date))}</b>`

          acc += "\n"

          acc += events.reduce((acc, event) => {
            acc += new Intl.DateTimeFormat("ru-RU", {
              hour: "numeric",
              minute: "numeric",
              timeZone: "UTC"
            }).format(event.date)

            acc += ` - ${event.name}`
            if (event.description.length) {
              acc += `\n${event.description}`
            }

            acc += "\n\n"

            return acc
          }, "")


          return acc
        }, "")

        await ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: baseMenu,
        });
      });
 
    this.bot
      .filter((ctx) => this.filterAdmins(ctx.from?.id))
      .hears(Actions.REGISTER_TO_EVENT, async (ctx) => {
        const events = await prisma.event.findMany({
          orderBy: {
            date: "asc"
          }
        });
        const menu = new InlineKeyboard();

        events.forEach((event) => {
          menu.text(event.name, Actions.SELECTED_EVENT + `:${event.id}`).row();
        });

        await ctx.reply(Messages.SELECT_EVENTS, { reply_markup: menu });
      });

    this.bot
      .filter((ctx) => this.filterAdmins(ctx.from?.id))
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

        await ctx.answerCallbackQuery(Messages.FIND_REGISTERED_EVENTS);
      });

    this.bot
      .filter((ctx) => this.filterAdmins(ctx.from?.id))
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

            if (!phoneMasks.some((mask) => mask.test(ctx.message.text))) {
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
      });

    this.bot
      .filter((ctx) => this.filterAdmins(ctx.from?.id))
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
      });
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

    // Запустить только 21.05.2024 после 17:00 и до 23:00
    if (now.getDate() !== 21 && now.getMonth() !== 4 && now.getFullYear() !== 2024 && now.getHours() < 17 && now.getHours() > 23) {
      return;
    }

    const users = await prisma.user.findMany({
      include: {
        UserEvent: {
          include: {
            event: true
          },
          orderBy: {
            event: {
              date: "asc"
            }
          }
        }
      }
    });

    for (const user of users) {
      if (!user.UserEvent.some((event) => event.isNotified)) {
        try {
          const eventsGroupedByDay = user.UserEvent.reduce((acc, { event }) => {
            const date = event.date.toISOString().split('T')[0];
            if (!acc[date]) {
              acc[date] = []
            }
            acc[date].push(event)
            return acc;
          }, {} as Record<string, {
            id: number;
            name: string;
            date: Date;
            description: string;
          }[]>);

          const message = Object.entries(eventsGroupedByDay).reduce((acc, [date, events]) => {
            acc += `<b>${new Intl.DateTimeFormat("ru-RU", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }).format(new Date(date))}</b>`

            acc += "\n"

            acc += events.reduce((acc, event) => {
              acc += new Intl.DateTimeFormat("ru-RU", {
                hour: "numeric",
                minute: "numeric",
                timeZone: "UTC"
              }).format(event.date)

              acc += ` - ${event.name}`
              if (event.description.length) {
                acc += `\n${event.description}`
              }

              acc += "\n\n"

              return acc
            }, "")

            return acc
          }, "")

          await this.bot.api.sendMessage(user.telegramId,
            `Приглашаем вас <b>22-23 мая</b> на Дни дизайна в Перми. Выставка «Знай Наших!» состоится на площадке конгрессно-выставочного центра "PermExpo" в рамках краевого форума "Дни Пермского бизнеса. Расширяя границы Пермского края" <b>по адресу: ул. Шоссе Космонавтов, 59</b>. Программа и регистрация: https://archibookperm.ru/ До встречи!\n\n${message ? `Ваши записи:\n${message}` : ""}`,
            { parse_mode: "HTML" })
          await prisma.userEvent.updateMany({
            data: {
              isNotified: true
            },
            where: {
              userId: user.id
            }
          })
        } catch {
          console.log("Ошибка уведомления")
        }
      }
    }
  }
}
