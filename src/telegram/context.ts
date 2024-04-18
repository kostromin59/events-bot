import { Context, SessionFlavor } from "grammy";
import { SessionActions } from "../utils";

export type SessionData = {
  action?: SessionActions;
};

export type BotContext = Context & SessionFlavor<SessionData>;
