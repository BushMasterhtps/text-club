-- CreateEnum
CREATE TYPE "public"."TaskType" AS ENUM ('TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'STANDALONE_REFUNDS');

-- CreateEnum
CREATE TYPE "public"."WodIvcsSource" AS ENUM ('INVALID_CASH_SALE', 'ORDERS_NOT_DOWNLOADING', 'SO_VS_WEB_DIFFERENCE');

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "amount" DECIMAL(65,30),
ADD COLUMN     "amountToBeRefunded" DECIMAL(65,30),
ADD COLUMN     "completionTime" TIMESTAMP(3),
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerNameNumber" TEXT,
ADD COLUMN     "details" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "emailRequestFor" TEXT,
ADD COLUMN     "netSuiteTotal" DECIMAL(65,30),
ADD COLUMN     "nsVsWebDiscrepancy" DECIMAL(65,30),
ADD COLUMN     "orderDate" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "productSku" TEXT,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "refundAmount" DECIMAL(65,30),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "salesOrderId" TEXT,
ADD COLUMN     "salesforceCaseNumber" TEXT,
ADD COLUMN     "shippingCountry" TEXT,
ADD COLUMN     "shippingState" TEXT,
ADD COLUMN     "taskType" "public"."TaskType" NOT NULL DEFAULT 'TEXT_CLUB',
ADD COLUMN     "timestamp" TIMESTAMP(3),
ADD COLUMN     "verifiedRefund" TEXT,
ADD COLUMN     "warehouseEdgeStatus" TEXT,
ADD COLUMN     "webOrder" TEXT,
ADD COLUMN     "webOrderDifference" DECIMAL(65,30),
ADD COLUMN     "webOrderSubtotal" DECIMAL(65,30),
ADD COLUMN     "webOrderTotal" DECIMAL(65,30),
ADD COLUMN     "webTotal" DECIMAL(65,30),
ADD COLUMN     "webVsNsDifference" DECIMAL(65,30),
ADD COLUMN     "wodIvcsSource" "public"."WodIvcsSource";
