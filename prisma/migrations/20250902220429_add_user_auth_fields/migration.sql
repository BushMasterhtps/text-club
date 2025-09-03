/*
  Warnings:

  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Add password column with temporary default
ALTER TABLE "public"."User" ADD COLUMN "password" TEXT DEFAULT 'temp_password_change_me';

-- Update existing users with a hashed default password
UPDATE "public"."User" SET "password" = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' WHERE "password" = 'temp_password_change_me';

-- Make password column NOT NULL
ALTER TABLE "public"."User" ALTER COLUMN "password" SET NOT NULL;
ALTER TABLE "public"."User" ALTER COLUMN "password" DROP DEFAULT;
