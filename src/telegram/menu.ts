import { Keyboard } from "grammy";
import { Actions, AdminsActions } from "../utils";

export const baseMenu = new Keyboard()
  .text(Actions.SHOW_EVENTS)
  .text(Actions.REGISTER_TO_EVENT).row()
  .text(Actions.MY_EVENTS)
  .resized();

export const adminsMenu = new Keyboard()
  .text(AdminsActions.SHOW_STATISTICS)
  .text(AdminsActions.GENERATE_EXCEL)
  .resized();

export const sendContactMenu = new Keyboard()
  .requestContact("Отправить контакт")
  .placeholder("Номер телефона")
  .resized();
