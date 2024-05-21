/*
  Warnings:

  - You are about to drop the column `isNotified` on the `UserEvent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isNotified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserEvent" DROP COLUMN "isNotified";
