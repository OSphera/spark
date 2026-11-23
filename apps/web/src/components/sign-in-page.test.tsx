import {
  JOINING_PROBLEMS,
  MAX_PASSWORD_LENGTH,
  SIGN_IN_LIMITED,
  SIGN_IN_REJECTED,
  signInSaying,
  type Bootstrap,
} from "@ember/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHROME_MAC } from "@/test-platforms";
import { FlashProvider } from "./flash";
import { SignInPage } from "./sign-in-page";

const ada = { id: "u1", name: "Ada" };
const workspace: Omit<Bootstrap, "user"> = {
  setup: "complete",
  setupAccess: "link",
  setupPlaceholders: { name: "Kevin Rose", emailAddress: "kevin@kevinrose.com" },
  guestSignIn: false,
  turnstileSiteKey: null,
  passwordResetCodes: false,
  account: { name: "Spark", tagline: "", hideTranslationButtons: true, customStyles: "", restrictRoomCreation: false, restrictChannelMentions: false, restrictEveryoneMention: false, warnBeforeNotifying: true, logo: null, customDomain: null, joinLink: true, openSignUp: false, emailDomainSignUp: false, emailDomains: [], navigationIcons: {}, huddles: false, huddleCameras: true, huddleScreens: true, huddleVideo: "hd" },
  version: "0.1",
  vapidPublicKey: null,
  platform: CHROME_MAC,
};

const respond = (status: number, body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));

/** Types an email address and password and submits them. */
async function signIn(password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email address"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), `${password}{Enter}`);
}

const card = () => screen.getByRole("heading", { name: "Sign in to Spark" }).closest("section")!;

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
  sessionStorage.clear();
});

