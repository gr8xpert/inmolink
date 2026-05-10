import { ticketSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit";
import {
  ForbiddenError,
  NotFoundError,
  assignTicket,
  changeTicketStatus,
  createTicket,
  getTicket,
  listTickets,
  replyTicket,
} from "./service";

type TicketsRoutesOpts = { storage: Storage };

export async function ticketRoutes(app: FastifyInstance, opts: TicketsRoutesOpts): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, code: err.code, message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, code: err.code, message: err.message });
    }
    throw err;
  });

  fastify.get(
    "/",
    {
      schema: {
        tags: ["tickets"],
        summary: "List tickets (cursor-paginated)",
        querystring: ticketSchemas.ticketListQuerySchema,
        response: { 200: ticketSchemas.ticketListResponseSchema },
      },
    },
    async (request) => {
      return listTickets(request.requireUser(), request.query);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["tickets"],
        summary: "Get ticket detail (with messages)",
        params: z.object({ id: z.string().min(1) }),
        response: { 200: ticketSchemas.ticketDetailSchema },
      },
    },
    async (request) => {
      return getTicket(request.requireUser(), request.params.id, storage);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["tickets"],
        summary: "Open a new ticket",
        body: ticketSchemas.ticketCreateSchema,
        response: { 200: ticketSchemas.ticketDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      const r = await createTicket(user, request.body, storage);
      return r;
    },
  );

  fastify.post(
    "/:id/reply",
    {
      schema: {
        tags: ["tickets"],
        summary: "Reply to a ticket",
        params: z.object({ id: z.string().min(1) }),
        body: ticketSchemas.ticketReplySchema,
        response: { 200: ticketSchemas.ticketDetailSchema },
      },
    },
    async (request) => {
      return replyTicket(request.requireUser(), request.params.id, request.body, storage);
    },
  );

  fastify.post(
    "/:id/assign",
    {
      schema: {
        tags: ["tickets", "admin"],
        summary: "Assign / unassign (super-admin)",
        params: z.object({ id: z.string().min(1) }),
        body: ticketSchemas.ticketAssignSchema,
        response: { 200: ticketSchemas.ticketDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      const r = await assignTicket(user, request.params.id, request.body.assignedToId, storage);
      await writeAuditLog({
        type: "SUPER_ADMIN_BULK_OPERATION",
        request,
        actorUserId: user.id,
        targetKind: "Ticket",
        targetId: request.params.id,
        metadata: { kind: "TICKET_ASSIGN", assignedToId: request.body.assignedToId },
      });
      return r;
    },
  );

  fastify.post(
    "/:id/status",
    {
      schema: {
        tags: ["tickets", "admin"],
        summary: "Change ticket status (super-admin)",
        params: z.object({ id: z.string().min(1) }),
        body: ticketSchemas.ticketStatusChangeSchema,
        response: { 200: ticketSchemas.ticketDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return changeTicketStatus(user, request.params.id, request.body.status, storage);
    },
  );
}
