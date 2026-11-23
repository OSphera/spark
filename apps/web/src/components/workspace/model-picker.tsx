import { FIELD_INPUT } from "@/components/field";
import { cn } from "@/lib/utils";

// Spark (OSphera/spark#4): Ember AI's model menu is gone. What's left are the styles and the dashboard
// link the setup dialogs and huddles share, which layer 2 moves to a better-named home.

export const NOTE = "text-[0.8em] text-muted-foreground max-md:text-[12px]";
export const SELECT = cn("w-full min-w-0 border outline-none dark:bg-input/30", FIELD_INPUT);

/**
 * The page at `path` in the Cloudflare dashboard, in the account `accountId` names, or else in the one
 * the dashboard picks, asking someone with several accounts which.
 */
export const dashboard = (accountId: string | null, path: string) =>
  accountId === null ? `https://dash.cloudflare.com/?to=/:account/${path}` : `https://dash.cloudflare.com/${accountId}/${path}`;
