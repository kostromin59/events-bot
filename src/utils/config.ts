import "dotenv/config";

export class Config {
  public readonly token: string;
  public readonly admins: number[];

  constructor() {
    const token = process.env.BOT_TOKEN;
    if (!token) throw new Error("BOT_TOKEN не указан!");

    const adminsString = process.env.ADMINS;
    if (!adminsString) throw new Error("ADMINS не указан!");

    const admins = adminsString.trim().split(",").map(Number);

    this.token = token;
    this.admins = admins;
  }
}
