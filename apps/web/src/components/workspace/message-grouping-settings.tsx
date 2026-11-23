import { useState } from "react";
import { DEFAULT_GROUPING_MINUTES, GROUPING_MINUTES, GROUPING_NAMES, type GroupingMinutes } from "@ember/protocol/grouping";
import { useAccount } from "@/hooks/use-account";

// Spark (OSphera/spark#2): Message grouping, in Workspace settings beside the other room choices, which
// saves at once, as huddles' Video quality does: how far apart someone's messages may be for the next to
// show under the one before, without their name and avatar again.

const CARD = "flex flex-col gap-3 rounded-[10px] border bg-surface px-[2ch] py-4 text-start max-md:px-3";
const NOTE = "text-[0.8em] text-muted-foreground max-md:text-[12px]";

interface Props {
  /** Saves the window chosen, then calls `settled`. */
  save: (minutes: GroupingMinutes, settled: () => void) => void;
}

export function MessageGrouping({ save }: Props) {
  const minutes = useAccount().groupingMinutes ?? DEFAULT_GROUPING_MINUTES;
  // The window chosen, while that's saved.
  const [chosen, setChosen] = useState<GroupingMinutes | null>(null);

  const choose = (to: GroupingMinutes) => {
    if (chosen !== null || to === minutes) return;
    setChosen(to);
    save(to, () => setChosen(null));
  };

  return (
    <section aria-labelledby="message-grouping-heading" className={CARD}>
      <div>
        <h2 id="message-grouping-heading" className="text-base font-semibold">
          Message grouping
        </h2>
        <p id="message-grouping-description" className={NOTE}>
          Someone's messages this close together show as one, under their name once.
        </p>
      </div>
      <select
        value={chosen ?? minutes}
        disabled={chosen !== null}
        onChange={(event) => choose(Number(event.target.value) as GroupingMinutes)}
        aria-labelledby="message-grouping-heading"
        aria-describedby="message-grouping-description"
        className="h-9 w-fit min-w-[18ch] rounded-md border bg-background px-2 text-sm disabled:opacity-60 touch:h-11 touch:text-base"
      >
        {GROUPING_MINUTES.map((each) => (
          <option key={each} value={each}>
            {GROUPING_NAMES[each]}
          </option>
        ))}
      </select>
    </section>
  );
}
