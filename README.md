# PREREQ - Project Management SaaS

A comprehensive web-based Project Management SaaS platform built with modern technologies, featuring hierarchical Work Breakdown Structure (WBS), resource management, task relationships, and comprehensive project scheduling capabilities.

## 🚀 Features

### Core Project Management
- **Hierarchical WBS**: Multi-level task breakdown with proper parent-child relationships
- **Task Management**: Create, edit, delete tasks with proper ID generation (A0001, A0002, etc.)
- **Task Relationships**: Finish-to-Start (FS) dependencies with automatic scheduling
- **Resource Management**: Comprehensive resource library with 116+ industry-standard resources
- **Resource Assignment**: Assign resources to tasks with hourly rates and cost calculation
- **Budget Management**: Task-level budgets with rollup calculations

### Advanced Features
- **Auto-scheduling**: Automatic date adjustment based on task dependencies
- **Resource Loading**: Assign multiple resource types (Labour, Equipment, Material, Consulting)
- **Interactive Task Table**: Sortable, filterable table with column visibility controls
- **Task Side Panel**: Comprehensive task details with tabs for Resources, Dependencies, Budget, Status, Notes
- **WBS Code Display**: Toggle between task titles and WBS codes
- **Date Formatting**: Consistent DD-MMM-YYYY date format throughout

### Resource Library
- **Labour Resources** (55 roles): $75-$250/hr
  - Management & Leadership: Project Manager, Program Manager, Scrum Master, etc.
  - Development: Senior Developer, Full Stack Developer, DevOps Engineer, etc.
  - Quality Assurance: QA Engineer, Test Automation Engineer, etc.
  - Architecture & Design: Solutions Architect, Cloud Architect, etc.
- **Equipment Resources** (37 items): $12-$220/hr
  - Computing: Developer Workstations, Laptops, Servers
  - Cloud: AWS EC2, Azure VMs, Database instances
  - Network: Switches, Routers, Firewalls
- **Material Resources** (11 items): $2-$75/hr
  - Software licenses, Documentation, Third-party components
- **Consulting Resources** (13 roles): $180-$400/hr
  - External consultants, Legal advisory, Specialized services

### User Interface
- **Modern Design**: Clean, professional interface with Tailwind CSS
- **Responsive Layout**: Works on desktop and mobile devices
- **Interactive Components**: Drag-and-drop, context menus, modal dialogs
- **Real-time Updates**: Live updates as you make changes
- **Column Management**: Show/hide table columns with persistent settings

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js 18 + NestJS + Prisma + PostgreSQL
- **Infrastructure**: AWS CDK + Lambda + API Gateway + RDS + Cognito
- **Database**: PostgreSQL (local development and AWS RDS)
- **Authentication**: AWS Cognito + JWT tokens

### Project Structure
```
PREREQ/
├── backend/                 # NestJS API server
│   ├── src/
│   │   ├── modules/         # Feature modules
│   │   │   ├── auth/        # Authentication & authorization
│   │   │   ├── projects/    # Project management
│   │   │   ├── tasks/       # Task management & scheduling
│   │   │   ├── relations/   # Task relationships
│   │   │   ├── resources/   # Resource management
│   │   │   ├── resource-assignments/ # Resource assignments
│   │   │   ├── dependencies/ # Task dependencies
│   │   │   ├── portfolio/   # Portfolio aggregation
│   │   │   └── p6-import/   # P6 file import
│   │   └── prisma/          # Database service
│   ├── prisma/              # Database schema & migrations
│   │   ├── schema.prisma    # Database schema
│   │   ├── seed.ts          # Sample project data
│   │   └── seed-resources-only.ts # Resource library only
│   └── samples/             # Sample P6 files
├── frontend/                # React application
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   │   ├── drawers/     # Side panel components
│   │   │   ├── TaskTable.tsx # Main task management table
│   │   │   └── WbsTree.tsx  # WBS hierarchy component
│   │   ├── pages/           # Page components
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/           # Custom React hooks
│   │   └── services/        # API services
└── infrastructure/          # AWS CDK infrastructure
    ├── lib/                 # CDK stack definitions
    └── bin/                 # CDK app entry point
```

## 🛠️ Setup & Development

### Prerequisites
- Node.js 18+
- PostgreSQL (local development)
- AWS CLI configured (for deployment)

