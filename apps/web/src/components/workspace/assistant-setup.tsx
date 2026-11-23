import { MAIN_ACTION, OTHER_ACTION } from "./unsaved-changes";

// Spark (OSphera/spark#4): Set up Ember AI is gone. What's left are the buttons at a step's foot, which the
// other setup dialogs share, and which layer 2 moves to a better-named home.

/** The buttons at a step's foot, as Set up Turnstile's are: going back, or else cancelling, and going on. */
export function Actions({
  back,
  backLabel = "Back",
  next,
  nextLabel = "Continue",
  disabled = false,
  saving = false,
}: {
  back: (() => void) | null;
  backLabel?: string;
  /** Goes on, or null when the step's form does, as its submit button. */
  next: (() => void) | null;
  nextLabel?: string;
  disabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="mt-[26px] flex justify-end gap-2.5">
      {back && (
        <button type="button" disabled={saving} onClick={back} className={OTHER_ACTION}>
          {backLabel}
        </button>
      )}
      <button type={next ? "button" : "submit"} disabled={disabled || saving} onClick={next ?? undefined} className={MAIN_ACTION}>
        {nextLabel}
      </button>
    </div>
  );
}
