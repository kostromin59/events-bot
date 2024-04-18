import { Context, SessionFlavor } from "grammy";
import { Actions } from "../utils";

export type SessionData = {
  action?: Actions;
};

export type BotContext = Context & SessionFlavor<SessionData>;
