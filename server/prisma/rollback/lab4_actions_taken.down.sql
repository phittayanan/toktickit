-- Undoes 20261030120000_lab4_actions_taken (specification.md §7.4). Run from
-- server/ with:
--   npx prisma db execute --file prisma/rollback/lab4_actions_taken.down.sql
-- Action Taken rows are lost; take a pg_dump first if they must be kept.

BEGIN;

DROP TABLE "ActionTaken";

DROP TYPE "ActionTakenStatus";

DROP INDEX "Ticket_updatedAt_idx";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261030120000_lab4_actions_taken';

COMMIT;
