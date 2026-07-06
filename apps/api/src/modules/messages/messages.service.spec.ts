import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, In, Repository } from "typeorm";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import {
  createMockRepository,
  MockRepository,
} from "../../../test/helpers/unit";
import {
  AutomationTrigger,
  Conversation,
  ConversationStatus,
  Message,
  MessageSenderType,
  User,
} from "../../database/entities";
import { ConversationEventsService } from "../../events/conversation-events.service";
import { AttachmentsService } from "../attachments/attachments.service";
import { MessagesService } from "./messages.service";
import { QueryMessagesDto } from "./dto/query-messages.dto";

describe("MessagesService", () => {
  let messagesRepository: MockRepository;
  let conversationsRepository: MockRepository;
  let usersRepository: MockRepository;
  let managerMessageRepo: MockRepository;
  let managerConversationRepo: MockRepository;
  let dataSource: { transaction: jest.Mock };
  let conversationEvents: { emit: jest.Mock };
  let attachmentsService: { linkToMessage: jest.Mock };
  let service: MessagesService;

  const agent: AuthenticatedUser = {
    id: "user-1",
    email: "agent@helio.dev",
    name: "Agent Amy",
  };

  const makeConversation = (
    overrides: Partial<Conversation> = {},
  ): Conversation =>
    ({
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      status: ConversationStatus.OPEN,
      contact: { id: "contact-1", name: "Visitor Vic" },
      ...overrides,
    }) as unknown as Conversation;

  const makeMessage = (overrides: Partial<Message> = {}): Message =>
    ({
      id: "msg-1",
      conversationId: "conv-1",
      senderType: MessageSenderType.USER,
      senderId: "user-1",
      content: "hello",
      messageType: "TEXT",
      metadata: null,
      createdAt: new Date("2026-07-06T10:00:00Z"),
      ...overrides,
    }) as unknown as Message;

  const makeQuery = (overrides: Partial<QueryMessagesDto> = {}) =>
    Object.assign(new QueryMessagesDto(), overrides);

  const makeListQb = (rows: Message[]) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    messagesRepository.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  const encodeCursor = (message: Message): string =>
    Buffer.from(
      JSON.stringify({ t: message.createdAt.toISOString(), id: message.id }),
    ).toString("base64url");

  beforeEach(() => {
    messagesRepository = createMockRepository();
    conversationsRepository = createMockRepository();
    usersRepository = createMockRepository();
    managerMessageRepo = createMockRepository();
    managerConversationRepo = createMockRepository();
    managerMessageRepo.save.mockImplementation(async (entity: unknown) => ({
      ...(entity as Record<string, unknown>),
      id: "msg-1",
      createdAt: new Date("2026-07-06T10:00:00Z"),
    }));
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Message ? managerMessageRepo : managerConversationRepo,
      ),
    };
    dataSource = {
      transaction: jest.fn(
        async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
      ),
    };
    conversationEvents = { emit: jest.fn() };
    attachmentsService = { linkToMessage: jest.fn().mockResolvedValue([]) };
    service = new MessagesService(
      messagesRepository as unknown as Repository<Message>,
      conversationsRepository as unknown as Repository<Conversation>,
      usersRepository as unknown as Repository<User>,
      dataSource as unknown as DataSource,
      conversationEvents as unknown as ConversationEventsService,
      attachmentsService as unknown as AttachmentsService,
    );
  });

  describe("listForConversation", () => {
    it("enforces tenancy: 404 for a conversation outside the workspace", async () => {
      conversationsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listForConversation("ws-1", "conv-other", makeQuery()),
      ).rejects.toThrow(NotFoundException);
      expect(conversationsRepository.findOne).toHaveBeenCalledWith({
        where: { id: "conv-other", workspaceId: "ws-1" },
        relations: { contact: true },
      });
    });

    it("fetches limit+1 rows, returns oldest-first, and emits a cursor when older pages exist", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());
      usersRepository.find.mockResolvedValue([
        { id: "user-1", name: "Agent Amy" },
      ]);
      const newest = makeMessage({
        id: "msg-3",
        createdAt: new Date("2026-07-06T10:03:00Z"),
      });
      const middle = makeMessage({
        id: "msg-2",
        senderType: MessageSenderType.CONTACT,
        senderId: "contact-1",
        createdAt: new Date("2026-07-06T10:02:00Z"),
      });
      const extra = makeMessage({
        id: "msg-1",
        createdAt: new Date("2026-07-06T10:01:00Z"),
      });
      const qb = makeListQb([newest, middle, extra]);

      const result = await service.listForConversation(
        "ws-1",
        "conv-1",
        makeQuery({ limit: 2 }),
      );

      expect(qb.limit).toHaveBeenCalledWith(3);
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result.data.map((m) => m.id)).toEqual(["msg-2", "msg-3"]);
      expect(result.nextCursor).toBe(encodeCursor(middle));
      // Sender names: contact rows use the contact, agent rows the user map.
      expect(result.data[0]?.senderName).toBe("Visitor Vic");
      expect(result.data[1]?.senderName).toBe("Agent Amy");
    });

    it("returns a null cursor when the page is the last one", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());
      usersRepository.find.mockResolvedValue([]);
      makeListQb([makeMessage()]);

      const result = await service.listForConversation(
        "ws-1",
        "conv-1",
        makeQuery({ limit: 50 }),
      );

      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(1);
      // Unknown sender id falls back rather than leaking nulls.
      expect(result.data[0]?.senderName).toBe("Former teammate");
      expect(usersRepository.find).toHaveBeenCalledWith({
        where: { id: In(["user-1"]) },
        select: { id: true, name: true },
      });
    });

    it("applies a valid cursor as a keyset predicate", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());
      const anchor = makeMessage({
        id: "msg-9",
        createdAt: new Date("2026-07-06T09:00:00Z"),
      });
      const qb = makeListQb([]);

      await service.listForConversation(
        "ws-1",
        "conv-1",
        makeQuery({ cursor: encodeCursor(anchor) }),
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        "(m.created_at, m.id) < (:cursorTs, :cursorId)",
        { cursorTs: "2026-07-06T09:00:00.000Z", cursorId: "msg-9" },
      );
    });

    it("rejects a malformed cursor with 400", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());
      makeListQb([]);

      await expect(
        service.listForConversation(
          "ws-1",
          "conv-1",
          makeQuery({ cursor: "not-a-cursor" }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a cursor whose JSON lacks the expected fields", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());
      makeListQb([]);
      const cursor = Buffer.from(JSON.stringify({ nope: 1 })).toString(
        "base64url",
      );

      await expect(
        service.listForConversation("ws-1", "conv-1", makeQuery({ cursor })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createAgentMessage", () => {
    it("persists the message and denormalizes preview/lastMessageAt atomically", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());

      const result = await service.createAgentMessage(agent, "ws-1", "conv-1", {
        content: "Hi   there,\nhow can I help?",
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-1",
          senderType: MessageSenderType.USER,
          senderId: "user-1",
          content: "Hi   there,\nhow can I help?",
        }),
      );
      // Preview collapses whitespace; timestamp comes from the saved row.
      expect(managerConversationRepo.update).toHaveBeenCalledWith("conv-1", {
        lastMessagePreview: "Hi there, how can I help?",
        lastMessageAt: new Date("2026-07-06T10:00:00Z"),
      });
      expect(result.senderName).toBe("Agent Amy");
      expect(conversationEvents.emit).toHaveBeenCalledWith({
        trigger: AutomationTrigger.MESSAGE_SENT,
        workspaceId: "ws-1",
        conversationId: "conv-1",
        message: result,
      });
    });

    it("truncates the preview to 140 characters", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());

      await service.createAgentMessage(agent, "ws-1", "conv-1", {
        content: "x".repeat(500),
      });

      const update = managerConversationRepo.update.mock.calls[0][1] as {
        lastMessagePreview: string;
      };
      expect(update.lastMessagePreview).toHaveLength(140);
    });

    it("reopens a snoozed conversation on new activity", async () => {
      conversationsRepository.findOne.mockResolvedValue(
        makeConversation({ status: ConversationStatus.SNOOZED }),
      );

      await service.createAgentMessage(agent, "ws-1", "conv-1", {
        content: "waking you up",
      });

      expect(managerConversationRepo.update).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({ status: ConversationStatus.OPEN }),
      );
    });

    it("rejects writes into resolved conversations with 409", async () => {
      conversationsRepository.findOne.mockResolvedValue(
        makeConversation({ status: ConversationStatus.RESOLVED }),
      );

      await expect(
        service.createAgentMessage(agent, "ws-1", "conv-1", {
          content: "too late",
        }),
      ).rejects.toThrow(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(conversationEvents.emit).not.toHaveBeenCalled();
    });

    it("rejects messages with neither text nor attachments", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());

      await expect(
        service.createAgentMessage(agent, "ws-1", "conv-1", { content: "" }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("throws 404 when the conversation is not in the workspace", async () => {
      conversationsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createAgentMessage(agent, "ws-other", "conv-1", {
          content: "hi",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("links attachments and builds an attachment preview when there is no text", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());
      attachmentsService.linkToMessage.mockResolvedValue([
        {
          id: "att-1",
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          size: "1024",
        },
        {
          id: "att-2",
          filename: "photo.png",
          mimeType: "image/png",
          size: "2048",
        },
      ]);

      const result = await service.createAgentMessage(agent, "ws-1", "conv-1", {
        content: "",
        attachmentIds: ["att-1", "att-2"],
      });

      expect(attachmentsService.linkToMessage).toHaveBeenCalledWith(
        "ws-1",
        "conv-1",
        "msg-1",
        ["att-1", "att-2"],
        expect.anything(),
      );
      expect(result.metadata).toMatchObject({
        attachments: [
          expect.objectContaining({ id: "att-1", size: 1024 }),
          expect.objectContaining({ id: "att-2", size: 2048 }),
        ],
      });
      expect(managerConversationRepo.update).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({
          lastMessagePreview: "📎 invoice.pdf +1",
        }),
      );
    });
  });

  describe("createContactMessage", () => {
    const visitor = {
      contactId: "contact-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
    };

    it("blocks a visitor from writing into another visitor's thread", async () => {
      conversationsRepository.findOne.mockResolvedValue(
        makeConversation({ contactId: "contact-OTHER" }),
      );

      await expect(
        service.createContactMessage(visitor, { content: "hi" }),
      ).rejects.toThrow(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("creates the message as CONTACT and emits MESSAGE_RECEIVED", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());

      const result = await service.createContactMessage(visitor, {
        content: "help please",
      });

      expect(managerMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          senderType: MessageSenderType.CONTACT,
          senderId: "contact-1",
        }),
      );
      expect(result.senderName).toBe("Visitor Vic");
      expect(conversationEvents.emit).toHaveBeenCalledWith({
        trigger: AutomationTrigger.MESSAGE_RECEIVED,
        workspaceId: "ws-1",
        conversationId: "conv-1",
        message: result,
      });
    });
  });

  describe("createAutomationMessage", () => {
    it("creates an authorless message and does not emit automation events", async () => {
      conversationsRepository.findOne.mockResolvedValue(makeConversation());

      const result = await service.createAutomationMessage(
        "ws-1",
        "conv-1",
        "We're on it!",
      );

      expect(managerMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          senderType: MessageSenderType.USER,
          senderId: null,
        }),
      );
      expect(result.senderName).toBe("Automation");
      expect(conversationEvents.emit).not.toHaveBeenCalled();
    });
  });
});
