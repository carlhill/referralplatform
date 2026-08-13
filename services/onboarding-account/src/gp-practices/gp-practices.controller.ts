import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GpPracticesService } from './gp-practices.service';
import { RegisterGpPracticeDto } from './dto/register-gp-practice.dto';
import { AcknowledgeComplianceChecklistDto } from './dto/acknowledge-compliance-checklist.dto';

@Controller('gp-practices')
export class GpPracticesController {
  constructor(private readonly gpPractices: GpPracticesService) {}

  @Post()
  register(@Body() dto: RegisterGpPracticeDto) {
    return this.gpPractices.register(dto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.gpPractices.findById(id);
  }

  @Post(':id/compliance-checklist/acknowledge')
  acknowledgeComplianceChecklist(@Param('id') id: string, @Body() dto: AcknowledgeComplianceChecklistDto) {
    return this.gpPractices.acknowledgeComplianceChecklist(id, dto);
  }
}
