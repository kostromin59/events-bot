import { TelegramBot } from "./telegram";
import { Config } from "./utils";

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
    this.telegramBot.notify()
  }
}

const app = new App();
app.start();
