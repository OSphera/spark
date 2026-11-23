import { DEFAULT_GROUPING_MINUTES, GROUPING_MINUTES, GROUPING_NAMES, type GroupingMinutes } from "@ember/protocol/grouping";

// Spark (OSphera/spark#2): Message grouping, a row of General's preferences beside Warn before notifying,
// saved with them by Save changes: how far apart someone's messages may be for the next to show under the
// one before, without their name and avatar again.

interface Props {
  /** The window the workspace has, or absent for the default. */
  saved: GroupingMinutes | undefined;
  /** The window chosen and not yet saved, or null for none. */
  chosen: GroupingMinutes | null;
  onChoose: (minutes: GroupingMinutes) => void;
}

export function MessageGroupingRow({ saved, chosen, onChoose }: Props) {
  return (
    <div id="message-grouping-settings" className="flex items-center gap-x-[1ch] gap-y-4 rounded-[10px] border bg-surface p-5">
      <div className="min-w-0 flex-1 text-start">
        <div id="message-grouping-heading">Message grouping</div>
        <p id="message-grouping-description" className="text-[0.8em] text-muted-foreground max-md:text-[12px]">
          Someone's messages this close together show as one, under their name once.
        </p>
      </div>
      <select
        value={chosen ?? saved ?? DEFAULT_GROUPING_MINUTES}
        onChange={(event) => onChoose(Number(event.target.value) as GroupingMinutes)}
        aria-labelledby="message-grouping-heading"
        aria-describedby="message-grouping-description"
        className="h-9 w-fit flex-none rounded-md border bg-background px-2 text-sm touch:h-11 touch:text-base"
      >
        {GROUPING_MINUTES.map((each) => (
          <option key={each} value={each}>
            {GROUPING_NAMES[each]}
          </option>
        ))}
      </select>
    </div>
  );
}
