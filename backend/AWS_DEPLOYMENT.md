# PREREQ AWS Deployment Guide

## 🚀 Activity ID System - AWS Ready Status

### ✅ Implementation Complete
All Activity ID features are **fully implemented** and ready for AWS deployment:

- **Unique Activity IDs**: A1010, A1020, A1030, etc. (auto-generated)
- **Database Schema**: `activityId` field added with unique constraint
- **Backend Services**: All services generate unique Activity IDs
- **Frontend Display**: Uneditable Activity ID column in TaskTable
- **Data Seeding**: 27 tasks with Activity IDs in Enterprise Software Implementation project

## 📋 AWS Deployment Steps

### 1. Database Setup
```bash
# Apply migrations to AWS RDS PostgreSQL
cd backend
npm run prisma:migrate:deploy
```

### 2. Environment Configuration
Create/update `.env` with AWS credentials:
```env
# AWS RDS Database
DATABASE_URL="postgresql://username:password@your-rds.aws.com:5432/prereq"

# AWS Cognito (if using)
AWS_REGION="us-east-1"
AWS_USER_POOL_ID="your-user-pool-id"
AWS_USER_POOL_CLIENT_ID="your-client-id"

# Other AWS services
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### 3. Seed AWS Database
```bash
# Run the AWS seeding script
cd backend
chmod +x scripts/seed-aws.sh
./scripts/seed-aws.sh
```

### 4. Backend Deployment
```bash
# Build for production
npm run build

# Deploy to AWS (using your preferred method)
# - AWS Elastic Beanstalk
# - AWS Lambda + API Gateway
# - AWS ECS
# - AWS EC2
```

### 5. Frontend Deployment
```bash
# Update frontend environment for AWS backend
echo "VITE_API_BASE_URL=https://your-aws-backend.com/api" > .env.production

# Build for production
npm run build

# Deploy to AWS (using your preferred method)
# - AWS S3 + CloudFront
# - AWS Amplify
# - AWS EC2
```

## 🎯 Activity ID System Features

### Database Level
- **Unique Activity IDs**: Database constraint prevents duplicates
- **Auto-generation**: Sequential numbering starting from A1010
- **Migration Safe**: Existing data gets Activity IDs during migration

### Backend Level
- **TasksService**: Generates Activity IDs for new tasks
- **ProjectsService**: Generates Activity IDs for project root tasks
- **P6ImportService**: Generates Activity IDs for imported P6 tasks
- **Portfolio Service**: Activity IDs included in portfolio views

### Frontend Level
- **TaskTable**: Activity ID column between Task and Type
- **Uneditable Display**: Gray styling, "Auto-generated" placeholder
- **Responsive Design**: Column widths optimized for all screen sizes
- **TypeScript Support**: Full type safety with `activityId: string`

## 📊 Seeded Data (AWS Ready)

The AWS seeding script creates:
- **1 Enterprise Project**: "Enterprise Software Implementation"
- **27 Hierarchical Tasks**: Levels 0-4 with proper WBS structure
- **Unique Activity IDs**: A1010 through A1270
- **8 Level 4+ Tasks**: With resource loading (Business Analyst, Project Manager, etc.)
- **Budget Data**: $82,325 total from Level 4+ resource loading
- **Task Relationships**: 10 Finish-to-Start dependencies
- **1 Test User**: demo@prereq.com

## 🔧 AWS Environment Variables

### Required for Backend
```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your-jwt-secret"
AWS_REGION="us-east-1"
```

### Required for Frontend
```env
VITE_API_BASE_URL="https://your-aws-backend.com"
VITE_AWS_REGION="us-east-1"
VITE_AWS_USER_POOL_ID="your-pool-id"
VITE_AWS_USER_POOL_CLIENT_ID="your-client-id"
```

## ✅ Pre-Deployment Verification

Run these commands to verify everything is ready:

```bash
# Backend build test
cd backend && npm run build
# Should complete with 0 errors

# Frontend build test  
cd frontend && npm run build
# Should complete with 0 errors

# Migration status check
cd backend && npx prisma migrate status
# Should show "Database schema is up to date!"

# Local seeding test
cd backend && npm run db:seed
# Should create 27 tasks with Activity IDs A1010-A1270
```

## 🎉 AWS Deployment Ready!

All Activity ID features are **fully implemented** and **AWS deployment ready**:
- ✅ Database schema with Activity ID field  
- ✅ Unique Activity ID generation system
- ✅ Frontend Activity ID display column
- ✅ Comprehensive seeding data
- ✅ AWS deployment scripts
- ✅ Zero build errors
- ✅ Complete TypeScript support

**Next Step**: Run the AWS deployment commands above to deploy your Activity ID system to production! 