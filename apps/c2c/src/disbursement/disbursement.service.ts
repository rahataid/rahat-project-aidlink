import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  DisbursementStatus,
  DisbursementTargetType,
  DisbursementType,
  Prisma,
} from '@prisma/client';
import { EVENTS } from '@rahataid/c2c-extensions';
import {
  DisbursementApprovalsDTO,
  CreateDisbursementDto,
  UpdateDisbursementDto,
  DisbursementTransactionDto,
  DisbursementBenefeciaryCreate,
  ListDisbursementDto,
} from '@rahataid/c2c-extensions/dtos';
import { ProjectContants } from '@rahataid/sdk';
import { PrismaService, paginator } from '@rumsan/prisma';
import { randomUUID } from 'crypto';
import { handleMicroserviceCall } from '../utils/handleMicroserviceCall';
import { DisbursementMultisigService } from './disbursement.multisig.service';

const paginate = paginator({ perPage: 20 });

@Injectable()
export class DisbursementService {
  private rsprisma;
  private readonly logger = new Logger(DisbursementService?.name);
  constructor(
    protected prisma: PrismaService,
    private multisigDisbursement: DisbursementMultisigService,
    @Inject(ProjectContants.ELClient) private readonly client: ClientProxy,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = this.prisma.rsclient;
  }

