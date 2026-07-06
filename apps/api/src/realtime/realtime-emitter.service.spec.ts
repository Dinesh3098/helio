import type { Server } from "socket.io";
import { RealtimeEmitterService } from "./realtime-emitter.service";
import { SERVER_EVENTS } from "./realtime.events";

describe("RealtimeEmitterService", () => {
  let service: RealtimeEmitterService;
  let operator: { to: jest.Mock; emit: jest.Mock };
  let server: { to: jest.Mock };

  beforeEach(() => {
    service = new RealtimeEmitterService();
    operator = {
      to: jest.fn(),
      emit: jest.fn(),
    };
    operator.to.mockReturnValue(operator);
    server = { to: jest.fn().mockReturnValue(operator) };
  });

  describe("before setServer", () => {
    it("silently drops emits when no server has been attached", () => {
      expect(() =>
        service.emitToConversation(
          "conv-1",
          SERVER_EVENTS.messageCreated,
          { id: "m1" },
          "ws-1",
        ),
      ).not.toThrow();
      expect(server.to).not.toHaveBeenCalled();
      expect(operator.emit).not.toHaveBeenCalled();
    });
  });

  describe("emitToConversation", () => {
    beforeEach(() => {
      service.setServer(server as unknown as Server);
    });

    it("emits to the conversation room only when no workspace is given", () => {
      const payload = { id: "m1" };
      service.emitToConversation(
        "conv-1",
        SERVER_EVENTS.messageCreated,
        payload,
      );

      expect(server.to).toHaveBeenCalledTimes(1);
      expect(server.to).toHaveBeenCalledWith("conversation:conv-1");
      expect(operator.to).not.toHaveBeenCalled();
      expect(operator.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.messageCreated,
        payload,
      );
    });

    it("targets the union of conversation and workspace rooms", () => {
      const payload = { id: "conv-1", status: "RESOLVED" };
      service.emitToConversation(
        "conv-1",
        SERVER_EVENTS.conversationUpdated,
        payload,
        "ws-1",
      );

      expect(server.to).toHaveBeenCalledWith("conversation:conv-1");
      expect(operator.to).toHaveBeenCalledWith("workspace:ws-1");
      expect(operator.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.conversationUpdated,
        payload,
      );
      expect(operator.emit).toHaveBeenCalledTimes(1);
    });

    it("uses the most recently attached server", () => {
      const laterOperator = { to: jest.fn(), emit: jest.fn() };
      laterOperator.to.mockReturnValue(laterOperator);
      const laterServer = { to: jest.fn().mockReturnValue(laterOperator) };
      service.setServer(laterServer as unknown as Server);

      service.emitToConversation("conv-9", SERVER_EVENTS.typingStarted, {});

      expect(server.to).not.toHaveBeenCalled();
      expect(laterServer.to).toHaveBeenCalledWith("conversation:conv-9");
      expect(laterOperator.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.typingStarted,
        {},
      );
    });
  });
});
