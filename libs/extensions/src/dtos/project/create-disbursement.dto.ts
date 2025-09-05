import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { UUID, randomUUID } from 'crypto';
import { DisbursementStatus, DisbursementType,DisbursementTargetType } from '@prisma/client';

export type DisbursementBenefeciaryCreate = {
  amount: string;
  from: string;
  transactionHash: string;
  walletAddress: string;
};

export class CreateDisbursementDto {
  @ApiProperty({
    example: '0x1234567890',
    description: 'Source address for the disbursement',
  })
  @IsString()
  from!: string;

  @ApiProperty({
    example: '100',
    description: 'Total amount for the disbursement',
  })
  @IsString()
  amount!: string;

  @ApiProperty({
    example: '0x1234567890',
    description: 'Transaction hash (optional for draft status)',
    required: false,
  })
  @IsString()
  @IsOptional()
  transactionHash?: string;

  @ApiProperty({
    example: 'DRAFT',
    description: 'Status of the disbursement',
  })
  @IsEnum(DisbursementStatus)
  status!: DisbursementStatus;

  @ApiProperty({
    example: '2021-10-01T00:00:00.000Z',
    description: 'Timestamp for the disbursement',
    required: false,
  })
  @IsString()
  @IsOptional()
  timestamp?: string;

  @ApiProperty({
    example: [
      {
        amount: '100',
        from: '0x1234567890',
        transactionHash: '0x1234567890',
        walletAddress: '0x1234567890',
      },
    ],
    description: 'Array of beneficiaries for individual disbursements',
    required: false,
  })
  @IsArray()
  @IsOptional()
  beneficiaries?: DisbursementBenefeciaryCreate[];

  @ApiProperty({
    example: DisbursementType.MULTISIG,
    description: 'Type of disbursement',
  })
  @IsEnum(DisbursementType)
  type!: DisbursementType;

  @ApiProperty({
    example: DisbursementTargetType.GROUP,
    description: 'Target type for the disbursement (INDIVIDUAL, GROUP, or BOTH)',
  })
  @IsEnum(DisbursementTargetType)
  disbursementType!: DisbursementTargetType;

  @ApiProperty({
    example: 'd0e9d07f-5cde-410f-b018-d862f593e362',
    description: 'Beneficiary group UUID (required for GROUP disbursements)',
    required: false,
  })
  @IsString()
  @IsOptional()
  beneficiaryGroup?: string;

  @ApiPropertyOptional({
    example: 'Fund disbursement for project X',
    description: 'Purpose of the disbursement',
  })
  @IsString()
  @IsOptional()
  details?: string;
}

export class UpdateDisbursementDto {
  id!: number;
  amount!: string;
}

export class DisbursementApprovalsDTO {
  @ApiProperty({
    example: randomUUID(),
  })
  disbursementUUID!: UUID;
}

export class DisbursementTransactionDto {
  @ApiProperty({
    example: randomUUID(),
  })
  disbursementUUID!: UUID;
}

export class CreateSafeTransactionDto {
  @ApiProperty({
    example: '20',
  })
  @IsString()
  amount!: string;
}
