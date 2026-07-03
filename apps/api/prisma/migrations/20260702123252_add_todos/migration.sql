-- CreateEnum
CREATE TYPE "TodoPriority" AS ENUM ('low', 'normal', 'high');

-- CreateTable
CREATE TABLE "todos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "priority" "TodoPriority" NOT NULL DEFAULT 'normal',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "claimed_by_user_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "calendar_event_id" TEXT,
    "notify_on_due" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "todos_done_due_date_idx" ON "todos"("done", "due_date");

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
