# PREREQ Database Seeding Guide

This guide explains how to seed your PREREQ database with sample data for development and testing purposes.

## 🌱 Overview

The seeding process creates:
- **1 Test User** (`demo@prereq.com`)
- **1 Sample Project** (Software Development Project with $1M budget)
- **22 Hierarchical Tasks** (with proper WBS structure from Level 0-4)
- **13 Task Relationships** (FS, SS dependencies)
- **Resource Loading** (Only on Level 4+ tasks as per requirements)
- **Budget Data** (With proper rollup calculations)

## 🗂️ Sample Data Structure

### Project Hierarchy
```
📊 Sample Software Development Project ($1,000,000)
├── 1. Project Initiation
│   ├── 1.1. Project Charter
│   │   ├── 1.1.1. Business Requirements
│   │   │   ├── 1.1.1.1. Gather Business Requirements (PM, 1.0 hrs/day) 💰
│   │   │   └── 1.1.1.2. Document Requirements (Developer, 0.75 hrs/day) 💰
│   │   └── 1.1.2. Technical Requirements
│   │       ├── 1.1.2.1. System Architecture Review (Architect, 1.0 hrs/day) 💰
│   │       └── 1.1.2.2. Technical Specification (Developer, 1.0 hrs/day) 💰
│   └── 1.2. Stakeholder Analysis
├── 2. Development Phase
│   ├── 2.1. Frontend Development
│   │   ├── 2.1.1.1. UI Component Library (Developer, 1.5 hrs/day) 💰
│   │   └── 2.1.1.2. Page Implementation (Developer, 2.0 hrs/day) 💰
│   └── 2.2. Backend Development
│       ├── 2.2.1.1. API Development (Developer, 1.8 hrs/day) 💰
│       ├── 2.2.1.2. Database Implementation (Developer, 1.5 hrs/day) 💰
│       └── 2.2.1.3. Security Implementation (Architect, 1.25 hrs/day) 💰
├── 3. Testing Phase
│   ├── 3.1.1.1. Unit Testing (QA, 1.0 hrs/day) 💰
│   ├── 3.1.1.2. Integration Testing (QA, 1.2 hrs/day) 💰
│   └── 3.1.1.3. User Acceptance Testing (QA, 0.8 hrs/day) 💰
└── 4. Project Deployment 🏁 (Milestone)
```

💰 = Has resource loading and costs (Level 4+ only)  
🏁 = Milestone task

### Budget Distribution
- **Total Project Budget**: $1,000,000
- **Actual Rollup**: $498,250 (from Level 4+ tasks)
- **Resource Roles**: PM, Developer, Architect, QA
- **Cost Categories**: Labor, Material, Other

## 🚀 Quick Start

### Option 1: Simple Seeding (Current Environment)
```bash
npm run db:seed
```

### Option 2: AWS Seeding with Environment Check
```bash
./scripts/seed-aws.sh
```

## 📋 Prerequisites

### Local Development
1. **Database Running**: PostgreSQL instance
2. **Environment Variables**: Properly configured `.env` file
3. **Dependencies**: `npm install` completed
4. **Prisma Setup**: Schema and client generated

### AWS/Production
1. **AWS RDS**: PostgreSQL database instance
2. **Network Access**: Database accessible from your location
3. **Credentials**: Valid database connection string
4. **Migrations**: Schema deployed to target database

## ⚙️ Environment Setup

### 1. Create Environment File
```bash
cp env.example .env
```

### 2. Configure Database Connection

#### For Local Development:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/prereq"
```

#### For AWS RDS:
```env
DATABASE_URL="postgresql://username:password@your-rds-instance.region.rds.amazonaws.com:5432/prereq"
```

### 3. Other Required Variables
```env
JWT_SECRET="your-super-secret-jwt-key"
AWS_REGION="us-east-1"
COGNITO_USER_POOL_ID="your-pool-id"
COGNITO_CLIENT_ID="your-client-id"
```

## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `npm run db:seed` | Run seeding script |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Deploy migrations |
| `npm run prisma:studio` | Open Prisma Studio |
| `./scripts/seed-aws.sh` | Interactive AWS seeding |

## 📊 Seeding Details

### What Gets Created

#### 1. Test User
- **Email**: `demo@prereq.com`
- **Name**: Demo User
- **Cognito ID**: `demo-cognito-id-123`
- **Role**: Project Admin

#### 2. Project Structure
- **Name**: Sample Software Development Project
- **Client**: ACME Corporation
- **Duration**: January 1, 2024 - December 31, 2024
- **Budget**: $1,000,000
- **Tasks**: 22 tasks with 4-level hierarchy

#### 3. Resource Loading (Level 4+ only)
- **PM**: $180/hr (Project management tasks)
- **Developer**: $150/hr (Development tasks)
- **Architect**: $200/hr (Architecture tasks)
- **QA**: $100/hr (Testing tasks)

#### 4. Task Relationships
- **Finish-to-Start (FS)**: Sequential dependencies
- **Start-to-Start (SS)**: Overlapping work packages
- **Lag Time**: Realistic project delays

### Budget Calculations
The seeding script automatically:
1. **Sets costs** on Level 4+ tasks only
2. **Calculates rollups** for parent tasks (Level 0-3)
3. **Updates project** budget rollup total
4. **Validates hierarchy** and relationships

## 🔄 Re-seeding

### ⚠️ Warning
The seeding process **DESTROYS ALL EXISTING DATA** before creating new sample data.

### Safe Re-seeding
1. **Backup** any important data first
2. **Confirm** you want to proceed
3. **Run** the seeding script
4. **Verify** data integrity

```bash
# Interactive confirmation required
./scripts/seed-aws.sh
```

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Failed
```
Error: P1001: Can't reach database server
```
**Solution**: Check DATABASE_URL and network connectivity

#### Migration Errors
```
Error: Migration failed to apply
```
**Solution**: 
```bash
npm run prisma:migrate:dev
npm run prisma:generate
```

#### Seeding Permission Errors
```
Error: P2003: Foreign key constraint failed
```
**Solution**: Ensure database schema is up to date
```bash
npm run prisma:migrate
npm run db:seed
```

#### Environment Variables Missing
```
Error: Environment variable not found
```
**Solution**: Check your `.env` file has all required variables

### Data Verification

After seeding, verify the data:

1. **Check Prisma Studio**:
   ```bash
   npm run prisma:studio
   ```

2. **Verify Task Count**:
   - Total tasks: 22
   - Level 0 tasks: 4
   - Level 4+ tasks: 12 (with resource loading)

3. **Check Budget Rollup**:
   - Project budget: $1,000,000
   - Calculated rollup: $498,250

4. **Verify Relationships**:
   - Task relationships: 13
   - Types: FS, SS

## 🔐 Security Notes

### Production Considerations
- **Never commit** `.env` files to version control
- **Use strong passwords** for production databases
- **Limit database access** to necessary IPs only
- **Use SSL connections** for AWS RDS
- **Rotate credentials** regularly

### Test Credentials
The seeded test user (`demo@prereq.com`) should **only be used for development/testing**. Remove or disable before production deployment.

## 📖 Further Reading

- [Prisma Seeding Guide](https://www.prisma.io/docs/guides/database/seed-database)
- [AWS RDS Setup](https://docs.aws.amazon.com/rds/latest/userguide/CHAP_PostgreSQL.html)
- [PREREQ WBS Hierarchy Rules](../WBS_HIERARCHY_RULES.md)

---

**Need help?** Check the [Development Guide](../DEVELOPMENT.md) or create an issue in the repository. 