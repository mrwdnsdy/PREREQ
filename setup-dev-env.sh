#!/bin/bash

# PREREQ Development Environment Setup Script
# Run this script to set up your local development environment

set -e

echo "🚀 Setting up PREREQ Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    echo -e "${RED}❌ Please run this script from the PREREQ root directory${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Step 1: Creating backend .env.dev file...${NC}"

# Create backend .env.dev file
cat > backend/.env.dev << 'EOF'
# Database (dev stack — public RDS instance)
DATABASE_URL="postgresql://prereq_admin:${DB_PASSWORD}@prereq-prereqdatabase4f1d7173-zkkxkdxj9t9r.crieasgyawhc.us-east-2.rds.amazonaws.com:5432/prereq"
DB_PASSWORD="<pulled-from-Secrets-Manager>"

# JWT (dev only — random 32-byte string)
JWT_SECRET="fAnfIVLxgS+RvChF9ahQ43AVF8kvH3p6"

# AWS
AWS_REGION="us-east-2"
COGNITO_USER_POOL_ID="us-east-2_abc123XYZ"
COGNITO_CLIENT_ID="418b9c3d8e7f6g5h4i3j2k1l0m"

PORT=3000
FRONTEND_URL="http://localhost:5173"
EOF

echo -e "${GREEN}✅ Created backend/.env.dev${NC}"

echo -e "${BLUE}📋 Step 2: Creating frontend .env.dev file...${NC}"

# Create frontend .env.dev file
cat > frontend/.env.dev << 'EOF'
# API Configuration
VITE_API_URL="http://localhost:3000"

# AWS Configuration
VITE_AWS_REGION="us-east-2"
VITE_COGNITO_USER_POOL_ID="us-east-2_abc123XYZ"
VITE_COGNITO_CLIENT_ID="418b9c3d8e7f6g5h4i3j2k1l0m"

# Environment
VITE_ENV="dev"
EOF

echo -e "${GREEN}✅ Created frontend/.env.dev${NC}"

echo -e "${BLUE}📋 Step 3: Getting database password from AWS Secrets Manager...${NC}"

# Get database password
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --region us-east-2 \
  --secret-id PREREQPrereqDatabaseSecret4-fBtd6oMV2LKr \
  --query 'SecretString' --output text | jq -r .password 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$DB_PASSWORD" ]; then
    # Update the backend .env.dev with actual password
    sed -i.bak "s/<pulled-from-Secrets-Manager>/$DB_PASSWORD/" backend/.env.dev
    rm backend/.env.dev.bak
    echo -e "${GREEN}✅ Updated backend/.env.dev with actual database password${NC}"
else
    echo -e "${YELLOW}⚠️  Could not retrieve database password automatically${NC}"
    echo -e "${YELLOW}   Please run manually:${NC}"
    echo -e "${YELLOW}   export DB_PASSWORD=\$(aws secretsmanager get-secret-value --region us-east-2 --secret-id PREREQPrereqDatabaseSecret4-fBtd6oMV2LKr --query 'SecretString' --output text | jq -r .password)${NC}"
fi

echo -e "${BLUE}📋 Step 4: Testing database connection...${NC}"

if [ -n "$DB_PASSWORD" ]; then
    export DB_PASSWORD
    if psql "postgresql://prereq_admin:${DB_PASSWORD}@prereq-prereqdatabase4f1d7173-zkkxkdxj9t9r.crieasgyawhc.us-east-2.rds.amazonaws.com:5432/prereq" -c "\l" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Database connection successful${NC}"
    else
        echo -e "${YELLOW}⚠️  Database connection failed - please check your IP is whitelisted${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping database test - no password available${NC}"
fi

echo -e "${BLUE}📋 Step 5: Installing dependencies...${NC}"

# Install backend dependencies
if [ -d "backend/node_modules" ]; then
    echo -e "${GREEN}✅ Backend dependencies already installed${NC}"
else
    echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
    cd backend && npm install && cd ..
    echo -e "${GREEN}✅ Backend dependencies installed${NC}"
fi

echo -e "${BLUE}📋 Step 6: Setting up Prisma database...${NC}"

# Generate Prisma client and sync database
cd backend
if npx prisma generate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Prisma client generated${NC}"
else
    echo -e "${RED}❌ Failed to generate Prisma client${NC}"
fi

if npx prisma db push > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database schema synchronized${NC}"
else
    echo -e "${YELLOW}⚠️  Database schema sync failed - check connection${NC}"
fi
cd ..

# Install frontend dependencies
echo -e "${BLUE}📋 Step 7: Installing frontend dependencies...${NC}"
if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✅ Frontend dependencies already installed${NC}"
else
    echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
    echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
fi

# Install additional required packages
echo -e "${BLUE}📋 Step 8: Installing additional required packages...${NC}"
cd frontend
npm install @tanstack/react-query axios lucide-react react-router-dom > /dev/null 2>&1
echo -e "${GREEN}✅ Additional packages installed${NC}"
cd ..

echo -e "${GREEN}🎉 Development environment setup complete!${NC}"
echo ""
echo -e "${BLUE}📖 Next steps:${NC}"
echo -e "${YELLOW}1. Start the backend:${NC}"
echo "   cd backend && npm run dev"
echo ""
echo -e "${YELLOW}2. Start the frontend (in another terminal):${NC}"
echo "   cd frontend && npm run dev"
echo ""
echo -e "${YELLOW}3. If you need to manually set the database password:${NC}"
echo "   export DB_PASSWORD=\"UFf191KT3QEnXQwINWGL5GtwrIl4_Nqf\""
echo ""
echo -e "${GREEN}🚀 Your PREREQ development environment is ready!${NC}" 