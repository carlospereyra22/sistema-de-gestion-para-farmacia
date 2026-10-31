import { EventEmitter } from "node:events";
import { request } from "node:https";
import { postProductionWsfe } from "./arca-production-transport";

jest.mock("node:https", () => ({ request: jest.fn() }));
describe("production WSFE TLS transport", () => {
  let req: EventEmitter & { end: jest.Mock; destroy: jest.Mock };
  let response: EventEmitter & { statusCode: number; destroy: jest.Mock };
  let receive: (value: typeof response) => void;
  beforeEach(() => {
    jest.useFakeTimers();
    req = Object.assign(new EventEmitter(), {
      end: jest.fn(),
      destroy: jest.fn((error: Error) => req.emit("error", error)),
    });
    response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      destroy: jest.fn(),
    });
    jest.mocked(request).mockImplementation(((...args: unknown[]) => {
      receive = args[2] as typeof receive;
      return req;
    }) as unknown as typeof request);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  it("uses strict TLS, ECDHE and the fixed host; reads SOAP", async () => {
    const pending = postProductionWsfe("private body", '"action"');
    expect(request).toHaveBeenCalledWith(
      "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
      expect.objectContaining({
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        ciphers: "ECDHE+AESGCM:ECDHE+CHACHA20",
        method: "POST",
      }),
      expect.any(Function),
    );
    expect(req.end).toHaveBeenCalledWith("private body");
    receive(response);
    response.emit("data", Buffer.from("<result/>"));
    response.emit("end");
    await expect(pending).resolves.toBe("<result/>");
    expect(jest.getTimerCount()).toBe(0);
  });
  it("retains SOAP faults on HTTP 500 for sanitized parsing", async () => {
    const pending = postProductionWsfe("body", "action");
    response.statusCode = 500;
    receive(response);
    response.emit("data", Buffer.from("<Fault/>"));
    response.emit("end");
    await expect(pending).resolves.toBe("<Fault/>");
  });
  it("rejects redirects without sending again", async () => {
    const pending = postProductionWsfe("body", "action");
    response.statusCode = 302;
    receive(response);
    await expect(pending).rejects.toThrow("transport status");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds response size", async () => {
    const pending = postProductionWsfe("body", "action");
    receive(response);
    response.emit("data", Buffer.alloc(1000001));
    await expect(pending).rejects.toThrow("transport failure");
    expect(response.destroy).toHaveBeenCalled();
  });
  it("bounds total time and does not leak TLS errors", async () => {
    const pending = postProductionWsfe("body", "action");
    jest.advanceTimersByTime(20000);
    await expect(pending).rejects.toThrow("transport failure");
    expect(req.destroy).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
