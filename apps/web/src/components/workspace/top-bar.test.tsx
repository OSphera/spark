import { searchPath, type Account, type Me, type Room } from "@ember/protocol";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountContext } from "@/hooks/use-account";
import { OpenSearchContext } from "./search-box";
import { TopBar } from "./top-bar";

const ada: Me = { id: "u1", name: "Ada Lovelace", administrator: false };
const general: Room = { id: "general", name: "general", kind: "open", icon: null };
const account: Account = {
  name: "Analytical Engines",
  tagline: "",
  hideTranslationButtons: true,
  customStyles: "",
  restrictRoomCreation: false,
  restrictChannelMentions: false,
  restrictEveryoneMention: false,
  warnBeforeNotifying: true,
  logo: null,
  customDomain: null,
  joinLink: true,
  openSignUp: false,
  emailDomainSignUp: false,
  emailDomains: [],
  navigationIcons: {},
  huddles: false,
  huddleCameras: true,
  huddleScreens: true,
  huddleVideo: "hd",
};

/** The top bar, as Ada sees it on the page at `address`. */
function showBar({ address = "/rooms/general", workspace = account } = {}) {
  history.replaceState(null, "", address);
  const field = createRef<HTMLButtonElement>();
  const openSearch = vi.fn();
  render(
    <AccountContext value={workspace}>
      <OpenSearchContext value={openSearch}>
        <TopBar me={ada} workspaceName={workspace.name} rooms={[general]} field={field} />
      </OpenSearchContext>
    </AccountContext>,
  );
  return { bar: screen.getByRole("banner"), field, openSearch, user: userEvent.setup() };
}

/** What the bar has to press, in order, each by its name. */
const controls = (bar: HTMLElement) => within(bar).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);

afterEach(() => history.replaceState(null, "", "/"));

describe("Top bar", () => {
  it("puts Back, Forward and History at the end of the sidebar's column, and the search field across the page's", () => {
    const { bar } = showBar();
    expect(controls(bar)).toEqual(["Back", "Forward", "History", "Search Analytical Engines"]);
    expect(bar).toHaveClass("h-top-bar", "border-b", "bg-surface", "grid-cols-[calc(var(--spacing-rail)+env(safe-area-inset-left))_var(--spacing-sidebar)_minmax(0,1fr)]");
    expect(screen.getByRole("button", { name: "History" }).parentElement).toHaveClass("col-start-2", "justify-end");
    expect(screen.getByRole("button", { name: "Search Analytical Engines" })).toHaveClass("flex-1", "rounded-[9px]", "bg-background");
  });

  it("is left out at 900px and below and on a phone in landscape, where the drawer or the rail has Search, and leaves out Back and Forward for fingers, which have their own way back", () => {
    const { bar } = showBar();
    expect(bar).toHaveClass("no-top-bar:hidden");
    const arrows = screen.getByRole("button", { name: "Back" }).parentElement!;
    expect(arrows).toContainElement(screen.getByRole("button", { name: "Forward" }));
    expect(arrows).toHaveClass("touch:hidden");
  });

  it("draws Iconoir's arrows, the Clock for History, and Search's icon in the field, which an administrator can choose", () => {
    const { bar } = showBar();
    const icons = Object.fromEntries(within(bar).getAllByRole("button").map((button) => [button.getAttribute("aria-label") ?? button.textContent, button.querySelector("svg")?.classList[0]]));
    expect(icons).toEqual({ Back: "iconoir-arrow-left", Forward: "iconoir-arrow-right", History: "iconoir-clock", "Search Analytical Engines": "iconoir-search" });
  });

  it("draws the icon an administrator chose for Search in the field", () => {
    showBar({ workspace: { ...account, navigationIcons: { search: "iconoir:solid:heart" } } });
    const icon = screen.getByRole("button", { name: "Search Analytical Engines" }).querySelector("[data-icon]");
    expect(icon).toHaveStyle({ maskImage: "url(/iconoir/icons/solid/heart.svg)", width: "17px", height: "17px" });
  });
});

describe("Search field", () => {
  it("opens the search box over itself", async () => {
    const { field, openSearch, user } = showBar();
    const search = screen.getByRole("button", { name: "Search Analytical Engines" });
    expect(field.current).toBe(search);
    await user.click(search);
    expect(openSearch).toHaveBeenCalledExactlyOnceWith({ opener: search });
    expect(location.pathname).toBe("/rooms/general");
  });

  it("shows the search the results page shows, and opens the search box with it, to change it", async () => {
    const { openSearch, user } = showBar({ address: searchPath({ q: "eel", in: "general", hasLink: true }, "oldest") });
    const search = screen.getByRole("button", { name: "Change search: in:general Has a link eel" });
    expect(search).toHaveTextContent("in:generalHas a linkeel");
    await user.click(search);
    expect(openSearch).toHaveBeenCalledExactlyOnceWith({ opener: search, search: { q: "eel", in: "general", hasLink: true }, sort: "oldest" });
  });

  it("says what it searches on the results page without a search, opening the search box as it's sorted", async () => {
    const { openSearch, user } = showBar({ address: "/searches" });
    const search = screen.getByRole("button", { name: "Search Analytical Engines" });
    await user.click(search);
    expect(openSearch).toHaveBeenCalledExactlyOnceWith({ opener: search, search: { q: "" }, sort: "newest" });
  });
});

describe("Spark without Ask @ember (OSphera/spark#4)", () => {
  it("ends the bar with the search field", () => {
    const { bar } = showBar();
    expect(controls(bar)).toEqual(["Back", "Forward", "History", "Search Analytical Engines"]);
  });
});
