import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StatsService } from '../stats/stats.service';
import { EVENTS } from '@rahataid/c2c-extensions';
import { handleMicroserviceCall } from '../utils/handleMicroserviceCall';
import { ClientProxy } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { PrismaService } from '@rumsan/prisma';
@Injectable()
export class ListenersService {
  constructor(
    private readonly statsService: StatsService,
    protected prisma: PrismaService,
    @Inject(ProjectContants.ELClient) private readonly client: ClientProxy
  ) {}

  @OnEvent(EVENTS.DISBURSEMENT_CREATE)
  @OnEvent(EVENTS.BENEFICIARY_CREATE)
  async onStatsUpdate() {
    console.log('********Stats Event triggered*******************');
    await this.statsService.saveAllStats();
  }

  @OnEvent(EVENTS.DISBURSEMENT_EMAIL_NOTIFICATION)
  async sendEmailNotification(data: {
    actionType: 'INITIATED' | 'EXECUTED';
    projectId: string;
    disbursementId: string;
    disbursementType: 'INDIVIDUAL' | 'GROUP';
    amount: string;
    beneficiariesCount: number;
  }) {
    console.log('********Notify Event triggered*******************');
    const BLOCKCHAIN = await this.prisma.setting.findFirst({
      where: {
        name: 'BLOCKCHAIN',
      },
    });
    const network = BLOCKCHAIN.value['CHAINNAME'];
    await handleMicroserviceCall({
      client: this.client.send(
        {
          cmd: 'rahat.jobs.disbursement.send_email_notification',
        },
        {
          ...data,
          network,
        }
      ),
      onSuccess(response) {
        this.logger.log(
          `Email notification in process: ${JSON.stringify(response)}`
        );
        return response;
      },
      onError(error) {
        this.logger.error(`Sending email failed: ${error.message}`);
      },
    });
  }
}
