#!/bin/bash

# PREREQ AWS Database Seeding Script
# This script helps seed your AWS database with sample data

set -e  # Exit on any error

echo "🚀 PREREQ AWS Database Seeding Script"
echo "====================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    echo ""
    echo "Please create a .env file with your AWS database connection:"
    echo "DATABASE_URL=\"postgresql://username:password@your-aws-rds.region.rds.amazonaws.com:5432/prereq\""
    echo ""
    echo "You can copy from env.example and update the values:"
    echo "cp env.example .env"
    exit 1
fi

# Load environment variables
print_status "Loading environment variables..."
export $(cat .env | grep -v '^#' | xargs)

# Verify DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL not set in .env file"
    exit 1
fi

# Extract database info for display (hide password)
DB_INFO=$(echo $DATABASE_URL | sed 's/:\/\/.*@/:\/\/***@/')
print_status "Database: $DB_INFO"

# Confirm before proceeding
echo ""
print_warning "⚠️  This will CLEAR ALL EXISTING DATA and seed with sample data!"
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_status "Seeding cancelled."
    exit 0
fi

echo ""
print_status "Starting database seeding process..."

# Generate Prisma client (in case schema changed)
print_status "Generating Prisma client..."
npm run prisma:generate

# Run database migrations (ensure schema is up to date)
print_status "Running database migrations..."
npm run prisma:migrate

# Run the seeding script
print_status "Seeding database with sample data..."
npm run db:seed

echo ""
print_status "✅ AWS database seeding completed successfully!"
echo ""
echo "🎯 Next steps:"
echo "  1. Update your frontend .env to point to your AWS backend"
echo "  2. Deploy your backend to AWS (if not already done)"
echo "  3. Test the application with the seeded data"
echo ""
echo "📝 Test credentials:"
echo "  Email: demo@prereq.com"
echo "  Cognito ID: demo-cognito-id-123"
echo ""
echo "💡 Tip: You can run this script again anytime to reset with fresh sample data" 