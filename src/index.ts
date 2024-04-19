import { TelegramBot } from "./telegram";
import { Config } from "./utils";

class App {
  private readonly telegramBot: TelegramBot;

  constructor() {
    const config = new Config();
    const telegramBot = new TelegramBot(config.token, config.admins);

    this.telegramBot = telegramBot;
  }

  start() {
    this.telegramBot.start();
  }
}

const app = new App();
app.start();
