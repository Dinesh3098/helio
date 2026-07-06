import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const mutate = vi.fn();
let isError = false;
let error: unknown = null;

vi.mock("../hooks", () => ({
  useLogin: () => ({
    mutate,
    get isError() {
      return isError;
    },
    get error() {
      return error;
    },
    isPending: false,
  }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mutate.mockClear();
    isError = false;
    error = null;
  });

  it("shows validation errors and never submits invalid input", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /log in|sign in/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("submits valid credentials to the login mutation", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@company.com");
    await user.type(screen.getByLabelText(/password/i), "Str0ng!Passw0rd");
    await user.click(screen.getByRole("button", { name: /log in|sign in/i }));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith({
        email: "jane@company.com",
        password: "Str0ng!Passw0rd",
      });
    });
  });

  it("surfaces API errors from the mutation", () => {
    isError = true;
    error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { data: { message: "Invalid credentials" } },
    });
    render(<LoginForm />);
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });
});
