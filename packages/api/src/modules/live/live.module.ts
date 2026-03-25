import { Module } from '@nestjs/common';
import { LiveGateway } from './live.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class LiveModule {}
