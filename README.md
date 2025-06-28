# PREREQ - Project Management SaaS

A comprehensive web-based Project Management SaaS platform built with modern technologies, featuring hierarchical Work Breakdown Structure (WBS), portfolio management, Primavera-style task relationships, and P6 file import capabilities.

## 🚀 Features

### Core Functionality
- **Hierarchical WBS**: Up to 10 levels of task breakdown
- **Portfolio Management**: Grand-parent roll-up views and aggregation
- **Task Relationships**: Primavera-style relationships (FS, SS, FF, SF) with lag support
- **Milestones**: Project milestone tracking and visualization
- **P6 Import**: Import Primavera P6 files (XER/XML format)

### Views & Visualization
- **Task List View**: Comprehensive task management interface
- **React Flow Canvas**: Interactive project visualization
- **Basic Gantt Chart**: Timeline and dependency visualization
- **Portfolio Dashboard**: High-level project aggregation

### Security & Access Control
- **Role-Based Access Control (RBAC)**: Admin, PM, Viewer roles
- **AWS Cognito Integration**: Secure authentication and user management
- **Project-level Permissions**: Fine-grained access control

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + React Flow
- **Backend**: Node.js 18 + NestJS + Prisma + PostgreSQL
- **Infrastructure**: AWS CDK + Lambda + API Gateway + RDS + Cognito + S3 + CloudFront
- **Database**: PostgreSQL (AWS RDS)
- **Authentication**: AWS Cognito

### Project Structure
```
PREREQ/
├── backend/                 # NestJS API server
│   ├── src/
│   │   ├── modules/         # Feature modules
│   │   │   ├── auth/        # Authentication & authorization
│   │   │   ├── projects/    # Project management
│   │   │   ├── tasks/       # Task management
│   │   │   ├── relations/   # Task relationships
│   │   │   ├── portfolio/   # Portfolio aggregation
│   │   │   └── p6-import/   # P6 file import
│   │   └── prisma/          # Database service
│   ├── prisma/              # Database schema & migrations
│   └── samples/             # Sample P6 files
├── frontend/                # React application
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── contexts/        # React contexts
│   │   └── services/        # API services
└── infrastructure/          # AWS CDK infrastructure
    ├── lib/                 # CDK stack definitions
    └── bin/                 # CDK app entry point
```

## 🛠️ Setup & Development

### Prerequisites
- Node.js 18+
- AWS CLI configured
- Docker (optional, for local PostgreSQL)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/mrwdnsdy/PREREQ.git
   cd PREREQ
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   
   # Set up environment variables
   cp env.example .env
   # Edit .env with your database credentials
   
   # Run database migrations
   npx prisma migrate dev
   
   # Start development server
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   
   # Set up environment variables
   cp env.example .env
   # Edit .env with your API endpoints
   
   # Start development server
   npm run dev
   ```

### AWS Deployment

1. **Infrastructure Setup**
   ```bash
   cd infrastructure
   npm install
   
   # Configure AWS credentials
   aws configure
   
   # Bootstrap CDK (first time only)
   npx cdk bootstrap
   
   # Deploy infrastructure
   npx cdk deploy
   ```

2. **Database Setup**
   The CDK deployment creates:
   - RDS PostgreSQL instance
   - Database credentials in AWS Secrets Manager
   - VPC and security groups
   - Lambda function with database access

3. **Run Migrations on AWS**
   The Lambda function automatically connects to RDS using Secrets Manager and can run Prisma migrations.

## 📊 Database Schema

### Core Entities
- **Projects**: Top-level project containers
- **Tasks**: Individual work items with hierarchical structure
- **Relations**: Task dependencies and relationships
- **Milestones**: Project milestones and key dates
- **Users**: User management and authentication

### Key Features
- Hierarchical task structure (up to 10 levels)
- Flexible task relationships with lag support
- Portfolio roll-up calculations
- Audit trails and timestamps

## 🔐 Security

### Authentication
- AWS Cognito user pools
- JWT token-based authentication
- Role-based access control

### Authorization
- Project-level permissions
- Role hierarchy (Admin > PM > Viewer)
- Resource-level access control

### Data Security
- Database credentials in AWS Secrets Manager
- VPC isolation for database access
- HTTPS-only communication
- CORS configuration

## 🚀 Deployment

### Production Deployment
The application is deployed using AWS CDK with the following services:

- **API Gateway + Lambda**: Serverless backend API
- **RDS PostgreSQL**: Managed database service
- **S3 + CloudFront**: Frontend hosting and CDN
- **AWS Cognito**: User authentication and management
- **Secrets Manager**: Secure credential storage

### Environment Variables
Backend environment variables are managed through:
- Local development: `.env` files
- AWS Lambda: Environment variables + Secrets Manager

## 📝 API Documentation

The API documentation is available via Swagger UI:
- Local: `http://localhost:3000/api`
- Production: `{API_GATEWAY_URL}/api`

### Key Endpoints
- `/auth/*`: Authentication and authorization
- `/projects/*`: Project management
- `/tasks/*`: Task management
- `/relations/*`: Task relationships
- `/portfolio/*`: Portfolio aggregation
- `/p6-import/*`: P6 file import

## 🧪 Testing

```bash
# Backend tests
cd backend
npm run test

# Frontend tests
cd frontend
npm run test
```

## 📦 Deployment Scripts

### Backend
- `npm run build`: Build for production
- `npm run start:prod`: Start production server
- `npm run prisma:migrate`: Run database migrations

### Frontend
- `npm run build`: Build for production
- `npm run preview`: Preview production build

### Infrastructure
- `npx cdk diff`: Preview changes
- `npx cdk deploy`: Deploy to AWS
- `npx cdk destroy`: Remove AWS resources

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in this repository
- Check the API documentation
- Review the deployment logs in AWS CloudWatch

---

**Built with ❤️ using AWS, React, and NestJS** 