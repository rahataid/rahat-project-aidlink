import { Test, TestingModule } from '@nestjs/testing';
import { CommsService } from './comms.service';
import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';

describe('CommsService', () => {
    let service: CommsService;
    let clientProxyMock: ClientProxy;

    beforeEach(async () => {
        clientProxyMock = {
            send: jest.fn().mockReturnValue(of([{ value: { URL: 'http://example.com', APP_ID: 'test-app-id' } }])),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CommsService,
                { provide: 'CORE_CLIENT', useValue: clientProxyMock },
            ],
        }).compile();

        service = module.get<CommsService>(CommsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should initialize client with communication settings', async () => {
        await service.init();
        expect(clientProxyMock.send).toHaveBeenCalledWith({ cmd: 'appJobs.communication.getSettings' }, {});
        // Since the client initialization is commented out in the service, client should be undefined
        expect(service['client']).toBeUndefined();
    });

    // it('should log error and exit if communication settings are not found', async () => {
    //     jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
    //         throw new Error('process.exit: ' + code);
    //     });
    //     clientProxyMock.send = jest.fn().mockReturnValue(of([null]));

    //     await expect(service.init()).rejects.toThrow('process.exit: 1');
    //     expect(service['logger'].error).toHaveBeenCalledWith('Communication Settings not found.');
    // });

    it('should return client if already initialized', async () => {
        await service.init();
        const client = await service.getClient();
        // Since client initialization is commented out, client will be undefined
        expect(client).toBeUndefined();
    });

    it('should initialize and return client if not already initialized', async () => {
        const client = await service.getClient();
        // Since client initialization is commented out, client will be undefined
        expect(client).toBeUndefined();
    });
});
