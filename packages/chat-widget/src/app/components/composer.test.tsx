import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Composer } from "./composer";
import type { WidgetUpload } from "../widget";

type ComposerProps = Parameters<typeof Composer>[0];

function makeUpload(overrides: Partial<WidgetUpload> = {}): WidgetUpload {
  return {
    localId: "u-1",
    filename: "photo.png",
    size: 2048,
    progress: 0.5,
    status: "uploading",
    file: new File(["x"], "photo.png", { type: "image/png" }),
    ...overrides,
  };
}

function renderComposer(overrides: Partial<ComposerProps> = {}) {
  const props: ComposerProps = {
    draft: "",
    sending: false,
    uploads: [],
    onAddFiles: vi.fn(),
    onRemoveUpload: vi.fn(),
    onRetryUpload: vi.fn(),
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onTypingStart: vi.fn(),
    onTypingStop: vi.fn(),
    ...overrides,
  };
  const view = render(<Composer {...props} />);
  return { props, ...view };
}

describe("Composer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("propagates input to onDraftChange", () => {
    const { props } = renderComposer();
    const textarea = screen.getByLabelText("Message");

    fireEvent.input(textarea, { target: { value: "hi there" } });

    expect(props.onDraftChange).toHaveBeenCalledWith("hi there");
  });

  it("throttles typing-start and emits typing-stop after idling", () => {
    vi.useFakeTimers();
    const { props } = renderComposer();
    const textarea = screen.getByLabelText("Message");

    fireEvent.input(textarea, { target: { value: "h" } });
    fireEvent.input(textarea, { target: { value: "he" } });
    // Two keystrokes inside the 2s window collapse into one start event.
    expect(props.onTypingStart).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2100);
    fireEvent.input(textarea, { target: { value: "hel" } });
    expect(props.onTypingStart).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2500);
    expect(props.onTypingStop).toHaveBeenCalledTimes(1);
  });

  it("emits typing-stop immediately when the draft is cleared", () => {
    vi.useFakeTimers();
    const { props } = renderComposer();
    const textarea = screen.getByLabelText("Message");

    fireEvent.input(textarea, { target: { value: "h" } });
    fireEvent.input(textarea, { target: { value: "" } });

    expect(props.onTypingStop).toHaveBeenCalledTimes(1);
  });

  it("submits the trimmed draft on Enter and clears the input", () => {
    const { props } = renderComposer({ draft: "  hello world  " });

    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

    expect(props.onSend).toHaveBeenCalledWith("hello world");
    expect(props.onDraftChange).toHaveBeenCalledWith("");
  });

  it("does not submit on Shift+Enter", () => {
    const { props } = renderComposer({ draft: "hello" });

    fireEvent.keyDown(screen.getByLabelText("Message"), {
      key: "Enter",
      shiftKey: true,
    });

    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("blocks empty submissions and disables the send button", () => {
    const { props } = renderComposer({ draft: "   " });

    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

    expect(props.onSend).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText<HTMLButtonElement>("Send message").disabled,
    ).toBe(true);
  });

  it("blocks submission and shows a spinner while sending", () => {
    const { props } = renderComposer({ draft: "hello", sending: true });

    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

    expect(props.onSend).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText<HTMLButtonElement>("Send message").disabled,
    ).toBe(true);
    expect(screen.getByLabelText("Sending")).toBeTruthy();
  });

  it("blocks submission while a file is still uploading", () => {
    const { props } = renderComposer({
      draft: "hello",
      uploads: [makeUpload({ progress: 0.5 })],
    });

    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/photo\.png/)).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("allows sending with only finished attachments and no text", () => {
    const { props } = renderComposer({
      draft: "",
      uploads: [makeUpload({ status: "done", attachmentId: "att-1" })],
    });

    const sendButton = screen.getByLabelText<HTMLButtonElement>("Send message");
    expect(sendButton.disabled).toBe(false);

    fireEvent.click(sendButton);
    expect(props.onSend).toHaveBeenCalledWith("");
  });

  it("offers retry and remove actions on a failed upload", () => {
    const { props } = renderComposer({
      uploads: [makeUpload({ status: "error", error: "File too large" })],
    });

    expect(screen.getByText("File too large")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Retry photo.png"));
    expect(props.onRetryUpload).toHaveBeenCalledWith("u-1");

    fireEvent.click(screen.getByLabelText("Remove photo.png"));
    expect(props.onRemoveUpload).toHaveBeenCalledWith("u-1");
  });

  it("forwards selected files and resets the file input", () => {
    const { props, container } = renderComposer();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });

    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    expect(props.onAddFiles).toHaveBeenCalledWith([file]);
    expect(input.value).toBe("");
  });
});
