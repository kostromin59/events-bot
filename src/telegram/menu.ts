import { Menu } from "@grammyjs/menu";
import { BotContext } from "./context";

export const skipPhoneMenu = new Menu<BotContext>("skipPhoneMenu").text(
  "Не указывать",
  (ctx) => {
    ctx.session.action = undefined;

    ctx.reply("ok");
    // TODO: Отправить меню
  },
);
