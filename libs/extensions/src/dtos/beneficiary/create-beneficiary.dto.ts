import { UUID } from 'crypto';

export class CreateBeneficiaryDto {
  uuid!: UUID;
  walletAddress?: string;
  extras?: any;
}

export interface AssignBenfGroupToProject {
  beneficiaryGroupData: {
    id: number;
    uuid: string;
    name: string;
    groupedBeneficiaries:any[]
  };
}
