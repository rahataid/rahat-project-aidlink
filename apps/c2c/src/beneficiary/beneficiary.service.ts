import { Inject, Injectable,Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { UUID } from 'crypto';
import {
  AssignBenfGroupToProject,
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
  VerifyWalletDto,
} from '@rahataid/c2c-extensions/dtos/beneficiary';
import { lastValueFrom } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from '@rahataid/c2c-extensions/constants';
import { getOffRampDetails } from '../utils/Xcapit';
import { DisbursementMultisigService } from '../disbursement/disbursement.multisig.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class BeneficiaryService {
  private rsprisma;
  private readonly logger= new Logger(BeneficiaryService?.name)
  constructor(
    protected prisma: PrismaService,
    private disbursement: DisbursementMultisigService,
    @Inject(ProjectContants.ELClient) private readonly client: ClientProxy,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = this.prisma.rsclient;
  }
  async create(dto: CreateBeneficiaryDto) {
    const ben = await this.prisma.beneficiary.create({
      data: dto,
    });
    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATE, {});
    return ben;
  }

  async createMany(dto) {
    const bens = await this.prisma.beneficiary.createMany({ data: dto });
    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATE, {});
    return bens;
  }

  async findAll(dto) {
    const { page, perPage, sort, order } = dto;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const data = await paginate(
      this.prisma.beneficiary,
      {
        where: {
          deletedAt: null,
        },
        orderBy,
        include: {
          DisbursementBeneficiary: {
            include: {
              Disbursement: {
                select: {
                  amount: true,
                },
              },
            },
          },
          GroupedBeneficiaries: {
            where: {
              deletedAt: null,
            },
            include: {
              beneficiaryGroup:
               {
                include: {
                  DisbursementGroup: {
                    include: {
                      Disbursement: {
                        select: {
                          amount: true,
                        },
                      },
                    },
                  },
                  _count: {
                    select: {
                      GroupedBeneficiaries: {
                        where: {
                          deletedAt: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        page,
        perPage,
      }
    );

    const benData = data?.data.map((d:any)=>{
           return {
            uuid:d?.uuid,
            walletAddress:d?.walletAddress,
            createdAt:d?.createdAt,
            updatedAt: d?.updatedAt,
            amount: d?.DisbursementBeneficiary[0]?.amount || d?.GroupedBeneficiaries[0]?.beneficiaryGroup?.DisbursementGroup[0]?.Disbursement?.amount/d?.GroupedBeneficiaries[0]?.beneficiaryGroup?._count

           }
    });
    const projectData = {
     data: benData,
      meta: data?.meta
    }
    return this.client.send(
      { cmd: 'rahat.jobs.beneficiary.list_by_project' },
      projectData
    );
  }

  async findAllBeneficaryPii(data) {
    const projectdata = await this.prisma.beneficiary.findMany({
      where: { type: data?.status },
    });

    const combinedData = data.data
      .filter((item) =>
        projectdata.some((ben) => ben.uuid === item.beneficiaryId)
      )
      .map((item) => {
        const matchedBeneficiary = projectdata.find(
          (ben) => ben.uuid === item.beneficiaryId
        );
        return {
          ...item,
          Beneficiary: {
            ...matchedBeneficiary,
            ...item.Beneficiary,
          },
        };
      });

    return { data: combinedData, meta: data.meta };
  }

  async findByUUID(uuid: UUID) {
    return await this.prisma.beneficiary.findUnique({ where: { uuid } });
  }

  async findOne(payload) {
    try {
      const { uuid } = payload;
      const Bendata = await this.prisma.beneficiary.findUnique({
        where: { uuid },
        include: {
          DisbursementBeneficiary: {
            include: {
              Disbursement: true,
            },
          },
          GroupedBeneficiaries: {
            include: {
              beneficiaryGroup: {
                include: {
                  DisbursementGroup: {
                    include: {
                      Disbursement: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      let totalBeneficiaries = 0;

      if (Bendata.GroupedBeneficiaries?.length > 0) {
        const beneficiaryGroup =
          Bendata.GroupedBeneficiaries[0]?.beneficiaryGroup;
        if (beneficiaryGroup) {
          const groupCount = await this.prisma.groupedBeneficiaries.count({
            where: {
              beneficiaryGroupId: beneficiaryGroup.uuid,
              deletedAt: null,
            },
          });
          totalBeneficiaries = groupCount;
        }
      }
      const projectBendata = {
        uuid: Bendata.uuid,
        walletAddress: Bendata.walletAddress,
        GroupDetails:
          Bendata.GroupedBeneficiaries.length > 0
            ? {
                name: Bendata.GroupedBeneficiaries[0]?.beneficiaryGroup?.name,
                totalBeneficiaries: totalBeneficiaries,
              }
            : null,
        Disbursement:
          Bendata.DisbursementBeneficiary.length > 0
            ? {
                uuid: Bendata.DisbursementBeneficiary[0]?.Disbursement.uuid,
                amount: Bendata.DisbursementBeneficiary[0]?.Disbursement.amount,
                status:
                  Bendata.DisbursementBeneficiary[0]?.Disbursement?.status,
              }
            : Bendata.GroupedBeneficiaries.length > 0
            ? {
                uuid: Bendata.GroupedBeneficiaries[0]?.beneficiaryGroup
                  ?.DisbursementGroup[0]?.Disbursement?.uuid,
                amount:
                  Number(
                    Bendata.GroupedBeneficiaries[0]?.beneficiaryGroup
                      ?.DisbursementGroup[0]?.Disbursement?.amount
                  ) / totalBeneficiaries,
                status:
                  Bendata.GroupedBeneficiaries[0]?.beneficiaryGroup
                    ?.DisbursementGroup[0]?.Disbursement?.status,
              }
            : null,
      };
      return this.client.send(
        {
          cmd: 'rahat.jobs.beneficiary.find_one_beneficiary',
        },
        projectBendata
      );
    } catch (error) {
      this.logger.log(error);
      throw new RpcException('Beneficiary not found.');
    }
    // if (data) return { ...data, ...projectBendata };
    // return projectBendata;
  }

  async update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto) {
    return await this.prisma.beneficiary.update({
      where: { id: id },
      data: { ...updateBeneficiaryDto },
    });
  }

  async verfiyWallet(verfiyWalletDto: VerifyWalletDto) {
    const { walletAddress } = verfiyWalletDto;
    return this.prisma.beneficiary.update({
      where: { walletAddress },
      data: { isVerified: true },
    });
  }

  // *****  beneficiary groups ********** //
  async getOneGroup(uuid: UUID) {
    const benfGroup = await this.prisma.beneficiaryGroups.findUnique({
      where: {
        uuid: uuid,
        deletedAt: null,
      },
      include: {
        DisbursementGroup: {
          include: {
            Disbursement: true,
          },
        },
      },
    });

    const disbursementAmount = benfGroup?.DisbursementGroup?.reduce(
      (sum, dg) => {
        return sum + parseFloat(dg.amount || '0');
      },
      0
    );
    if (!benfGroup) throw new RpcException('Beneficiary group not found.');

    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.get_one_group_by_project' },
        benfGroup.uuid
      )
    );
    return {
      ...response,
      disbursement: disbursementAmount || 0,
    };
  }

  async addGroupToProject(payload: AssignBenfGroupToProject) {
    const { beneficiaryGroupData } = payload;

    const beneficaryGroup = await this.prisma.beneficiaryGroups.create({
      data: {
        uuid: beneficiaryGroupData.uuid,
        name: beneficiaryGroupData.name,
      },
    });
    const groupedBeneficiariesData =
      beneficiaryGroupData?.groupedBeneficiaries?.map((d) => ({
        beneficiaryGroupId: beneficiaryGroupData.uuid,
        beneficiaryId: d?.beneficiaryId,
      }));
    await this.prisma.groupedBeneficiaries.createMany({
      data: groupedBeneficiariesData,
    });

    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATE, {});

    return beneficaryGroup;
  }

  async getAllGroups(dto) {
    const { page, perPage, sort, order, disableSync, uuid, name } = dto;
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;
    let where: any = {
      deletedAt: null,
      ...(name && { name: { contains: name, mode: 'insensitive' } }),
    };

    const benfGroups = await paginate(
      this.prisma.beneficiaryGroups,
      {
        where: where,
        orderBy,
      },
      {
        page,
        perPage,
      }
    );

    return this.client.send(
      { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
      benfGroups
    );
  }

  async getBeneficiaryOffRampDetails(beneficiaryPhone: string, limit: number) {
    try {
      const data = await getOffRampDetails(beneficiaryPhone, limit);
      return data;
    } catch (error) {
      throw new RpcException(
        error?.response?.data?.error || error?.response?.data
      );
    }
  }

  async getBenDisbursementDetails(payload) {
    try {
      const { beneficiaryId } = payload;
      const beneficiary = await this.prisma.beneficiary.findUnique({
        where: { uuid: beneficiaryId },
        include: {
          DisbursementBeneficiary: {
            include: {
              Disbursement: {
                select: {
                  amount: true,
                  status: true,
                  disbursementType: true,
                  transactionHash: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          GroupedBeneficiaries: {
            include: {
              beneficiaryGroup: {
                include: {
                  DisbursementGroup: {
                    include: {
                      Disbursement: {
                        select: {
                          amount: true,
                          status: true,
                          disbursementType: true,
                          transactionHash: true,
                          createdAt: true,
                          updatedAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!beneficiary) {
        throw new RpcException('Beneficiary not found');
      }

      const individualDisbursements = beneficiary.DisbursementBeneficiary.map(
        (db) => ({
          amount: db.amount,
          disbursementAmount: db.Disbursement.amount,
          status: db.Disbursement.status,
          disbursementType: db.Disbursement.disbursementType,
          transactionHash:
            db.transactionHash || db.Disbursement.transactionHash,
          from: db.from,
          createdAt: db.createdAt,
          updatedAt: db.updatedAt,
          disbursementCategory: 'individual',
        })
      );

      const groupDisbursements = beneficiary.GroupedBeneficiaries.flatMap(
        (gb) => {
          return gb.beneficiaryGroup.DisbursementGroup.map((dg) => ({
            disbursementAmount: dg.amount,
            status: dg.Disbursement.status,
            disbursementType: dg.Disbursement.disbursementType,
            transactionHash:
              dg.transactionHash || dg.Disbursement.transactionHash,
            from: dg.from,
            createdAt: dg.createdAt,
            updatedAt: dg.updatedAt,
            disbursementCategory: 'group',
          }));
        }
      );

      const allDisbursements = [
        ...individualDisbursements,
        ...groupDisbursements,
      ];

      const allDates = allDisbursements
        .map((d) => new Date(d.createdAt))
        .filter((date) => !isNaN(date.getTime()));

      const updatedDates = allDisbursements
        .map((d) => new Date(d.updatedAt))
        .filter((date) => !isNaN(date.getTime()));

      const latestDisbursementDate =
        allDates.length > 0
          ? new Date(Math.max(...allDates.map((date) => date.getTime())))
          : null;

      const latestUpdatedDate =
        updatedDates.length > 0
          ? new Date(Math.max(...updatedDates.map((date) => date.getTime())))
          : null;

      // Find the disbursement with the latest disbursement date and get its transaction hash
      const latestDisbursement = allDisbursements.find((d) => {
        const disbursementDate = new Date(d.createdAt);
        return disbursementDate.getTime() === latestDisbursementDate?.getTime();
      });

      const latestDisbursementTransactionHash =
        latestDisbursement?.transactionHash || null;
      const transactiondetails = await this.disbursement.getSafeTransaction(
        latestDisbursementTransactionHash
      );

      return {
        beneficiaryId: beneficiary.uuid,
        walletAddress: beneficiary.walletAddress,
        allDisbursements: allDisbursements.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        latestDisbursementDate,
        latestUpdatedDate,
        latestDisbursementTransactionHash,
        disbursementExecution: transactiondetails?.executionDate,
      };
    } catch (error) {
      this.logger.error('Error in getBenDisbursementDetails:', error);
      throw new RpcException(
        error.message || 'Failed to fetch disbursement details'
      );
    }
  }

  async getBeneficiaryLogs(data: any) {
    try {
      const { benDetails } = data;
      if (benDetails.length === 0) {
        return [];
      }

      const benUUIDs = benDetails
        ?.map((item) => item.beneficiaryId)
        .filter(Boolean);

      if (benUUIDs.length === 0) {
        throw new Error('No valid benUUIDs found in the data array');
      }

      const beneficiaryDetails = await this.prisma.beneficiary.findMany({
        where: {
          uuid: { in: benUUIDs },
        },
        include: {
          DisbursementBeneficiary: {
            include: {
              Disbursement: {
                select: {
                  amount: true,
                },
              },
            },
          },
          GroupedBeneficiaries: {
            include: {
              beneficiaryGroup: {
                include: {
                  DisbursementGroup: {
                    include: {
                      Disbursement: true,
                    },
                  },
                  _count: {
                    select: {
                      GroupedBeneficiaries: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const beneficiaryMap = new Map();
      beneficiaryDetails.forEach((ben) => {
        beneficiaryMap.set(ben.uuid, ben);
      });

      const combinedData = benDetails.map((item) => {
        const benUUID = item.benUUID || item.beneficiaryId || item.uuid;
        const beneficiaryDetails = beneficiaryMap.get(benUUID) as any;

        if (!beneficiaryDetails) {
          this.logger.warn(
            `Beneficiary with UUID ${benUUID} not found in database`
          );
          return {
            ...item,
            beneficiary: null,
            error: `Beneficiary with UUID ${benUUID} not found`,
          };
        }

        const individualDisbursements =
          beneficiaryDetails.DisbursementBeneficiary.reduce(
            (sum, db) => sum + parseFloat(db.amount || '0'),
            0
          );

        const groupDisbursements =
          beneficiaryDetails.GroupedBeneficiaries.reduce((sum, gb) => {
            const groupDisbAmount =
              gb.beneficiaryGroup.DisbursementGroup?.reduce((groupSum, dg) => {
                const totalBeneficiariesInGroup =
                  gb.beneficiaryGroup._count?.GroupedBeneficiaries || 1;
                const individualShare =
                  parseFloat(dg.amount || '0') / totalBeneficiariesInGroup;
                return Number(groupSum) + Number(individualShare);
              }, 0) || 0;
            return sum + groupDisbAmount;
          }, 0);

        const totalDisbursement =
          individualDisbursements > 0
            ? individualDisbursements
            : groupDisbursements;

        const individualDates = beneficiaryDetails.DisbursementBeneficiary.map(
          (db) => new Date(db.createdAt)
        );

        const groupDates = beneficiaryDetails.GroupedBeneficiaries.flatMap(
          (gb) =>
            gb.beneficiaryGroup.DisbursementGroup?.map(
              (dg) => new Date(dg.createdAt)
            ) || []
        );

        const lastDisbursementDate =
          individualDates.length > 0
            ? new Date(
                Math.max(...individualDates.map((date) => date.getTime()))
              )
            : groupDates.length > 0
            ? new Date(Math.max(...groupDates.map((date) => date.getTime())))
            : null;

        return {
          wallet_Address: item?.Beneficiary?.walletAddress,
          name: item?.Beneficiary?.pii.name,
          phone_Number: item?.Beneficiary?.pii.phone,
          total_Disbursement: totalDisbursement.toString(),
          last_DisbursementDate: lastDisbursementDate?.toISOString() || null,
        };
      });
      const finalData = combinedData.filter(
        (item) => Object.keys(item).length > 0
      );
      return finalData;
    } catch (error) {
      throw error;
    }
  }
}
