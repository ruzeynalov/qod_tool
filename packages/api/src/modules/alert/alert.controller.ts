import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AlertService } from './alert.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId/alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  getAlertRules(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.alertService.getAlertRules(projectId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  createAlertRule(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CreateAlertRuleDto,
  ) {
    return this.alertService.createAlertRule(projectId, body);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateAlertRule(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAlertRuleDto,
  ) {
    return this.alertService.updateAlertRule(projectId, id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  deleteAlertRule(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertService.deleteAlertRule(projectId, id);
  }

  @Post('evaluate')
  evaluateAlerts(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.alertService.evaluateAlerts(projectId);
  }
}