describe("Sign in with email and password", () => {
  it("asks for an email address and password", () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(document.title).toBe("Sign in");
    expect(screen.getByRole("img", { name: "Spark" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to Spark" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back. Pick up the conversation.")).toBeInTheDocument();

    const emailAddress = screen.getByLabelText("Email address");
    expect(emailAddress).toHaveFocus();
    expect(emailAddress).toHaveAttribute("type", "email");
    expect(emailAddress).toHaveAttribute("autocomplete", "username");
    expect(emailAddress).toHaveAttribute("placeholder", "Enter your email address");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toHaveAttribute("placeholder", "Enter your password");
    expect(password).toHaveAttribute("maxlength", String(MAX_PASSWORD_LENGTH));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("offers no Sign in with Memberful or single sign-on, even when an old address names their problems", () => {
    history.replaceState(null, "", "/session/new?memberful=membership&sso=failed");
    render(<SignInPage workspace={{ ...workspace, guestSignIn: true }} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.queryByRole("link", { name: /Sign in with/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in with/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Memberful|single sign-on/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("names the workspace", () => {
    render(<SignInPage workspace={{ ...workspace, account: { ...workspace.account, name: "Analytical Engines" } }} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.getByRole("heading", { name: "Sign in to Analytical Engines" })).toBeInTheDocument();
  });

  it("fills in the email address its link gives", () => {
    history.replaceState(null, "", "/session/new?email_address=ada%40example.com");
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.getByLabelText("Email address")).toHaveValue("ada@example.com");
  });

  it("signs in with them", async () => {
    const fetch = respond(201, { user: ada });
    const onSignedIn = vi.fn();
    render(<SignInPage workspace={workspace} onSignedIn={onSignedIn} />, { wrapper: FlashProvider });
    await signIn("correct horse");

    const credentials = { emailAddress: "ada@example.com", password: "correct horse" };
    expect(fetch).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "POST", body: JSON.stringify(credentials) }));
    expect(onSignedIn).toHaveBeenCalledWith(ada);
  });

  it("shakes, says at the top of the form that the email or password is wrong, and empties the password when it's refused", async () => {
    respond(401, { error: SIGN_IN_REJECTED });
    const onSignedIn = vi.fn();
    render(<SignInPage workspace={workspace} onSignedIn={onSignedIn} />, { wrapper: FlashProvider });
    await signIn("wrong horse");

    // At the top of the form, in place of a flash.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password. Please try again.");
    expect(alert).toHaveAttribute("id", "sign-in-error");
    expect(alert.closest("form")!.firstElementChild).toBe(alert);
    expect(alert).toHaveClass("border-auth-error-border", "bg-auth-error-background", "text-auth-error", "text-[14px]");
    expect(card()).toHaveClass("motion-safe:animate-shake");
    expect(screen.getByLabelText("Email address")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(onSignedIn).not.toHaveBeenCalled();

    // The card shakes once, and what went wrong stays said until the next try.
    fireEvent.animationEnd(card());
    expect(card()).not.toHaveClass("motion-safe:animate-shake");
    fireEvent.animationEnd(alert);
    expect(screen.getByRole("alert")).toBe(alert);
  });

  it("says it afresh for each refusal, for screen readers to hear again", async () => {
    respond(401, { error: SIGN_IN_REJECTED });
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await signIn("wrong horse");
    const first = await screen.findByRole("alert");

    await userEvent.type(screen.getByLabelText("Password"), "still wrong{Enter}");
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("says when Spark can't be reached, keeping what was typed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await signIn("correct horse");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach Spark. Check your connection and try again.");
    expect(screen.getByLabelText("Password")).toHaveValue("correct horse");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(card()).not.toHaveClass("motion-safe:animate-shake");
  });

  it.each([
    ["the Worker's own failure", () => respond(500, { error: "Something went wrong" })],
    ["an answer from in front of it with nothing in it", () => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 502 }))],
  ])("says Ember couldn't sign them in, rather than that the password is wrong, keeping what was typed, at %s", async (_, answer) => {
    answer();
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await signIn("correct horse");

    expect(await screen.findByRole("alert")).toHaveTextContent("Ember couldn't sign you in just now. Please try again.");
    expect(card()).not.toContainElement(screen.getByRole("alert"));
    expect(screen.getByLabelText("Password")).toHaveValue("correct horse");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(card()).not.toHaveClass("motion-safe:animate-shake");
  });
});

describe("Landmarks and names", () => {
  it("starts with Skip to main content, which focuses the main content", async () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(document.body.querySelector("a[href], button, input")).toBe(skip);
    await userEvent.click(skip);
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("Sign-in attempt limit", () => {
  it("says to wait after too many attempts, shaking the card as for a wrong password", async () => {
    respond(429, { error: SIGN_IN_LIMITED });
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await signIn("correct horse");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in attempts. Please wait a few minutes and try again.");
    expect(card()).toHaveClass("motion-safe:animate-shake");
  });
});

describe("Version", () => {
  it("shows Ember's version under the card", () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(card().nextElementSibling).toHaveTextContent(/^Spark version 0\.1$/);
    expect(screen.queryByRole("link", { name: /@/ })).not.toBeInTheDocument();
  });
});

describe("Sign in with a display name", () => {
  it("offers joining with just a name when the workspace allows it, and back", async () => {
    const user = userEvent.setup();
    render(<SignInPage workspace={{ ...workspace, guestSignIn: true }} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await user.click(screen.getByRole("button", { name: "Join with just a name" }));
    expect(screen.getByRole("heading", { name: "Welcome to Spark" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in to Spark" })).toBeInTheDocument();
  });

  it("only asks for a password when it doesn't", () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.queryByRole("button", { name: "Join with just a name" })).not.toBeInTheDocument();
  });

  it("keeps either card from switching while it's signing in, so only one sign-in is on its way", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<SignInPage workspace={{ ...workspace, guestSignIn: true }} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await signIn("correct horse");
    expect(screen.getByRole("button", { name: "Join with just a name" })).toBeDisabled();

    cleanup();
    render(<SignInPage workspace={{ ...workspace, guestSignIn: true }} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await user.click(screen.getByRole("button", { name: "Join with just a name" }));
    await user.type(screen.getByLabelText("Your name"), "Ada{Enter}");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});

describe("Workspace logo", () => {
  const logo = "/account/logo?v=20261017120000";
  const withLogo = { ...workspace, account: { ...workspace.account, logo }, guestSignIn: true };

  it("shows the workspace's logo in place of Spark's flame", () => {
    render(<SignInPage workspace={withLogo} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.getByRole("img", { name: "Account logo" })).toHaveAttribute("src", logo);
    expect(screen.queryByRole("img", { name: "Spark" })).toBeNull();
  });

  it("shows it over joining with just a name too", async () => {
    render(<SignInPage workspace={withLogo} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    await userEvent.click(screen.getByRole("button", { name: "Join with just a name" }));
    expect(screen.getByRole("heading", { name: "Welcome to Spark" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Account logo" })).toHaveAttribute("src", logo);
  });
});

describe("Custom CSS", () => {
  it("keeps the password typed out of its field's value attribute, where custom CSS could read it", async () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    const password = screen.getByLabelText("Password");
    await userEvent.type(password, "correct horse");
    expect(password).toHaveValue("correct horse");
    expect(password).not.toHaveAttribute("value");
  });
});

describe("Sign up without a link", () => {
  const open = { ...workspace, account: { ...workspace.account, openSignUp: true }, guestSignIn: true };

  it("offers Create an account while anyone may sign up, before joining with just a name", () => {
    render(<SignInPage workspace={open} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.getByText("New here?")).toBeInTheDocument();
    const create = screen.getByRole("link", { name: "Create an account" });
    expect(create).toHaveAttribute("href", "/join");
    expect(create.compareDocumentPosition(screen.getByRole("button", { name: "Join with just a name" }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("doesn't while it's off", () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.queryByRole("link", { name: "Create an account" })).not.toBeInTheDocument();
  });
});

describe("Join with an email domain", () => {
  const atDomains = { ...workspace, account: { ...workspace.account, emailDomainSignUp: true, emailDomains: ["example.org", "example.com"] } };
  const joinWithIt = () => screen.queryByRole("link", { name: "Join with it" });

  it("offers joining with an address at the email domains, naming them, while Email domain lets people in", () => {
    render(<SignInPage workspace={atDomains} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(joinWithIt()).toHaveAttribute("href", "/join/email");
    expect(joinWithIt()!.parentElement).toHaveTextContent("Have an address at example.org or example.com? Join with it");
  });

  it("offers Create an account in its place while Open lets anyone in", () => {
    render(<SignInPage workspace={{ ...atDomains, account: { ...atDomains.account, openSignUp: true } }} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.getByRole("link", { name: "Create an account" })).toBeInTheDocument();
    expect(joinWithIt()).not.toBeInTheDocument();
  });

  it("doesn't while it's off", () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(joinWithIt()).not.toBeInTheDocument();
  });
});

describe("Ways to join", () => {
  it.each(Object.entries(JOINING_PROBLEMS))("says why a way to join sent the browser here, once, taking it out of the address: %s", (problem, says) => {
    history.replaceState(null, "", `${signInSaying(problem as keyof typeof JOINING_PROBLEMS)}&email_address=ada%40example.com#top`);
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.getByRole("alert")).toHaveTextContent(says);
    expect(`${location.pathname}${location.search}${location.hash}`).toBe("/session/new?email_address=ada%40example.com#top");

    cleanup();
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says nothing of a problem it doesn't know", () => {
    history.replaceState(null, "", "/session/new?joining=constructor");
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(location.search).toBe("");
  });
});

describe("Reset a forgotten password with an emailed code", () => {
  const sendsEmail = { ...workspace, passwordResetCodes: true };
  const resetIt = () => screen.queryByRole("link", { name: "Reset it" });

  it("offers to reset a forgotten password under the form while Spark can send email, with the address typed", async () => {
    render(<SignInPage workspace={sendsEmail} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(resetIt()).toHaveAttribute("href", "/passwords/new");
    expect(resetIt()!.parentElement).toHaveTextContent("Forgot your password? Reset it");
    expect(screen.getByRole("button", { name: "Sign in" }).compareDocumentPosition(resetIt()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await userEvent.type(screen.getByLabelText("Email address"), "ada@example.com");
    expect(resetIt()).toHaveAttribute("href", "/passwords/new?email_address=ada%40example.com");
  });

  it("doesn't while Spark can't send email", () => {
    render(<SignInPage workspace={workspace} onSignedIn={vi.fn()} />, { wrapper: FlashProvider });
    expect(resetIt()).not.toBeInTheDocument();
  });
});
