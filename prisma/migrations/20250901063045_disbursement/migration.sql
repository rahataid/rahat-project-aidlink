-- CreateEnum
CREATE TYPE "DisbursementTargetType" AS ENUM ('NOT_ASSIGNED', 'INDIVIDUAL', 'GROUP', 'BOTH');

-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "details" TEXT,
ADD COLUMN     "disbursementType" "DisbursementTargetType" NOT NULL DEFAULT 'NOT_ASSIGNED';

-- CreateTable
CREATE TABLE "DisbursementGroup" (
    "id" SERIAL NOT NULL,
    "disbursementId" INTEGER NOT NULL,
    "beneficiaryGroup" UUID NOT NULL,
    "from" TEXT,
    "amount" TEXT NOT NULL,
    "transactionHash" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "DisbursementGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementGroup_disbursementId_beneficiaryGroup_key" ON "DisbursementGroup"("disbursementId", "beneficiaryGroup");

-- AddForeignKey
ALTER TABLE "DisbursementGroup" ADD CONSTRAINT "DisbursementGroup_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "Disbursement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementGroup" ADD CONSTRAINT "DisbursementGroup_beneficiaryGroup_fkey" FOREIGN KEY ("beneficiaryGroup") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
