import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';


const prisma = new PrismaService();
const prismaClient = new PrismaClient();

const main = async () => {
  try {
    const password = process.env.XCAPIT_USER_PASSWORD;
    await prismaClient.setting.create({
      data: {
        name: 'XCAPIT',
        dataType: 'OBJECT',
        value: {
          BASEURL: 'https://qa.ltw.xcapit.com',
          EMAIL: 'rahat@xcapit.com',
          PASSWORD: password,
        },
        requiredFields: ['BASEURL', 'EMAIL', 'PASSWORD'],
      },
    });
    console.log('xcapit settings created successfully');
  } catch (error) {
    console.error('Error creating setting:', error);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
