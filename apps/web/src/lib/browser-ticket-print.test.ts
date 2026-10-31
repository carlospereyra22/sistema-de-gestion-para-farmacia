import { expect, it, vi } from "vitest";
import { printTicketFrame } from "./browser-ticket-print";
it("waits for the logo then prints only the ticket frame without an agent", async () => {
  const order: string[] = [];
  const frame = {
    contentDocument: {
      querySelector: () => null,
      images: [
        {
          decode: async () => {
            order.push("logo");
          },
        },
      ],
      fonts: { ready: Promise.resolve() },
    },
    contentWindow: {
      focus: vi.fn(),
      print: () => {
        order.push("print");
      },
    },
  };
  await printTicketFrame(frame as unknown as HTMLIFrameElement);
  expect(order).toEqual(["logo", "print"]);
});
it("does not print when the frame or its image is unavailable", async () => {
  await expect(printTicketFrame({} as HTMLIFrameElement)).rejects.toThrow();
  const print = vi.fn();
  await expect(
    printTicketFrame({
      contentDocument: {
        images: [
          {
            decode: async () => {
              throw Error("image error");
            },
          },
        ],
      },
      contentWindow: { print },
    } as unknown as HTMLIFrameElement),
  ).rejects.toThrow();
  expect(print).not.toHaveBeenCalled();
});
it("sizes the roll page after fonts and images and reuses the page style", async () => {
  const style = { id: "", textContent: "" };
  const append = vi.fn();
  const createElement = vi.fn(() => style);
  const ticket = { getBoundingClientRect: () => ({ height: 960 }) };
  const frame = {
    contentDocument: {
      images: [],
      fonts: { ready: Promise.resolve() },
      querySelector: (selector: string) =>
        selector === ".ticket" ? ticket : null,
      createElement,
      head: { appendChild: append },
    },
    contentWindow: { focus: vi.fn(), print: vi.fn() },
  };
  await printTicketFrame(frame as unknown as HTMLIFrameElement);
  expect(style.textContent).toBe("@page{size:80mm 255mm;margin:0}");
  expect(append).toHaveBeenCalledOnce();
  expect(frame.contentWindow.print).toHaveBeenCalledOnce();
});
