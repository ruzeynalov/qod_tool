import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DataController],
  providers: [DataService],
})
export class DataModule {}
