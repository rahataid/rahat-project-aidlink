import { PrismaService } from '@rumsan/prisma';
import { ProjectContants } from '@rahataid/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { handleMicroserviceCall } from '../utils/handleMicroserviceCall';
import { count } from 'console';

@Injectable()
export class StatsService {
  constructor(
    private prismaService: PrismaService,
    @Inject(ProjectContants.ELClient) public readonly client: ClientProxy
  ) {
    this.client = client;
  }

  async save(data) {
    data.name = data.name.toUpperCase();
    return this.prismaService.stats.upsert({
      where: { name: data.name },
      update: data,
      create: data,
    });
  }

  findAll() {
    return this.prismaService.stats.findMany();
  }

  findOne(name: string) {
    return this.prismaService.stats.findUnique({
      where: {
        name,
      },
    });
  }

  async calculateBeneficiaryTotal() {
    const beneficiary = await this.prismaService.beneficiary.count({});
    return {
      count: beneficiary,
      id: 'ALL',
    };
  }

  async calculateDisbursementTotal() {
    const disbursements = await this.prismaService.disbursement.findMany({
      select: {
        status: true,
        amount: true,
      },
    });
    const groupedStats = disbursements.reduce((acc, disbursement) => {
      const status = disbursement.status;
      if (!acc[status]) {
        acc[status] = {
          id: status,
          count: 0,
          amount: 0,
        };
      }
      acc[status].count += 1;
      acc[status].amount += parseFloat(disbursement.amount || '0');
      return acc;
    }, {} as Record<string, { id: string; count: number; amount: number }>);

    const result = Object.values(groupedStats);

    return result;
  }

  async calculateAllStats() {
    const [totalDisbursement, totalBen] = await Promise.all([
      this.calculateDisbursementTotal(),
      this.calculateBeneficiaryTotal(),
    ]);

    return {
      totalDisbursement,
      totalBen,
    };
  }

  async saveAllStats() {
    const { totalDisbursement, totalBen } = await this.calculateAllStats();
    await Promise.all([
      this.save({
        name: 'DISBURSEMENT_TOTAL',
        data: totalDisbursement,
      }),
      this.save({
        name: 'BENEFICIARY_TOTAL',
        data: totalBen,
      }),
    ]);

    await handleMicroserviceCall({
      client: this.client.send(
        { cmd: 'rahat.jobs.projects.calculate_stats' },
        {
          projectUUID: process.env.PROJECT_ID,
        }
      ),
      onSuccess(response) {
        console.log('Microservice response', response);
        return response;
      },
      onError(error) {
        throw new RpcException('Microservice call failed: ' + error.message);
      },
    });
  }
}
