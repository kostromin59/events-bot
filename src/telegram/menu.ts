import { Keyboard } from "grammy";
import { Menu } from "@grammyjs/menu";
import { BotContext } from "./context";
import { Actions } from "../utils";

export const baseMenu = new Keyboard()
  .text(Actions.SHOW_EVENTS)
  .text(Actions.REGISTER_TO_EVENT)
  .resized();

export const skipPhoneMenu = new Menu<BotContext>("skipPhoneMenu").text(
  "Не указывать",
  (ctx) => {
    ctx.session.action = undefined;

    ctx.reply("Вам доступно меню!", { reply_markup: baseMenu });
  },
);
