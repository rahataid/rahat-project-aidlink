import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '@rumsan/prisma';
import { SettingsModule } from '@rumsan/settings';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { CampaignModule } from '../campaign/campaign.module';
import { ConfigModule } from '@nestjs/config';
import { DisbursementModule } from '../disbursement/disbursement.module';
import { CommsModule } from '../comms';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommsModule.forRoot(),
    PrismaModule,
    SettingsModule,
    BeneficiaryModule,
    CampaignModule,
    ConfigModule.forRoot({ isGlobal: true }),
    DisbursementModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
