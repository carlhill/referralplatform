import { Module } from '@nestjs/common';
import { DirectoryClient } from './directory.client';

@Module({
  providers: [DirectoryClient],
  exports: [DirectoryClient],
})
export class DirectoryClientModule {}
