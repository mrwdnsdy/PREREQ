import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { RelationsModule } from './modules/relations/relations.module';
import { P6ImportModule } from './modules/p6-import/p6-import.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { DependenciesModule } from './modules/dependencies/dependencies.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    AuthModule,
    ProjectsModule,
    TasksModule,
    RelationsModule,
    P6ImportModule,
    PortfolioModule,
    DependenciesModule,
  ],
})
export class AppModule {} 