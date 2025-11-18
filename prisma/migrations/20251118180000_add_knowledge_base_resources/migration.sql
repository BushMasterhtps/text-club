-- CreateTable
CREATE TABLE "EmailMacro" (
    "id" TEXT NOT NULL,
    "macroName" TEXT NOT NULL,
    "macro" TEXT NOT NULL,
    "caseType" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "EmailMacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextClubMacro" (
    "id" TEXT NOT NULL,
    "macroName" TEXT NOT NULL,
    "macroDetails" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "TextClubMacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInquiryQA" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ProductInquiryQA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMacro_macroName_idx" ON "EmailMacro"("macroName");

-- CreateIndex
CREATE INDEX "EmailMacro_brand_idx" ON "EmailMacro"("brand");

-- CreateIndex
CREATE INDEX "EmailMacro_caseType_idx" ON "EmailMacro"("caseType");

-- CreateIndex
CREATE INDEX "TextClubMacro_macroName_idx" ON "TextClubMacro"("macroName");

-- CreateIndex
CREATE INDEX "ProductInquiryQA_brand_idx" ON "ProductInquiryQA"("brand");

-- CreateIndex
CREATE INDEX "ProductInquiryQA_product_idx" ON "ProductInquiryQA"("product");

