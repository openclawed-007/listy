import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.shared";
import Landing, { ANDROID_RELEASE_URL, GITHUB_URL } from "./Landing";

const { firebaseState } = vi.hoisted(() => ({
  firebaseState: { configured: true },
}));

vi.mock("../firebase", () => ({
  get isFirebaseConfigured() {
    return firebaseState.configured;
  },
}));

function renderLanding(login = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AuthContext.Provider
      value={{
        user: null,
        loading: false,
        login,
        loginAnonymously: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { login };
}

describe("Landing", () => {
  beforeEach(() => {
    firebaseState.configured = true;
  });

  it("renders the pitch, the sign-in call to action and the FAQ", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { level: 1, name: /add it on the sofa/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /start a list/i }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("heading", { name: /things people ask/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/is it actually free\?/i)).toBeInTheDocument();
  });

  it("starts Google sign-in from the hero button", async () => {
    const user = userEvent.setup();
    const { login } = renderLanding();

    await user.click(screen.getAllByRole("button", { name: /start a list/i })[0]);

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  });

  it("shows the sign-in error inline when login fails", async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(new Error("Popup blocked"));
    renderLanding(login);

    await user.click(screen.getAllByRole("button", { name: /start a list/i })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Popup blocked");
  });

  it("falls back to a /login link when Firebase is not configured", () => {
    firebaseState.configured = false;
    renderLanding();

    expect(screen.queryByRole("button", { name: /start a list/i })).toBeNull();
    const links = screen.getAllByRole("link", { name: /start a list/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/login");
  });

  it("renders a scannable QR code pointing at the live site", () => {
    renderLanding();

    const spotlight = screen
      .getByRole("heading", { name: /nobody had to install/i })
      .closest("section") as HTMLElement;
    expect(spotlight.querySelector("svg")).not.toBeNull();
    expect(within(spotlight).getByText(/this one's real/i)).toBeInTheDocument();
  });

  it("links out to the legal pages, GitHub and the Android release", () => {
    renderLanding();

    const footer = screen.getByRole("navigation", { name: /footer/i });
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(within(footer).getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      GITHUB_URL,
    );
    expect(within(footer).getByRole("link", { name: "Android" })).toHaveAttribute(
      "href",
      ANDROID_RELEASE_URL,
    );
    expect(
      screen.getByRole("link", { name: /download for android/i }),
    ).toHaveAttribute("href", ANDROID_RELEASE_URL);
  });
});
