import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { getOffRampDetails, getOffRampSummary } from '../utils/Xcapit';
import { DisbursementMultisigService } from '../disbursement/disbursement.multisig.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class BeneficiaryService {
  private rsprisma;
  private readonly logger = new Logger(BeneficiaryService?.name);
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
    try {
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
                    status: true,
                  },
                },
              },
            },
            GroupedBeneficiaries: {
              where: {
                deletedAt: null,
              },
              include: {
                beneficiaryGroup: {
                  include: {
                    DisbursementGroup: {
                      include: {
                        Disbursement: {
                          select: {
                            amount: true,
                            status: true,
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

      const benData = data?.data.map((d: any) => {
        return {
          uuid: d?.uuid,
          walletAddress: d?.walletAddress,
          createdAt: d?.createdAt,
          updatedAt: d?.updatedAt,
          amount: this.calculateTotalDisbursement(d),
        };
      });

      const projectData = {
        data: benData,
        meta: data?.meta,
      };
      return this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_by_project' },
        projectData
      );
    } catch (error) {
      throw new RpcException('Failed to calculate beneficiary details');
    }
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
    if (!benfGroup) throw new RpcException('Beneficiary group not found.');

    const disbursementAmount = benfGroup?.DisbursementGroup?.reduce(
      (sum, dg) => {
        if (dg.Disbursement?.status === 'COMPLETED') {
          return sum + Number(dg.Disbursement.amount);
        }
        return sum;
      },
      0
    );

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
    try {
      const { page, perPage, sort, order, disableSync, uuid, name } = dto;
      const orderBy: Record<string, 'asc' | 'desc'> = {};
      orderBy[sort] = order;
      const where: any = {
        deletedAt: null,
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
      };

      const benfGroups = (await paginate(
        this.prisma.beneficiaryGroups,
        {
          where: where,
          include: {
            DisbursementGroup: {
              include: {
                Disbursement: true,
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
          orderBy,
        },
        {
          page,
          perPage,
        }
      )) as {
        data: { DisbursementGroup: any[] }[];
      };

      const enrichedData = benfGroups.data.map((group: any) => {
        const totalCompletedAmount = group.DisbursementGroup.reduce(
          (sum, item) => {
            if (item.Disbursement?.status === 'COMPLETED') {
              return sum + Number(item.Disbursement.amount);
            }
            return sum;
          },
          0
        );
        return {
          uuid: group?.uuid,
          updatedAt: group?.updatedAt,
          name: group?.name,
          totalBeneficiaries: group?._count?.GroupedBeneficiaries,
          totalCompletedAmount,
        };
      });

      return {
        ...benfGroups,
        data: enrichedData,
      };
    } catch (error) {
      console.error('Error fetching beneficiary details:', error);
      throw new RpcException(
        'Failed to retrieve beneficiary details. Please try again later.'
      );
    }
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
        latestDisbursementStatus: latestDisbursement?.status,
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
                status: true,
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

      const totalDisbursement =
        this.calculateTotalDisbursement(beneficiaryDetails);

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
          ? new Date(Math.max(...individualDates.map((date) => date.getTime())))
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
  }

  async getOffRampSummary() {
    try {
      const data = await getOffRampSummary();
      const offRamped = data?.filter((d) => {
        return d._id.status == 'SUCCESSFUL';
      });

      const disbursement = await this.prisma.disbursement.findMany({
        where: {
          status: 'COMPLETED',
        },
        select: {
          amount: true,
          id: true,
        },
      });

      const totalDisbursement = disbursement.reduce((sum, d) => {
        return sum + Number(d?.amount || 0);
      }, 0);

      const totalOffRampAmount =
        offRamped?.reduce((sum, d) => {
          return sum + Number(d?.cryptoTotalAmount || 0);
        }, 0) || 0;

      const offRampPercentage =
        totalDisbursement > 0
          ? (totalOffRampAmount / totalDisbursement) * 100
          : 0;

      const remaningOffRampPercentage =
        totalDisbursement > 0
          ? ((totalDisbursement - totalOffRampAmount) / totalDisbursement) * 100
          : 0;

      return {
        offRampedAmount: totalOffRampAmount,
        remaningOffRampPercentage: Number(remaningOffRampPercentage.toFixed(2)),
        offRampPercentage: Number(offRampPercentage.toFixed(2)),
      };
    } catch (error) {
      throw new RpcException(
        error?.response?.data?.error || error?.response?.data
      );
    }
  }

  calculateTotalDisbursement(benfData: any) {
    const totalBenCompletedAmount =
      benfData?.DisbursementBeneficiary.filter(
        (item) => item.Disbursement?.status === 'COMPLETED'
      ).reduce((sum, curr) => sum + Number(curr.amount), 0) || 0;

    const totalGroupCompletedAmount =
      benfData?.GroupedBeneficiaries.reduce((sum, gb) => {
        const groupAmount =
          gb.beneficiaryGroup?.DisbursementGroup.filter(
            (item) => item.Disbursement?.status === 'COMPLETED'
          ).reduce(
            (groupSum, curr) => groupSum + Number(curr.amount || 0),
            0
          ) || 0;
        return sum + groupAmount;
      }, 0) || 0;

    return totalBenCompletedAmount + totalGroupCompletedAmount;
  }
}
