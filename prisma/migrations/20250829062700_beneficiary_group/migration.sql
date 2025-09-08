-- CreateTable
CREATE TABLE "tbl_grouped_beneficiaries" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "beneficiaryGroupId" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_grouped_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_grouped_beneficiaries_uuid_key" ON "tbl_grouped_beneficiaries"("uuid");

-- CreateIndex
CREATE INDEX "tbl_grouped_beneficiaries_beneficiaryGroupId_idx" ON "tbl_grouped_beneficiaries"("beneficiaryGroupId");

-- CreateIndex
CREATE INDEX "tbl_grouped_beneficiaries_beneficiaryId_idx" ON "tbl_grouped_beneficiaries"("beneficiaryId");

-- CreateIndex
CREATE INDEX "tbl_grouped_beneficiaries_deletedAt_idx" ON "tbl_grouped_beneficiaries"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_grouped_beneficiaries_beneficiaryGroupId_beneficiaryId_key" ON "tbl_grouped_beneficiaries"("beneficiaryGroupId", "beneficiaryId");

-- AddForeignKey
ALTER TABLE "tbl_grouped_beneficiaries" ADD CONSTRAINT "tbl_grouped_beneficiaries_beneficiaryGroupId_fkey" FOREIGN KEY ("beneficiaryGroupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_grouped_beneficiaries" ADD CONSTRAINT "tbl_grouped_beneficiaries_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "tbl_beneficiaries"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