### Quick Start (Local Development)

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
   cp env.example .env.dev
   # Edit .env.dev with your local PostgreSQL credentials
   
   # Run database migrations
   npx prisma migrate dev
   
   # Seed database with sample project and resources
   npm run db:seed
   
   # Start development server
   npm run dev
   ```

3. **Frontend Setup** (in a new terminal)
   ```bash
   cd frontend
   npm install
   
   # Set up environment variables
   cp env.example .env
   # Edit .env with your API endpoints (usually http://localhost:3000)
   
   # Start development server
   npm run dev
   ```

4. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - API Documentation: http://localhost:3000/api

5. **Login**
   - Click "Login as Demo User" for development access
   - Default project: "Enterprise Software Implementation" with 27 tasks

### Database Management

#### Seeding Options
```bash
# Full seed (creates sample project + resources) - DESTRUCTIVE
npm run db:seed

# Resources only (preserves existing projects)
npm run db:seed:resources
```

#### Useful Commands
```bash
# View database in browser
npx prisma studio

# Reset database
npx prisma migrate reset

# Generate Prisma client
npx prisma generate
```

## 🎯 Key Features Walkthrough

### 1. Project Management
- Create new projects with client information and budgets
- View project portfolio with aggregated statistics
- Navigate between projects seamlessly

### 2. Task Management
- **Hierarchical Structure**: Create tasks at multiple WBS levels
- **Activity IDs**: Auto-generated sequential IDs (A0001, A0002, etc.)
- **Task Relationships**: Link tasks with Finish-to-Start dependencies
- **Auto-scheduling**: Dates automatically adjust based on dependencies

### 3. Resource Management
- **Comprehensive Library**: 116 industry-standard resources
- **Resource Assignment**: Assign multiple resources to tasks
- **Cost Calculation**: Automatic cost calculation based on resource rates
- **Resource Types**: Labour, Equipment, Material, Consulting

### 4. User Interface
- **Task Table**: Sortable columns with show/hide functionality
- **Side Panel**: Detailed task information with multiple tabs
- **Context Menus**: Right-click for quick actions
- **Column Persistence**: Table settings saved per project

### 5. Development Features
- **Development Login**: Quick access for testing
- **Hot Reload**: Instant updates during development
- **Error Handling**: Graceful error handling and user feedback

## 🔐 Security & Authentication

### Development Mode
- **Dev Login**: Bypass authentication for development
- **Demo Users**: Pre-configured demo accounts
- **Local Database**: Full functionality without AWS dependencies

### Production Mode
- **AWS Cognito**: Secure user authentication
- **JWT Tokens**: Stateless authentication
- **Role-Based Access**: Admin, PM, Viewer roles
- **Project Permissions**: User-project associations

## 🚀 Deployment

### AWS Infrastructure
The application can be deployed to AWS using CDK:

```bash
cd infrastructure
npm install
npx cdk bootstrap
npx cdk deploy
```

This creates:
- **Lambda Functions**: Serverless backend
- **API Gateway**: REST API endpoints
- **RDS PostgreSQL**: Managed database
- **S3 + CloudFront**: Frontend hosting
- **Cognito User Pool**: Authentication service

### Environment Configuration
- **Local**: `.env.dev` files
- **AWS**: Environment variables + Secrets Manager

## 📊 Database Schema

### Core Entities
- **Users**: Authentication and user management
- **Projects**: Top-level project containers with budgets
- **Tasks**: Hierarchical work breakdown structure
- **TaskRelations**: Dependencies between tasks
- **ResourceTypes**: Categories of resources (Labour, Equipment, etc.)
- **Resources**: Individual resources with rates
- **ResourceAssignments**: Resource-to-task assignments

### Key Relationships
- Projects → Tasks (one-to-many)
- Tasks → Tasks (parent-child hierarchy)
- Tasks → TaskRelations (dependencies)
- Tasks → ResourceAssignments → Resources

## 🧪 Testing & Development

### Available Scripts

#### Backend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run db:seed      # Seed database with sample data
npm run db:seed:resources # Add resources only
```

#### Frontend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Development Workflow
1. Start backend server (`npm run dev`)
2. Start frontend server (`npm run dev`)
3. Use "Login as Demo User" for quick access
4. Explore the sample project with 27 tasks
5. Test resource assignments and dependencies

## 📈 Project Status

### ✅ Completed Features
- Hierarchical task management with proper WBS structure
- Comprehensive resource library (116 resources)
- Resource assignment and cost calculation
- Task relationships and auto-scheduling
- Interactive task table with column management
- Task side panel with multiple tabs
- Date formatting and display consistency
- Development authentication system
- Database seeding with sample data

### 🚧 In Progress
- Advanced Gantt chart visualization
- Portfolio dashboard enhancements
- P6 file import functionality
- Advanced reporting features

### 📋 Roadmap
- Real-time collaboration features
- Advanced resource leveling
- Critical path analysis
- Mobile application
- Integration with external tools

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋‍♂️ Support

For support and questions:
- Create an issue on GitHub
- Check the API documentation at `/api`
- Review the development setup guide above

---

**Built with ❤️ using modern web technologies** 