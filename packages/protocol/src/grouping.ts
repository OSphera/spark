// Spark (OSphera/spark#2): how close together someone's messages must be for the next to show under the
// one before it, without their name and avatar again. Campfire, and Ember after it, grouped messages five
// minutes apart; people posting separate thoughts in a row read them as one message. So an administrator
// chooses the window in Workspace settings, and a workspace that hasn't chosen groups them two minutes
// apart. Never groups none, each message showing its author.

/** The windows Workspace settings offers, in minutes: 0 is Never. */
export const GROUPING_MINUTES = [0, 1, 2, 5, 10] as const;
export type GroupingMinutes = (typeof GROUPING_MINUTES)[number];

/** The window until an administrator chooses one. */
export const DEFAULT_GROUPING_MINUTES: GroupingMinutes = 2;

/** Whether `value` is one of the windows Workspace settings offers. */
export const isGroupingMinutes = (value: unknown): value is GroupingMinutes => GROUPING_MINUTES.includes(value as GroupingMinutes);

export const GROUPING_MINUTES_REFUSED = `Message grouping must be one of ${GROUPING_MINUTES.join(", ")} minutes`;

/** The window in milliseconds, for a workspace that has `minutes` or hasn't chosen. */
export const groupingWindowMs = (minutes: GroupingMinutes | undefined) => (minutes ?? DEFAULT_GROUPING_MINUTES) * 60 * 1000;

/** What Workspace settings calls each window. */
export const GROUPING_NAMES: Record<GroupingMinutes, string> = {
  0: "Never",
  1: "1 minute",
  2: "2 minutes",
  5: "5 minutes",
  10: "10 minutes",
};
