/**
 * E2E — Socket.IO voice gateway JWT gate (T-M12-01 / ADR-0005).
 * Namespace: VOICE_WS_NAMESPACE = `/v1/voice`.
 */

import { VOICE_WS_NAMESPACE } from "@aura/contracts";
import { io, type Socket } from "socket.io-client";
import {
  closeTestApp,
  createTestApp,
  registerFreshUser,
  truncateUserScopedData,
  type TestAppContext,
} from "./helpers";

function connectVoice(opts: {
  httpServer: TestAppContext["httpServer"];
  token?: string;
}): Promise<{ socket: Socket; error?: Error }> {
  return new Promise((resolve) => {
    const address = ctxAddress(opts.httpServer);
    const socket = io(`${address}${VOICE_WS_NAMESPACE}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: 4000,
      auth: opts.token ? { token: opts.token } : {},
    });

    const timer = setTimeout(() => {
      socket.close();
      resolve({ socket, error: new Error("connect timeout") });
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timer);
      resolve({ socket });
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      resolve({ socket, error: err });
    });
  });
}

function ctxAddress(httpServer: TestAppContext["httpServer"]): string {
  const addr = httpServer.address();
  if (!addr || typeof addr === "string") {
    throw new Error("httpServer has no TCP address — call app.listen first");
  }
  return `http://127.0.0.1:${addr.port}`;
}

describe("Voice WS auth (e2e)", () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    // Socket.IO client needs a listening server (init alone is not enough).
    await ctx.app.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await truncateUserScopedData(ctx.prisma);
  });

  it("rejects unauthenticated connect to /v1/voice", async () => {
    const { socket, error } = await connectVoice({ httpServer: ctx.httpServer });
    expect(error).toBeDefined();
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it("connects with valid access JWT", async () => {
    const user = await registerFreshUser(ctx.app, "voice");
    const { socket, error } = await connectVoice({
      httpServer: ctx.httpServer,
      token: user.accessToken,
    });
    expect(error).toBeUndefined();
    expect(socket.connected).toBe(true);
    socket.close();
  });
});
