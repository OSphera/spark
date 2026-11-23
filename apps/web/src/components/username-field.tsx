import { MAX_USERNAME_LENGTH, usernameOf } from "@ember/protocol";
import { FIELD_INPUT, Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (username: string) => void;
  disabled: boolean;
}

/**
 * Your username's field, with an @ drawn before what's typed, which it keeps as the Worker keeps a
 * username (`usernameOf`): in lowercase, without spaces or an @ of its own. A line under it says what
 * it's for.
 */
export function UsernameField({ value, onChange, disabled }: Props) {
  return (
    <Field id="user_username" label="Username">
      <div className="relative min-w-0">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-base text-muted-foreground">
          @
        </span>
        <Input
          id="user_username"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="username"
          maxLength={MAX_USERNAME_LENGTH}
          data-1p-ignore
          aria-describedby="user_username-help"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(usernameOf(event.target.value))}
          className={cn(FIELD_INPUT, "ps-7")}
        />
      </div>
      <p id="user_username-help" className="text-[0.8em] text-muted-foreground">
        People find you by typing @ and your username.
      </p>
    </Field>
  );
}
