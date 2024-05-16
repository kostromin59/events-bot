import { TelegramBot } from "./telegram";
import { Config } from "./utils";
import cron from "node-cron";

class App {
  private readonly telegramBot: TelegramBot;
  private readonly config: Config;

  constructor() {
    const config = new Config();
    const telegramBot = new TelegramBot(config.token, config.admins);

    this.telegramBot = telegramBot;
    this.config = config;
  }

  start() {
    this.telegramBot.start(this.config.notifyMessage);
    cron.schedule("0 * * * *", () => {
      this.telegramBot.notify();
    });
    this.telegramBot.notify()
  }
}

const app = new App();
app.start();
