import { Bot } from "grammy";

export class TelegramBot {
  private readonly bot: Bot;

  constructor(token: string) {
    const bot = new Bot(token);
    this.bot = bot;

    this.bindEvents();
  }

  start() {
    return this.bot.start();
  }

  bindEvents() {
    this.bot.command("start", (ctx) => {
      ctx.reply("Hello, world!");
    });
  }
}
