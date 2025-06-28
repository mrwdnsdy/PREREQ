# PREREQ Development Setup Guide

## 🚀 Quick Start

### Automated Setup (Recommended)

Run the setup script to automatically configure your development environment:

```bash
chmod +x setup-dev-env.sh
./setup-dev-env.sh
```

This script will:
- ✅ Create `.env.dev` files for both backend and frontend
- ✅ Retrieve database password from AWS Secrets Manager
- ✅ Test database connection
- ✅ Install all dependencies
- ✅ Provide next steps

### Manual Setup

If you prefer to set up manually or the script fails:

#### 1. Backend Environment (.env.dev)

Create `backend/.env.dev`:

```bash
# Database (dev stack — public RDS instance)
DATABASE_URL="postgresql://prereq_admin:${DB_PASSWORD}@prereq-prereqdatabase4f1d7173-zkkxkdxj9t9r.crieasgyawhc.us-east-2.rds.amazonaws.com:5432/prereq"
DB_PASSWORD="UFf191KT3QEnXQwINWGL5GtwrIl4_Nqf"

# JWT (dev only — random 32-byte string)
JWT_SECRET="fAnfIVLxgS+RvChF9ahQ43AVF8kvH3p6"

# AWS
AWS_REGION="us-east-2"
COGNITO_USER_POOL_ID="us-east-2_abc123XYZ"
COGNITO_CLIENT_ID="418b9c3d8e7f6g5h4i3j2k1l0m"

PORT=3000
FRONTEND_URL="http://localhost:5173"
```

#### 2. Frontend Environment (.env.dev)

Create `frontend/.env.dev`:

```bash
# API Configuration
VITE_API_URL="http://localhost:3000"

# AWS Configuration
VITE_AWS_REGION="us-east-2"
VITE_COGNITO_USER_POOL_ID="us-east-2_abc123XYZ"
VITE_COGNITO_CLIENT_ID="418b9c3d8e7f6g5h4i3j2k1l0m"

# Environment
VITE_ENV="dev"
```

#### 3. Get Database Password

```bash
# Retrieve from AWS Secrets Manager
export DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --region us-east-2 \
  --secret-id PREREQPrereqDatabaseSecret4-fBtd6oMV2LKr \
  --query 'SecretString' --output text | jq -r .password)

# Or use the known password directly
export DB_PASSWORD="UFf191KT3QEnXQwINWGL5GtwrIl4_Nqf"
```

#### 4. Test Database Connection

```bash
psql "postgresql://prereq_admin:${DB_PASSWORD}@prereq-prereqdatabase4f1d7173-zkkxkdxj9t9r.crieasgyawhc.us-east-2.rds.amazonaws.com:5432/prereq" -c "\l"
```

You should see a list of databases including `prereq`.

## 🏃‍♂️ Running the Application

### Start Backend

```bash
cd backend
npm install  # if not already installed
npm run dev
```

The backend will start on `http://localhost:3000`

### Start Frontend

```bash
cd frontend
npm install  # if not already installed
npm run dev
```

The frontend will start on `http://localhost:5173`

## 🏗️ Infrastructure Overview

### Current Deployment: DEV Environment

- **Database**: Public RDS PostgreSQL (accessible from your IP: `70.30.4.207/32`)
- **API**: Lambda function with unlimited throttling
- **Frontend**: S3 + CloudFront (private bucket with OAI)
- **Secrets**: AWS Secrets Manager for database credentials and JWT
- **Region**: `us-east-2`

### Available Environments

- **DEV**: Public database, no WAF, unlimited API calls
- **STAGE**: Private database + public proxy, WAF enabled, throttled API
- **PROD**: Private database + private proxy, WAF enabled, throttled API, bastion host

## 🔧 Troubleshooting

### Database Connection Issues

1. **Check your IP**: Your current IP (`70.30.4.207/32`) should be whitelisted
2. **Verify credentials**: Ensure the database password is correct
3. **Test connection**: Use the `psql` command above to test directly

### AWS Credentials

Ensure your AWS CLI is configured:

```bash
aws configure list
aws sts get-caller-identity
```

### Environment Variables

- Backend uses `.env.dev` for local development
- Frontend uses `.env.dev` with `VITE_` prefixed variables
- All `.env*` files are gitignored for security

## 🚀 Deployment Commands

### Deploy to Different Environments

```bash
cd infrastructure

# Deploy to dev (default)
cdk deploy

# Deploy to stage
cdk deploy --context env=stage

# Deploy to prod
cdk deploy --context env=prod
```

### Infrastructure Status

```bash
# List stacks
cdk list

# View differences
cdk diff

# Destroy stack (dev only)
cdk destroy
```

## 🔐 Security Notes

- **Database passwords**: Retrieved from AWS Secrets Manager at runtime
- **JWT secrets**: Managed in AWS Secrets Manager with automatic rotation (prod)
- **Environment files**: Never committed to git (`.gitignore` protection)
- **IP whitelisting**: Dev database only accessible from your IP
- **WAF protection**: Enabled for stage/prod environments

## 📝 Development Workflow

1. **Local Development**: Use dev environment with direct database access
2. **Testing**: Deploy to stage environment for integration testing
3. **Production**: Deploy to prod with full security hardening

## 🆘 Getting Help

If you encounter issues:

1. Check the logs: `cdk deploy` output shows deployment status
2. Verify AWS credentials and permissions
3. Ensure your IP is whitelisted for database access
4. Run the setup script again: `./setup-dev-env.sh`

Your PREREQ development environment is now ready! 🎉 