import { ConnectionRegistryService } from "./connection-registry.service";

describe("ConnectionRegistryService", () => {
  let registry: ConnectionRegistryService;

  beforeEach(() => {
    registry = new ConnectionRegistryService();
  });

  describe("add / isOnline", () => {
    it("reports a user online after their first socket connects", () => {
      registry.add("user-1", "socket-a");
      expect(registry.isOnline("user-1")).toBe(true);
    });

    it("reports users with no sockets as offline", () => {
      expect(registry.isOnline("stranger")).toBe(false);
    });

    it("deduplicates the same socket id added twice", () => {
      registry.add("user-1", "socket-a");
      registry.add("user-1", "socket-a");
      expect(registry.socketCount()).toBe(1);
    });
  });

  describe("multi-tab behavior", () => {
    it("keeps the user online while at least one tab remains", () => {
      registry.add("user-1", "socket-a");
      registry.add("user-1", "socket-b");

      registry.remove("user-1", "socket-a");

      expect(registry.isOnline("user-1")).toBe(true);
      expect(registry.socketCount()).toBe(1);
    });

    it("marks the user offline only after every tab disconnects", () => {
      registry.add("user-1", "socket-a");
      registry.add("user-1", "socket-b");

      registry.remove("user-1", "socket-a");
      registry.remove("user-1", "socket-b");

      expect(registry.isOnline("user-1")).toBe(false);
      expect(registry.onlineUserIds()).toEqual([]);
    });
  });

  describe("remove", () => {
    it("ignores removals for users that were never added", () => {
      expect(() => registry.remove("ghost", "socket-x")).not.toThrow();
      expect(registry.socketCount()).toBe(0);
    });

    it("ignores removal of an unknown socket id without going offline", () => {
      registry.add("user-1", "socket-a");
      registry.remove("user-1", "socket-never-existed");
      expect(registry.isOnline("user-1")).toBe(true);
      expect(registry.socketCount()).toBe(1);
    });
  });

  describe("onlineUserIds", () => {
    it("lists each online user exactly once regardless of tab count", () => {
      registry.add("user-1", "socket-a");
      registry.add("user-1", "socket-b");
      registry.add("user-2", "socket-c");

      expect(registry.onlineUserIds().sort()).toEqual(["user-1", "user-2"]);
    });
  });

  describe("socketCount", () => {
    it("totals sockets across all users", () => {
      registry.add("user-1", "socket-a");
      registry.add("user-1", "socket-b");
      registry.add("user-2", "socket-c");

      expect(registry.socketCount()).toBe(3);
    });

    it("is zero for a fresh registry", () => {
      expect(registry.socketCount()).toBe(0);
    });
  });
});
