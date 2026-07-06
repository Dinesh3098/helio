import { ConflictException, NotFoundException } from "@nestjs/common";
import { ILike, Not, Repository } from "typeorm";
import {
  createMockRepository,
  MockRepository,
} from "../../../test/helpers/unit";
import { Contact, Conversation } from "../../database/entities";
import { AuditService } from "../audit/audit.service";
import { ContactsService } from "./contacts.service";
import { QueryContactsDto } from "./dto/query-contacts.dto";

describe("ContactsService", () => {
  let contactsRepository: MockRepository;
  let conversationsRepository: MockRepository;
  let auditService: { record: jest.Mock };
  let service: ContactsService;

  const makeContact = (overrides: Partial<Contact> = {}): Contact =>
    ({
      id: "contact-1",
      workspaceId: "ws-1",
      name: "John Customer",
      email: "john@customer.com",
      phone: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
      ...overrides,
    }) as unknown as Contact;

  const makeQuery = (overrides: Partial<QueryContactsDto> = {}) =>
    Object.assign(new QueryContactsDto(), overrides);

  beforeEach(() => {
    contactsRepository = createMockRepository();
    conversationsRepository = createMockRepository();
    auditService = { record: jest.fn() };
    service = new ContactsService(
      contactsRepository as unknown as Repository<Contact>,
      conversationsRepository as unknown as Repository<Conversation>,
      auditService as unknown as AuditService,
    );
  });

  describe("list", () => {
    it("scopes the query to the workspace and applies pagination", async () => {
      const contact = makeContact();
      contactsRepository.findAndCount.mockResolvedValue([[contact], 1]);

      const result = await service.list(
        "ws-1",
        makeQuery({ page: 2, limit: 10 }),
      );

      expect(contactsRepository.findAndCount).toHaveBeenCalledWith({
        where: { workspaceId: "ws-1" },
        order: { updatedAt: "DESC" },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({
        data: [
          {
            id: "contact-1",
            name: "John Customer",
            email: "john@customer.com",
            phone: null,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
          },
        ],
        total: 1,
        page: 2,
        limit: 10,
      });
    });

    it("keeps workspace scoping on both branches of a search OR", async () => {
      contactsRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.list("ws-1", makeQuery({ search: "john" }));

      const { where } = contactsRepository.findAndCount.mock.calls[0][0];
      expect(where).toEqual([
        { workspaceId: "ws-1", name: ILike("%john%") },
        { workspaceId: "ws-1", email: ILike("%john%") },
      ]);
    });

    it("returns an empty page when nothing matches", async () => {
      contactsRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.list("ws-1", makeQuery());

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("getDetail", () => {
    const makeStatsQb = (
      raw: { total: string; open: string; lastActivity: Date | null } | null,
    ) => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(raw ?? undefined),
      };
      conversationsRepository.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it("throws NotFoundException when the contact is outside the workspace", async () => {
      contactsRepository.findOne.mockResolvedValue(null);

      await expect(service.getDetail("ws-1", "contact-1")).rejects.toThrow(
        NotFoundException,
      );
      expect(contactsRepository.findOne).toHaveBeenCalledWith({
        where: { id: "contact-1", workspaceId: "ws-1" },
      });
    });

    it("returns the contact with parsed conversation stats", async () => {
      contactsRepository.findOne.mockResolvedValue(makeContact());
      const lastActivity = new Date("2026-07-01T12:00:00Z");
      const qb = makeStatsQb({ total: "5", open: "2", lastActivity });

      const result = await service.getDetail("ws-1", "contact-1");

      expect(qb.where).toHaveBeenCalledWith("c.workspace_id = :workspaceId", {
        workspaceId: "ws-1",
      });
      expect(qb.andWhere).toHaveBeenCalledWith("c.contact_id = :contactId", {
        contactId: "contact-1",
      });
      expect(result.totalConversations).toBe(5);
      expect(result.openConversations).toBe(2);
      expect(result.lastConversationAt).toBe(lastActivity);
    });

    it("degrades to zeroed stats when the aggregate returns nothing", async () => {
      contactsRepository.findOne.mockResolvedValue(makeContact());
      makeStatsQb(null);

      const result = await service.getDetail("ws-1", "contact-1");

      expect(result.totalConversations).toBe(0);
      expect(result.openConversations).toBe(0);
      expect(result.lastConversationAt).toBeNull();
    });
  });

  describe("update", () => {
    it("throws NotFoundException for a contact in another workspace", async () => {
      contactsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update("ws-1", "contact-1", { name: "New Name" }),
      ).rejects.toThrow(NotFoundException);
      expect(contactsRepository.save).not.toHaveBeenCalled();
    });

    it("updates name and phone and records an audit entry", async () => {
      contactsRepository.findOne.mockResolvedValue(makeContact());

      const result = await service.update("ws-1", "contact-1", {
        name: "Johnny",
        phone: "+91 98765 43210",
      });

      expect(contactsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Johnny", phone: "+91 98765 43210" }),
      );
      expect(auditService.record).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        resourceType: "contact",
        resourceId: "contact-1",
        action: "contact.updated",
        metadata: { fields: ["name", "phone"] },
      });
      expect(result.name).toBe("Johnny");
      expect(result.phone).toBe("+91 98765 43210");
    });

    it("lowercases the email and checks duplicates within the workspace only", async () => {
      contactsRepository.findOne
        .mockResolvedValueOnce(makeContact())
        .mockResolvedValueOnce(null);

      const result = await service.update("ws-1", "contact-1", {
        email: "John.NEW@Customer.com",
      });

      expect(contactsRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: {
          workspaceId: "ws-1",
          email: "john.new@customer.com",
          id: Not("contact-1"),
        },
      });
      expect(result.email).toBe("john.new@customer.com");
    });

    it("rejects an email already used by another contact in the workspace", async () => {
      contactsRepository.findOne
        .mockResolvedValueOnce(makeContact())
        .mockResolvedValueOnce(makeContact({ id: "contact-2" }));

      await expect(
        service.update("ws-1", "contact-1", { email: "taken@customer.com" }),
      ).rejects.toThrow(ConflictException);
      expect(contactsRepository.save).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it("leaves fields untouched when the dto omits them", async () => {
      contactsRepository.findOne.mockResolvedValue(makeContact());

      const result = await service.update("ws-1", "contact-1", {});

      expect(result.name).toBe("John Customer");
      expect(result.email).toBe("john@customer.com");
      expect(contactsRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("findInWorkspace", () => {
    it("returns the contact when it belongs to the workspace", async () => {
      const contact = makeContact();
      contactsRepository.findOne.mockResolvedValue(contact);

      await expect(service.findInWorkspace("ws-1", "contact-1")).resolves.toBe(
        contact,
      );
    });

    it("throws NotFoundException when missing", async () => {
      contactsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findInWorkspace("ws-1", "contact-404"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
