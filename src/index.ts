import { TelegramBot } from "./telegram";
import { Config } from "./utils";
import cron from "node-cron";

class App {
  private readonly telegramBot: TelegramBot;

  constructor() {
    const config = new Config();
    const telegramBot = new TelegramBot(config.token, config.admins);

    this.telegramBot = telegramBot;
  }

  start() {
    this.telegramBot.start();
    cron.schedule("0 * * * *", () => {
      this.telegramBot.notify();
    });
  }
}

const app = new App();
app.start();

