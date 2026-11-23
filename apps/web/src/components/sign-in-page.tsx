import { useEffect, useRef, useState } from "react";
import {
  domainsInWords,
  EMAIL_SIGN_UP_PATH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_RESET_PATH,
  SIGN_IN_LIMITED,
  SIGN_IN_REJECTED,
  SIGN_UP_PATH,
  signsUpOpenly,
  signsUpWithEmailDomain,
  withEmailAddress,
  type Me,
} from "@ember/protocol";
import { AuthAlternative } from "@/components/auth-alternative";
import { AUTH_FORM, AuthCard, AuthHeading, AuthPage, Problem, type SignedOutWorkspace } from "@/components/auth-page";
import { FIELD_INPUT, Field, SubmitButton } from "@/components/field";
import { GuestSignIn } from "@/components/guest-sign-in";
import { Input } from "@/components/ui/input";
import { useTitle } from "@/hooks/use-title";
import { ApiError, signIn } from "@/lib/api";
import { forgetJoiningProblem, joiningProblemOnArrival } from "@/lib/joining";

// The sign-in page. A refused sign-in shakes the card and says why at the top of the form, in place of a
// flash, keeping the email address and emptying the password. One that fails on Ember's side says so over
// the card, as when Ember can't be reached, keeping both. While anyone may sign up, it links to the page
// for that, and it says why a way to join that's off sent someone here. While Ember can send email, the
// form links to resetting a forgotten password with a code Ember emails.

/**
 * The answers that refuse a sign-in, each for a reason the person can act on: a wrong email address or
 * password, or too many tries.
 */
const REFUSALS = new Set([401, 429]);

/** What a sign-in that failed on Ember's side says, the password typed being as likely right as not. */
const SIGN_IN_FAILED = "Ember couldn't sign you in just now. Please try again.";

/** Signs in with an email address and password, or with just a name when the workspace allows it. */
export function SignInPage({ workspace, onSignedIn }: { workspace: SignedOutWorkspace; onSignedIn: (me: Me) => void }) {
  const [asGuest, setAsGuest] = useState(false);
  const [emailAddress, setEmailAddress] = useState(() => new URLSearchParams(location.search).get("email_address") ?? "");
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(joiningProblemOnArrival);
  /** Why the last sign-in was refused, said at the top of the form. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  useTitle("Sign in");
  useEffect(() => {
    forgetJoiningProblem();
  }, []);

  async function submit() {
    setBusy(true);
    setProblem(null);
    setRefusal(null);
    try {
      onSignedIn(await signIn({ emailAddress, password: passwordInput.current?.value ?? "" }));
    } catch (error) {
      setBusy(false);
      if (!(error instanceof ApiError)) return setProblem("Couldn't reach Spark. Check your connection and try again.");
      if (!REFUSALS.has(error.status)) return setProblem(SIGN_IN_FAILED);
      if (passwordInput.current) passwordInput.current.value = "";
      setRefusal(error.status === 429 ? SIGN_IN_LIMITED : SIGN_IN_REJECTED);
      setShaking(true);
      passwordInput.current?.focus();
    }
  }

  return (
    <AuthPage workspace={workspace}>
      {problem && <Problem>{problem}</Problem>}
      <AuthCard onAnimationEnd={(event) => event.target === event.currentTarget && setShaking(false)} className={shaking ? "motion-safe:animate-shake" : undefined}>
        {asGuest ? (
          <GuestSignIn logo={workspace.account.logo} onSignedIn={onSignedIn} onUsePassword={() => setAsGuest(false)} />
        ) : (
          <>
            <AuthHeading title={`Sign in to ${workspace.account.name}`} logo={workspace.account.logo}>Welcome back. Pick up the conversation.</AuthHeading>
            <form
              className={AUTH_FORM}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {refusal && (
                <p id="sign-in-error" role="alert" className="rounded-[8px] border border-auth-error-border bg-auth-error-background px-3.5 py-3 text-[14px] leading-normal text-auth-error">
                  {refusal}
                </p>
              )}
              <Field id="email_address" label="Email address" translation="email_address">
                <Input
                  id="email_address"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="Enter your email address"
                  value={emailAddress}
                  onChange={(event) => setEmailAddress(event.target.value)}
                  className={FIELD_INPUT}
                />
              </Field>
              <Field id="password" label="Password" translation="password">
                {/* Uncontrolled, so what's typed never reaches its `value` attribute, where custom CSS could read it. */}
                <Input
                  ref={passwordInput}
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  maxLength={MAX_PASSWORD_LENGTH}
                  className={FIELD_INPUT}
                />
              </Field>
              <SubmitButton disabled={busy}>Sign in</SubmitButton>
            </form>
            {workspace.passwordResetCodes && <AuthAlternative question="Forgot your password?" action="Reset it" href={withEmailAddress(PASSWORD_RESET_PATH, emailAddress)} />}
            {signsUpOpenly(workspace.account) ? (
              <AuthAlternative question="New here?" action="Create an account" href={SIGN_UP_PATH} />
            ) : (
              // Open lets anyone in, addresses at the email domains too, so this is for when it's off.
              signsUpWithEmailDomain(workspace.account) && (
                <AuthAlternative question={`Have an address at ${domainsInWords(workspace.account.emailDomains)}?`} action="Join with it" href={EMAIL_SIGN_UP_PATH} />
              )
            )}
            {workspace.guestSignIn && <AuthAlternative question="No account?" action="Join with just a name" onClick={() => setAsGuest(true)} disabled={busy} />}
          </>
        )}
      </AuthCard>
    </AuthPage>
  );
}