  async create(
    createDisbursementDto: CreateDisbursementDto,
    projectId?: string
  ) {
    try {
      const {
        amount,
        beneficiaries,
        from,
        transactionHash,
        status,
        timestamp,
        type,
        details,
        disbursementType,
      } = createDisbursementDto;
      let beneficiarydata = beneficiaries || [];
      let result;

      if (
        createDisbursementDto.disbursementType === DisbursementTargetType.GROUP
      ) {
        if (!createDisbursementDto.beneficiaryGroup) {
          throw new Error(
            'beneficiaryGroup is required when targetType is GROUP'
          );
        }

        const response = await this.prisma.groupedBeneficiaries.findMany({
          where: {
            beneficiaryGroupId: createDisbursementDto.beneficiaryGroup,
          },
          include: {
            beneficiary: true,
          },
        });
        beneficiarydata = response.map((d) => {
          return {
            walletAddress: d.beneficiary.walletAddress,
            from: from,
            transactionHash,
            amount,
          };
        });
      }
      // Create disbursement
      const disbursement = await this.rsprisma.disbursement.create({
        data: {
          uuid: randomUUID(),
          disbursementType: createDisbursementDto.disbursementType,
          status,
          timestamp,
          amount:
            beneficiarydata.length > 0
              ? beneficiarydata
                  .reduce((acc, curr) => acc + parseFloat(curr.amount), 0)
                  .toString()
              : amount,
          transactionHash,
          type,
          details,
        },
      });

      if (
        createDisbursementDto.disbursementType === DisbursementTargetType.GROUP
      ) {
        result = await this.rsprisma.disbursementGroup.upsert({
          where: {
            disbursementId_beneficiaryGroup: {
              disbursementId: disbursement.id,
              beneficiaryGroup: createDisbursementDto.beneficiaryGroup,
            },
          },
          update: {
            amount:
              beneficiarydata.length > 0
                ? beneficiarydata
                    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0)
                    .toString()
                : amount,
            from,
            transactionHash,
          },
          create: {
            amount,
            from,
            transactionHash,
            Disbursement: {
              connect: { id: disbursement.id },
            },
            BeneficiaryGroup: {
              connect: {
                uuid: createDisbursementDto.beneficiaryGroup,
              },
            },
          },
        });
      }

      // Create or connect beneficiaries to the disbursement
      else if (
        createDisbursementDto.disbursementType ===
        DisbursementTargetType.INDIVIDUAL
      ) {
        if (!beneficiaries || beneficiaries.length === 0) {
          throw new Error(
            'beneficiaries array is required when targetType is INDIVIDUAL'
          );
        }

        result = await Promise.all(
          beneficiaries.map(async (ben: DisbursementBenefeciaryCreate) => {
            const disbursementBeneficiary =
              await this.rsprisma.disbursementBeneficiary.upsert({
                where: {
                  disbursementId_beneficiaryWalletAddress: {
                    disbursementId: disbursement.id,
                    beneficiaryWalletAddress: ben.walletAddress,
                  },
                },
                update: {
                  amount: amount,
                  from,
                  transactionHash,
                },
                create: {
                  amount,
                  from,
                  transactionHash,
                  Disbursement: {
                    connect: { id: disbursement.id },
                  },
                  Beneficiary: {
                    connect: { walletAddress: ben.walletAddress },
                  },
                },
                include: {
                  Beneficiary: true,
                  Disbursement: true,
                },
              });
            // if (
            //   disbursementBeneficiary.Disbursement.type ===
            //   DisbursementType.PROJECT
            // ) {
            //   await handleMicroserviceCall({
            //     client: this.client.send(
            //       {
            //         cmd: 'rahat.jobs.projects.send_disbursement_created_email',
            //       },
            //       {
            //         walletAddress:
            //           disbursementBeneficiary.beneficiaryWalletAddress,
            //         amount: disbursementBeneficiary.amount,
            //       }
            //     ),
            //     onSuccess(response) {
            //       console.log('Email sent', response);
            //       return response;
            //     },
            //     onError(error) {
            //       console.log('Sending email failed: ' + error.message);
            //     },
            //   });
            // }
          })
        );
      }
      this.eventEmitter.emit(EVENTS.DISBURSEMENT_CREATE, {});
      this.eventEmitter.emit(EVENTS.DISBURSEMENT_EMAIL_NOTIFICATION, {
        actionType: 'INITIATED',
        projectId,
        disbursementId: disbursement.uuid,
        disbursementType: disbursement.disbursementType,
        amount: disbursement.amount,
        beneficiariesCount:
          disbursementType === DisbursementTargetType.INDIVIDUAL
            ? beneficiaries?.length
            : disbursementType === DisbursementTargetType.GROUP
            ? beneficiarydata?.length
            : 0,
      });

      return disbursement;
    } catch (error) {
      console.log(error);
      throw error; // Re-throw the error for better debugging
    }
  }

  async findAll(query: ListDisbursementDto) {
    const where: Prisma.DisbursementWhereInput = {};
    if (query?.status) where.status = query?.status;
    if (query?.disbursementType)
      where.disbursementType = query?.disbursementType;
    if (query?.fromDate || query?.toDate) {
      where.createdAt = {};
      if (query?.fromDate) where.createdAt.gte = new Date(query?.fromDate);
      if (query?.toDate) {
        where.createdAt.lte = new Date(query?.toDate);
      }
    }

    const include: Prisma.DisbursementInclude = {
      DisbursementBeneficiary: {
        include: {
          Beneficiary: {
            select: {
              walletAddress: true,
            },
          },
        },
      },
      DisbursementGroup: {
        select: {
          BeneficiaryGroup: {
            select: {
              name: true,
              _count: {
                select: {
                  GroupedBeneficiaries: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          DisbursementBeneficiary: true,
        },
      },
    };
    const orderBy: Prisma.DisbursementOrderByWithRelationInput = {
      createdAt: 'desc',
    };

    const result = await paginate(
      this.rsprisma.disbursement,
      { where, include, orderBy },
      {
        page: query.page || 1,
        perPage: query?.perPage || 20,
      }
    );

    const dataWithTotalCount = result.data.map((disbursement: any) => {
      let totalBeneficiaries = disbursement._count.DisbursementBeneficiary;

      disbursement.DisbursementGroup.forEach((group: any) => {
        totalBeneficiaries +=
          group.BeneficiaryGroup._count.GroupedBeneficiaries;
      });

      return {
        id: disbursement.id,
        uuid: disbursement.uuid,
        disbursementType: disbursement.disbursementType,
        status: disbursement.status,
        type: disbursement.type,
        amount: disbursement.amount,
        transactionHash: disbursement.transactionHash,
        details: disbursement.details,
        timestamp: disbursement.timestamp,
        createdAt: disbursement.createdAt,
        updatedAt: disbursement.updatedAt,
        totalBeneficiaries,
        groupName: disbursement.DisbursementGroup[0]?.BeneficiaryGroup?.name,
        beneficiaryAddresses:
          disbursement.DisbursementBeneficiary?.map(
            (db) => db.Beneficiary?.walletAddress
          ).filter(Boolean) || [],
      };
    });

    return {
      ...result,
      data: dataWithTotalCount,
    };
  }

  async findOne(params: DisbursementTransactionDto) {
    try {
      const disbursement = await this.rsprisma.disbursement.findUnique({
        where: {
          uuid: params.disbursementUUID,
        },
        include: {
          DisbursementBeneficiary: true,
          DisbursementGroup: {
            include: {
              BeneficiaryGroup: {
                include: {
                  GroupedBeneficiaries: {
                    include: {
                      beneficiary: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              DisbursementBeneficiary: true,
            },
          },
        },
      });
      const safeTx = await this.multisigDisbursement.getSafeTransaction(
        disbursement?.transactionHash
      );
      const result = {
        id: disbursement.id,
        uuid: disbursement.uuid,
        disbursementType: disbursement.disbursementType,
        status: disbursement.status,
        type: disbursement.type,
        amount: disbursement.amount,
        transactionHash: disbursement.transactionHash,
        details: disbursement.details,
        timestamp: disbursement.timestamp,
        createdAt: disbursement.createdAt,
        updatedAt: disbursement.updatedAt,
        beneficiaries:
          disbursement.DisbursementBeneficiary?.length > 0
            ? disbursement.DisbursementBeneficiary.map((beneficiary) => ({
                id: beneficiary.id,
                walletAddress: beneficiary.beneficiaryWalletAddress,
                amount: beneficiary.amount,
                from: beneficiary.from,
                transactionHash: beneficiary.transactionHash,
                createdAt: beneficiary.createdAt,
                updatedAt: beneficiary.updatedAt,
              }))
            : disbursement?.DisbursementGroup?.[0]?.BeneficiaryGroup?.GroupedBeneficiaries?.map(
                (ben) => ({
                  id: ben.beneficiary.id,
                  uuid: ben.beneficiary.uuid,
                  walletAddress: ben.beneficiary.walletAddress,
                  createdAt: ben.createdAt,
                  updatedAt: ben.updatedAt,
                })
              ) || [],
        disbursementExecution: safeTx?.executionDate,
      };

      return result;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async update(
    id: number,
    updateDisbursementDto: UpdateDisbursementDto,
    projectId?: string
  ) {
    try {
      const disbursement = await this.rsprisma.disbursement.update({
        where: { id },
        data: { ...updateDisbursementDto },
      });

      // if (
      //   disbursement.type === DisbursementType.MULTISIG &&
      //   disbursement.status === DisbursementStatus.COMPLETED
      // ) {
      //   const beneficiary =
      //     await this.rsprisma.disbursementBeneficiary.findFirst({
      //       where: {
      //         disbursementId: id,
      //       },
      //     });
      //   await handleMicroserviceCall({
      //     client: this.client.send(
      //       { cmd: 'rahat.jobs.projects.send_disbursement_created_email' },
      //       {
      //         walletAddress: beneficiary.beneficiaryWalletAddress,
      //         amount: disbursement.amount,
      //       }
      //     ),
      //     onSuccess(response) {
      //       console.log('Email sent', response);
      //       return response;
      //     },
      //     onError(error) {
      //       console.log('Sending email failed: ' + error.message);
      //     },
      //   });
      // }

      if (disbursement.status === DisbursementStatus.COMPLETED) {
        this.eventEmitter.emit(EVENTS.DISBURSEMENT_EMAIL_NOTIFICATION, {
          actionType: 'EXECUTED',
          projectId,
          disbursementId: disbursement.uuid,
          disbursementType: disbursement.disbursementType,
          amount: disbursement.amount,
          beneficiariesCount:
            disbursement.disbursementType === DisbursementTargetType.INDIVIDUAL
              ? disbursement.DisbursementBeneficiary?.length
              : disbursement.disbursementType === DisbursementTargetType.GROUP
              ? disbursement?.DisbursementGroup?.[0]?.BeneficiaryGroup
                  ?.GroupedBeneficiaries?.length
              : 0,
        });
      }

      return disbursement;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async disbursementTransaction(disbursementDto: DisbursementTransactionDto) {
    try {
      const disbursement = await this.rsprisma.disbursement.findUnique({
        where: {
          uuid: disbursementDto.disbursementUUID,
        },
        select: {
          disbursementType: true,
          status: true,
        },
      });

      if (!disbursement) {
        throw new RpcException({
          status: 404,
          message: 'Disbursement not found',
        });
      }

      let result;

      if (disbursement.disbursementType === DisbursementTargetType.INDIVIDUAL) {
        const where: Prisma.DisbursementBeneficiaryWhereInput = {
          Disbursement: {
            uuid: disbursementDto.disbursementUUID,
          },
        };
        const include: Prisma.DisbursementBeneficiaryInclude = {
          Beneficiary: true,
          Disbursement: {
            select: {
              status: true,
            },
          },
        };
        const orderBy: Prisma.DisbursementBeneficiaryOrderByWithAggregationInput =
          {
            createdAt: 'desc',
          };

        const paginatedResult = await paginate(
          this.rsprisma.disbursementBeneficiary,
          { where, include, orderBy },
          {
            page: 1,
            perPage: 20,
          }
        );

        result = {
          data: paginatedResult.data.map((db: any) => ({
            amount: db.amount,
            from: db.from,
            updatedAt: db.updatedAt,
            status: db.Disbursement.status,
            beneficiaryWalletAddress: db.beneficiaryWalletAddress,
          })),
          meta: paginatedResult.meta,
        };
      } 
      else if (
        disbursement.disbursementType === DisbursementTargetType.GROUP
      ) {
        const where: Prisma.DisbursementGroupWhereInput = {
          Disbursement: {
            uuid: disbursementDto.disbursementUUID,
          },
        };
        const include: Prisma.DisbursementGroupInclude = {
          BeneficiaryGroup: {
            include: {
              GroupedBeneficiaries: {
                include: {
                  beneficiary: true,
                },
              },
            },
          },
          Disbursement: {
            select: {
              status: true,
            },
          },
        };
        const orderBy: Prisma.DisbursementGroupOrderByWithAggregationInput = {
          createdAt: 'desc',
        };

        const paginatedResult = await paginate(
          this.rsprisma.disbursementGroup,
          { where, include, orderBy },
          {
            page: 1,
            perPage: 20,
          }
        );
        const transactionDetails: any[] = [];
        paginatedResult.data.forEach((dg: any) => {
          dg.BeneficiaryGroup?.GroupedBeneficiaries?.forEach((gb: any) => {
            transactionDetails.push({
              amount: dg.amount,
              from: dg.from,
              updatedAt: dg.updatedAt,
              status: dg.Disbursement.status,
              beneficiaryWalletAddress: gb.beneficiary?.walletAddress,
            });
          });
        });

        result = {
          data: transactionDetails,
          meta: paginatedResult.meta,
        };
      }
      return result;
    } catch (err) {
      this.logger.error('Error in disbursementTransaction', err);
      throw err;
    }
  }

  async disbursementApprovals(disbursementDto: DisbursementApprovalsDTO) {
    const where: Prisma.DisbursementBeneficiaryWhereInput = {
      Disbursement: {
        uuid: disbursementDto.disbursementUUID,
        status: {
          equals: DisbursementStatus.COMPLETED,
        },
      },
    };
    const include: Prisma.DisbursementBeneficiaryInclude = {
      Beneficiary: true,
      Disbursement: true,
    };

    return paginate(
      this.rsprisma.disbursementBeneficiary,
      { where, include },
      {
        page: 1,
        perPage: 20,
      }
    );
  }

  async disbursementPending() {
    this.logger.log('calculating total draft disbursement');
    return await this.prisma.disbursement.count({
      where: {
        status: 'DRAFT',
      },
    });
  }
}
