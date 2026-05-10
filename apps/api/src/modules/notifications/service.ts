import type { prisma } from "@inmolink/db";
import type { NotificationKind, Prisma } from "@prisma/client";

/**
 * In-app + email-digest notifications (PLAN §11.6).
 *
 * - Each call writes a `Notification` row that powers the dashboard bell feed.
 * - The email-digest worker picks up rows where `emailedAt IS NULL` and respects
 *   the recipient's `UserSettings.emailDigestFrequency`.
 * - `targetKind` + `targetId` are stable pointers (e.g. ViewingRequest id) so
 *   click-through links survive any future payload schema change.
 */

export type CreateNotificationInput = {
  userId: string;
  kind: NotificationKind;
  targetKind?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function createNotification(
  tx: Prisma.TransactionClient | typeof prisma,
  input: CreateNotificationInput,
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      targetKind: input.targetKind ?? null,
      targetId: input.targetId ?? null,
      payload: (input.payload ?? null) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Bulk creator — used when the same event fans out to multiple users
 * (e.g. an agency bulk action). Each row independent so partial failure
 * doesn't lose the rest.
 */
export async function createNotifications(
  tx: Prisma.TransactionClient | typeof prisma,
  inputs: readonly CreateNotificationInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  await tx.notification.createMany({
    data: inputs.map((i) => ({
      userId: i.userId,
      kind: i.kind,
      targetKind: i.targetKind ?? null,
      targetId: i.targetId ?? null,
      payload: (i.payload ?? null) as Prisma.InputJsonValue,
    })),
  });
}
