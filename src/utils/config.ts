import "dotenv/config";

export class Config {
  public readonly token: string;

  constructor() {
    const token = process.env.BOT_TOKEN;
    if (!token) throw new Error("BOT_TOKEN не указан!");

    this.token = token;
  }
}
