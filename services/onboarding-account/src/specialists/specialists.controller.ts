import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SpecialistsService } from './specialists.service';
import { RegisterSpecialistDto } from './dto/register-specialist.dto';
import { EconsultOptInDto } from './dto/econsult-opt-in.dto';

@Controller('specialists')
export class SpecialistsController {
  constructor(private readonly specialists: SpecialistsService) {}

  @Post()
  register(@Body() dto: RegisterSpecialistDto) {
    return this.specialists.register(dto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.specialists.findById(id);
  }

  @Post(':id/econsult-opt-in')
  setEconsultOptIn(@Param('id') id: string, @Body() dto: EconsultOptInDto) {
    return this.specialists.setEconsultOptIn(id, dto.optIn);
  }
}
