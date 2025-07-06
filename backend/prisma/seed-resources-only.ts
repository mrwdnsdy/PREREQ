import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting resource-only seeding...')

  // Clean up existing resources only (preserve projects and tasks)
  console.log('🧹 Cleaning existing resource data...')
  await prisma.resourceAssignment.deleteMany()
  await prisma.resource.deleteMany()
  await prisma.resourceType.deleteMany()

  // Seed Resource Types
  console.log('🏗️ Seeding comprehensive resource types...');
  const resourceTypes = await Promise.all([
    prisma.resourceType.create({
      data: { name: 'Labour' },
    }),
    prisma.resourceType.create({
      data: { name: 'Equipment' },
    }),
    prisma.resourceType.create({
      data: { name: 'Material' },
    }),
    prisma.resourceType.create({
      data: { name: 'Consulting' },
    }),
  ]);

  console.log('Created resource types:', resourceTypes.map(rt => rt.name));

  // Get resource type references
  const labourType = resourceTypes.find(rt => rt.name === 'Labour')!;
  const equipmentType = resourceTypes.find(rt => rt.name === 'Equipment')!;
  const materialType = resourceTypes.find(rt => rt.name === 'Material')!;
  const consultingType = resourceTypes.find(rt => rt.name === 'Consulting')!;

  // Seed comprehensive industry-standard resources
  console.log('👨‍💼 Seeding industry-standard resources with market rates...');
  
  const labourResources = [
    // Management & Leadership
    { name: 'Project Manager', rate: 180.0 },
    { name: 'Program Manager', rate: 220.0 },
    { name: 'Portfolio Manager', rate: 250.0 },
    { name: 'Scrum Master', rate: 160.0 },
    { name: 'Product Owner', rate: 170.0 },
    { name: 'Team Lead', rate: 190.0 },
    
    // Business Analysis & Strategy
    { name: 'Business Analyst', rate: 140.0 },
    { name: 'Senior Business Analyst', rate: 170.0 },
    { name: 'Business Process Analyst', rate: 130.0 },
    { name: 'Requirements Analyst', rate: 135.0 },
    { name: 'Systems Analyst', rate: 145.0 },
    { name: 'Data Analyst', rate: 125.0 },
    
    // Architecture & Design
    { name: 'Solutions Architect', rate: 220.0 },
    { name: 'Enterprise Architect', rate: 240.0 },
    { name: 'Technical Architect', rate: 210.0 },
    { name: 'Cloud Architect', rate: 230.0 },
    { name: 'Security Architect', rate: 225.0 },
    { name: 'Data Architect', rate: 200.0 },
    
    // Development
    { name: 'Senior Developer', rate: 160.0 },
    { name: 'Mid-Level Developer', rate: 130.0 },
    { name: 'Junior Developer', rate: 100.0 },
    { name: 'Full Stack Developer', rate: 150.0 },
    { name: 'Frontend Developer', rate: 140.0 },
    { name: 'Backend Developer', rate: 145.0 },
    { name: 'Mobile Developer', rate: 155.0 },
    { name: 'DevOps Engineer', rate: 170.0 },
    { name: 'Site Reliability Engineer', rate: 180.0 },
    
    // Quality Assurance
    { name: 'QA Engineer', rate: 110.0 },
    { name: 'Senior QA Engineer', rate: 140.0 },
    { name: 'Test Automation Engineer', rate: 135.0 },
    { name: 'Performance Test Engineer', rate: 145.0 },
    { name: 'Security Test Engineer', rate: 150.0 },
    { name: 'QA Manager', rate: 165.0 },
    
    // Design & UX
    { name: 'UI/UX Designer', rate: 130.0 },
    { name: 'Senior UI/UX Designer', rate: 160.0 },
    { name: 'Product Designer', rate: 150.0 },
    { name: 'Visual Designer', rate: 120.0 },
    { name: 'User Researcher', rate: 140.0 },
    
    // Database & Data
    { name: 'Database Administrator', rate: 155.0 },
    { name: 'Data Engineer', rate: 165.0 },
    { name: 'Data Scientist', rate: 175.0 },
    { name: 'ETL Developer', rate: 140.0 },
    { name: 'BI Developer', rate: 145.0 },
    
    // Infrastructure & Operations
    { name: 'System Administrator', rate: 120.0 },
    { name: 'Network Administrator', rate: 125.0 },
    { name: 'Cloud Engineer', rate: 160.0 },
    { name: 'Infrastructure Engineer', rate: 150.0 },
    { name: 'Security Engineer', rate: 170.0 },
    
    // Documentation & Communication
    { name: 'Technical Writer', rate: 95.0 },
    { name: 'Documentation Specialist', rate: 85.0 },
    { name: 'Training Specialist', rate: 110.0 },
    { name: 'Change Management Specialist', rate: 140.0 },
    
    // Support & Maintenance
    { name: 'Support Engineer', rate: 105.0 },
    { name: 'Help Desk Technician', rate: 75.0 },
    { name: 'System Support Specialist', rate: 95.0 },
  ];

  const equipmentResources = [
    // Computing Equipment
    { name: 'Developer Workstation', rate: 45.0 },
    { name: 'High-End Laptop', rate: 35.0 },
    { name: 'Standard Laptop', rate: 25.0 },
    { name: 'Desktop Computer', rate: 20.0 },
    { name: 'Mac Pro Workstation', rate: 65.0 },
    { name: 'MacBook Pro', rate: 40.0 },
    { name: 'Gaming/CAD Workstation', rate: 55.0 },
    
    // Servers & Infrastructure
    { name: 'Physical Server', rate: 125.0 },
    { name: 'Virtual Server Instance', rate: 75.0 },
    { name: 'Database Server', rate: 180.0 },
    { name: 'Web Server', rate: 95.0 },
    { name: 'Load Balancer', rate: 150.0 },
    { name: 'Enterprise Server', rate: 220.0 },
    { name: 'Backup Server', rate: 110.0 },
    
    // Cloud Resources
    { name: 'AWS EC2 Instance (Large)', rate: 45.0 },
    { name: 'AWS EC2 Instance (Medium)', rate: 28.0 },
    { name: 'AWS EC2 Instance (Small)', rate: 15.0 },
    { name: 'Azure VM (Standard)', rate: 35.0 },
    { name: 'Google Cloud Compute', rate: 32.0 },
    { name: 'AWS RDS Database', rate: 85.0 },
    { name: 'Azure SQL Database', rate: 90.0 },
    
    // Network Equipment
    { name: 'Network Switch', rate: 25.0 },
    { name: 'Router', rate: 35.0 },
    { name: 'Firewall', rate: 65.0 },
    { name: 'VPN Gateway', rate: 45.0 },
    { name: 'Wireless Access Point', rate: 18.0 },
    { name: 'Network Security Appliance', rate: 85.0 },
    
    // Storage
    { name: 'SAN Storage', rate: 95.0 },
    { name: 'NAS Storage', rate: 45.0 },
    { name: 'Cloud Storage (per TB)', rate: 12.0 },
    { name: 'Backup Storage System', rate: 55.0 },
    { name: 'High-Performance SSD Array', rate: 125.0 },
    
    // Testing Equipment
    { name: 'Performance Testing Tools', rate: 85.0 },
    { name: 'Security Testing Tools', rate: 95.0 },
    { name: 'Mobile Testing Devices', rate: 22.0 },
    { name: 'Automated Testing Framework', rate: 65.0 },
    { name: 'Load Testing Infrastructure', rate: 120.0 },
  ];

  const materialResources = [
    // Software Licenses
    { name: 'Enterprise Software License', rate: 50.0 },
    { name: 'Development Tool License', rate: 15.0 },
    { name: 'Database License', rate: 75.0 },
    { name: 'Operating System License', rate: 25.0 },
    { name: 'Security Software License', rate: 40.0 },
    
    // Documentation & Supplies
    { name: 'Technical Documentation', rate: 5.0 },
    { name: 'Training Materials', rate: 10.0 },
    { name: 'Office Supplies', rate: 2.0 },
    
    // Third-party Components
    { name: 'Third-party API Access', rate: 20.0 },
    { name: 'External Library License', rate: 12.0 },
    { name: 'Code Repository Access', rate: 8.0 },
  ];

  const consultingResources = [
    // External Consultants
    { name: 'Senior IT Consultant', rate: 275.0 },
    { name: 'Management Consultant', rate: 300.0 },
    { name: 'Security Consultant', rate: 285.0 },
    { name: 'Cloud Migration Specialist', rate: 260.0 },
    { name: 'ERP Consultant', rate: 250.0 },
    { name: 'Digital Transformation Consultant', rate: 290.0 },
    
    // Specialized Services
    { name: 'Legal Advisory', rate: 400.0 },
    { name: 'Compliance Specialist', rate: 225.0 },
    { name: 'Audit Services', rate: 200.0 },
    { name: 'Risk Assessment Specialist', rate: 240.0 },
    
    // Training & Knowledge Transfer
    { name: 'Technical Trainer', rate: 180.0 },
    { name: 'Subject Matter Expert', rate: 220.0 },
    { name: 'Industry Expert', rate: 320.0 },
  ];

  // Create all labour resources
  console.log('👨‍💻 Creating labour resources...');
  const createdLabourResources = await Promise.all(
    labourResources.map(resource =>
      prisma.resource.create({
        data: {
          name: resource.name,
          rateFloat: resource.rate,
          typeId: labourType.id,
        },
      })
    )
  );

  // Create all equipment resources
  console.log('🖥️ Creating equipment resources...');
  const createdEquipmentResources = await Promise.all(
    equipmentResources.map(resource =>
      prisma.resource.create({
        data: {
          name: resource.name,
          rateFloat: resource.rate,
          typeId: equipmentType.id,
        },
      })
    )
  );

  // Create all material resources
  console.log('📦 Creating material resources...');
  const createdMaterialResources = await Promise.all(
    materialResources.map(resource =>
      prisma.resource.create({
        data: {
          name: resource.name,
          rateFloat: resource.rate,
          typeId: materialType.id,
        },
      })
    )
  );

  // Create all consulting resources
  console.log('🎯 Creating consulting resources...');
  const createdConsultingResources = await Promise.all(
    consultingResources.map(resource =>
      prisma.resource.create({
        data: {
          name: resource.name,
          rateFloat: resource.rate,
          typeId: consultingType.id,
        },
      })
    )
  );

  const allCreatedResources = [
    ...createdLabourResources,
    ...createdEquipmentResources,
    ...createdMaterialResources,
    ...createdConsultingResources,
  ];

  console.log('📊 Resource Summary:');
  console.log(`   Labour Resources: ${createdLabourResources.length}`);
  console.log(`   Equipment Resources: ${createdEquipmentResources.length}`);
  console.log(`   Material Resources: ${createdMaterialResources.length}`);
  console.log(`   Consulting Resources: ${createdConsultingResources.length}`);
  console.log(`   Total Resources: ${allCreatedResources.length}`);
  console.log('');
  console.log('💰 Rate Ranges:');
  console.log(`   Labour: $${Math.min(...labourResources.map(r => r.rate))}/hr - $${Math.max(...labourResources.map(r => r.rate))}/hr`);
  console.log(`   Equipment: $${Math.min(...equipmentResources.map(r => r.rate))}/hr - $${Math.max(...equipmentResources.map(r => r.rate))}/hr`);
  console.log(`   Materials: $${Math.min(...materialResources.map(r => r.rate))}/hr - $${Math.max(...materialResources.map(r => r.rate))}/hr`);
  console.log(`   Consulting: $${Math.min(...consultingResources.map(r => r.rate))}/hr - $${Math.max(...consultingResources.map(r => r.rate))}/hr`);
  console.log('');
  console.log('🌟 Resource seeding completed successfully!');
  console.log('✅ Your existing projects and tasks have been preserved.');
}

main()
  .catch((e) => {
    console.error('❌ Error during resource seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 