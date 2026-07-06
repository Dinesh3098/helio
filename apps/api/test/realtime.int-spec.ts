import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Socket } from "socket.io-client";
import {
  authHeaders,
  createVisitorSession,
  sendVisitorMessage,
  signupOwner,
} from "./helpers/factories";
import { connectSocket, emitWithAck, waitForEvent } from "./helpers/socket";
import { createListeningTestApp } from "./helpers/test-app";

interface MessagePayload {
  id: string;
  conversationId: string;
  content: string;
  senderType: string;
}

describe("realtime (integration)", () => {
  let app: INestApplication;
  let baseUrl: string;
  const openSockets: Socket[] = [];

  /** Tracked connect — everything opened here is closed in afterEach. */
  async function connect(auth: {
    token?: string;
    visitorToken?: string;
  }): Promise<Socket> {
    const socket = await connectSocket(baseUrl, auth);
    openSockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    ({ app, baseUrl } = await createListeningTestApp());
  });

  afterEach(() => {
    for (const socket of openSockets.splice(0)) {
      socket.disconnect();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe("authentication", () => {
    it("accepts an agent with a valid access token", async () => {
      const owner = await signupOwner(app);
      const socket = await connect({ token: owner.accessToken });
      expect(socket.connected).toBe(true);
    });

    it("accepts a visitor with a valid visitor token", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const socket = await connect({ visitorToken: visitor.visitorToken });
      expect(socket.connected).toBe(true);
    });

    it("rejects garbage agent and visitor tokens with connect_error", async () => {
      await expect(
        connectSocket(baseUrl, { token: "garbage" }),
      ).rejects.toThrow(/Unauthorized/);
      await expect(
        connectSocket(baseUrl, { visitorToken: "garbage" }),
      ).rejects.toThrow(/Unauthorized/);
    });

    it("rejects a connection with no credentials at all", async () => {
      await expect(connectSocket(baseUrl, {})).rejects.toThrow(/Unauthorized/);
    });
  });

  describe("rooms", () => {
    it("agent joins their workspace room and gets an acknowledgement event", async () => {
      const owner = await signupOwner(app);
      const socket = await connect({ token: owner.accessToken });
      const joined = waitForEvent<{ workspaceId: string }>(
        socket,
        "workspaceJoined",
      );
      socket.emit("joinWorkspace", { workspaceId: owner.workspaceId });
      expect((await joined).workspaceId).toBe(owner.workspaceId);
    });

    it("agent cannot join a workspace they are not a member of", async () => {
      const owner = await signupOwner(app);
      const stranger = await signupOwner(app);
      const socket = await connect({ token: stranger.accessToken });
      const error = waitForEvent<{ message?: string }>(socket, "messageError");
      socket.emit("joinWorkspace", { workspaceId: owner.workspaceId });
      const payload = await error;
      expect(JSON.stringify(payload)).toMatch(/not a member/i);
    });

    it("agent joins and leaves a conversation room", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "hello",
      );
      const socket = await connect({ token: owner.accessToken });

      const joined = waitForEvent<{ conversationId: string }>(
        socket,
        "conversationJoined",
      );
      socket.emit("joinConversation", { conversationId });
      expect((await joined).conversationId).toBe(conversationId);

      const left = waitForEvent<{ conversationId: string }>(
        socket,
        "conversationLeft",
      );
      socket.emit("leaveConversation", { conversationId });
      expect((await left).conversationId).toBe(conversationId);
    });

    it("visitor cannot join a foreign conversation", async () => {
      const owner = await signupOwner(app);
      const visitorA = await createVisitorSession(app, owner.workspaceId);
      const visitorB = await createVisitorSession(app, owner.workspaceId);
      const foreign = await sendVisitorMessage(
        app,
        visitorB.visitorToken,
        "someone else's thread",
      );

      const socket = await connect({ visitorToken: visitorA.visitorToken });
      const error = waitForEvent<{ message?: string }>(socket, "messageError");
      socket.emit("joinConversation", {
        conversationId: foreign.conversationId,
      });
      await error; // any WsException is a pass — access was denied
    });

    it("rejects an invalid room payload via the WS validation pipe", async () => {
      const owner = await signupOwner(app);
      const socket = await connect({ token: owner.accessToken });
      const error = waitForEvent<{ message?: string }>(socket, "messageError");
      socket.emit("joinConversation", { conversationId: "not-a-uuid" });
      await error;
    });
  });

  describe("messaging", () => {
    it("visitor socket message is acked and broadcast to the agent room", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );

      const agent = await connect({ token: owner.accessToken });
      const agentJoined = waitForEvent(agent, "conversationJoined");
      agent.emit("joinConversation", { conversationId });
      await agentJoined;

      const visitorSocket = await connect({
        visitorToken: visitor.visitorToken,
      });
      const received = waitForEvent<MessagePayload>(agent, "messageCreated");
      const ack = await emitWithAck<{ message?: MessagePayload }>(
        visitorSocket,
        "sendMessage",
        { conversationId, content: "hello over the wire" },
      );

      expect(ack.message?.content).toBe("hello over the wire");
      const broadcast = await received;
      expect(broadcast.id).toBe(ack.message?.id);
      expect(broadcast.senderType).toBe("CONTACT");
    });

    it("agent reply reaches the visitor socket", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );

      const visitorSocket = await connect({
        visitorToken: visitor.visitorToken,
      });
      const visitorJoined = waitForEvent(visitorSocket, "conversationJoined");
      visitorSocket.emit("joinConversation", { conversationId });
      await visitorJoined;

      const agent = await connect({ token: owner.accessToken });
      const agentJoined = waitForEvent(agent, "conversationJoined");
      agent.emit("joinConversation", { conversationId });
      await agentJoined;

      const received = waitForEvent<MessagePayload>(
        visitorSocket,
        "messageCreated",
      );
      const ack = await emitWithAck<{ message?: MessagePayload }>(
        agent,
        "sendMessage",
        { conversationId, content: "agent here, how can I help?" },
      );
      expect(ack.message?.senderType).toBe("USER");
      expect((await received).content).toBe("agent here, how can I help?");
    });

    it("REST-sent messages broadcast to sockets in the room (emitter wiring)", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );

      const agent = await connect({ token: owner.accessToken });
      const joined = waitForEvent(agent, "conversationJoined");
      agent.emit("joinConversation", { conversationId });
      await joined;

      const received = waitForEvent<MessagePayload>(agent, "messageCreated");
      await request(app.getHttpServer())
        .post("/widget/messages")
        .set("Authorization", `Bearer ${visitor.visitorToken}`)
        .send({ content: "sent via REST fallback" })
        .expect(201);
      expect((await received).content).toBe("sent via REST fallback");
    });

    it("sendMessage into a foreign conversation is rejected in the ack", async () => {
      const owner = await signupOwner(app);
      const stranger = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );

      const socket = await connect({ token: stranger.accessToken });
      const ack = await emitWithAck<{ error?: string; message?: unknown }>(
        socket,
        "sendMessage",
        { conversationId, content: "cross-tenant socket write" },
      );
      expect(ack.message).toBeUndefined();
      expect(ack.error).toBeDefined();
    });
  });

  describe("typing indicators", () => {
    it("relays typingStarted/typingStopped to the other party", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );

      const agent = await connect({ token: owner.accessToken });
      const agentJoined = waitForEvent(agent, "conversationJoined");
      agent.emit("joinConversation", { conversationId });
      await agentJoined;

      const visitorSocket = await connect({
        visitorToken: visitor.visitorToken,
      });
      const visitorJoined = waitForEvent(visitorSocket, "conversationJoined");
      visitorSocket.emit("joinConversation", { conversationId });
      await visitorJoined;

      const started = waitForEvent<{ conversationId: string }>(
        agent,
        "typingStarted",
      );
      visitorSocket.emit("typingStart", { conversationId });
      expect((await started).conversationId).toBe(conversationId);

      const stopped = waitForEvent<{ conversationId: string }>(
        agent,
        "typingStopped",
      );
      visitorSocket.emit("typingStop", { conversationId });
      expect((await stopped).conversationId).toBe(conversationId);
    });
  });

  describe("rate limiting", () => {
    it("throttles sendMessage beyond 10 events per 10s window", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );
      const socket = await connect({ visitorToken: visitor.visitorToken });

      // The limiter counts attempts (throttle runs before authorization),
      // so 12 rapid sends must produce at least one rate-limit rejection.
      const acks = [];
      for (let i = 0; i < 12; i++) {
        acks.push(
          await emitWithAck<{ error?: string }>(socket, "sendMessage", {
            conversationId,
            content: `burst ${i}`,
          }),
        );
      }
      const rejected = acks.filter((a) => a.error);
      expect(rejected.length).toBeGreaterThanOrEqual(2);
      expect(rejected[0]?.error).toMatch(/too fast|rate|slow/i);
    });
  });

  describe("resolved conversations", () => {
    it("visitor socket send into a resolved conversation is rejected", async () => {
      const owner = await signupOwner(app);
      const visitor = await createVisitorSession(app, owner.workspaceId);
      const { conversationId } = await sendVisitorMessage(
        app,
        visitor.visitorToken,
        "bootstrap",
      );
      await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/resolve`)
        .set(authHeaders(owner.accessToken, owner.workspaceId))
        .expect(200);

      const socket = await connect({ visitorToken: visitor.visitorToken });
      const ack = await emitWithAck<{ error?: string; message?: unknown }>(
        socket,
        "sendMessage",
        { conversationId, content: "are you still there?" },
      );
      // Resolved chat conversations are terminal for the visitor: the
      // widget starts a fresh session instead (see widget tests).
      expect(ack.error).toBeDefined();
      expect(ack.message).toBeUndefined();
    });
  });

  describe("disconnect", () => {
    it("disconnecting is clean and repeatable (registry stays consistent)", async () => {
      const owner = await signupOwner(app);
      const socket = await connect({ token: owner.accessToken });
      socket.disconnect();
      socket.disconnect(); // double disconnect must not throw server-side

      // The server is still healthy afterwards.
      const health = await request(app.getHttpServer()).get("/health");
      expect([200, 503]).toContain(health.status);
      expect(health.body.checks.socket.status).toBe("up");
    });
  });
});
