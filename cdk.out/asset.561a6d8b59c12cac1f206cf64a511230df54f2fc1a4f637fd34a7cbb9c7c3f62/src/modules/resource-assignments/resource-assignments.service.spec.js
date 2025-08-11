"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const resource_assignments_service_1 = require("./resource-assignments.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const common_1 = require("@nestjs/common");
describe('ResourceAssignmentsService', () => {
    let service;
    let prisma;
    const mockTask = {
        id: 'task-1',
        title: 'Test Task',
        activityId: 'A1010',
        wbsCode: '1.1',
    };
    const mockResourceType = {
        id: 'type-1',
        name: 'Labour',
    };
    const mockResource = {
        id: 'resource-1',
        name: 'Senior Developer',
        rateFloat: 150.0,
        typeId: 'type-1',
        type: mockResourceType,
    };
    const mockAssignment = {
        id: 'assignment-1',
        taskId: 'task-1',
        resourceId: 'resource-1',
        hours: 40,
        resource: mockResource,
        task: mockTask,
    };
    beforeEach(async () => {
        const mockPrisma = {
            task: {
                findUnique: jest.fn(),
            },
            resource: {
                findMany: jest.fn(),
            },
            resourceAssignment: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            $transaction: jest.fn(),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                resource_assignments_service_1.ResourceAssignmentsService,
                {
                    provide: prisma_service_1.PrismaService,
                    useValue: mockPrisma,
                },
            ],
        }).compile();
        service = module.get(resource_assignments_service_1.ResourceAssignmentsService);
        prisma = module.get(prisma_service_1.PrismaService);
        jest.clearAllMocks();
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    describe('createMultipleAssignments', () => {
        const createMultiAssignmentDto = {
            assignments: [
                { resourceId: 'resource-1', hours: 40 },
                { resourceId: 'resource-2', hours: 20 },
            ],
        };
        it('should create multiple assignments successfully', async () => {
            prisma.task.findUnique.mockResolvedValue(mockTask);
            prisma.resource.findMany.mockResolvedValue([
                mockResource,
                { ...mockResource, id: 'resource-2', name: 'Junior Developer' },
            ]);
            prisma.resourceAssignment.findMany.mockResolvedValue([]);
            prisma.$transaction.mockResolvedValue([mockAssignment, { ...mockAssignment, id: 'assignment-2' }]);
            const result = await service.createMultipleAssignments('task-1', createMultiAssignmentDto);
            expect(result).toHaveLength(2);
            expect(prisma.task.findUnique).toHaveBeenCalledWith({ where: { id: 'task-1' } });
            expect(prisma.resource.findMany).toHaveBeenCalledWith({
                where: { id: { in: ['resource-1', 'resource-2'] } },
            });
            expect(prisma.resourceAssignment.findMany).toHaveBeenCalledWith({
                where: { taskId: 'task-1', resourceId: { in: ['resource-1', 'resource-2'] } },
            });
        });
        it('should throw NotFoundException when task does not exist', async () => {
            prisma.task.findUnique.mockResolvedValue(null);
            await expect(service.createMultipleAssignments('invalid-task', createMultiAssignmentDto)).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw NotFoundException when resource does not exist', async () => {
            prisma.task.findUnique.mockResolvedValue(mockTask);
            prisma.resource.findMany.mockResolvedValue([mockResource]);
            await expect(service.createMultipleAssignments('task-1', createMultiAssignmentDto)).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw ConflictException when resource already assigned', async () => {
            prisma.task.findUnique.mockResolvedValue(mockTask);
            prisma.resource.findMany.mockResolvedValue([
                mockResource,
                { ...mockResource, id: 'resource-2', name: 'Junior Developer' },
            ]);
            prisma.resourceAssignment.findMany.mockResolvedValue([mockAssignment]);
            await expect(service.createMultipleAssignments('task-1', createMultiAssignmentDto)).rejects.toThrow(common_1.ConflictException);
        });
    });
    describe('findTaskAssignments', () => {
        it('should return task with assignments', async () => {
            prisma.task.findUnique.mockResolvedValue(mockTask);
            prisma.resourceAssignment.findMany.mockResolvedValue([mockAssignment]);
            const result = await service.findTaskAssignments('task-1');
            expect(result.task).toEqual(mockTask);
            expect(result.assignments).toHaveLength(1);
            expect(prisma.resourceAssignment.findMany).toHaveBeenCalledWith({
                where: { taskId: 'task-1' },
                include: {
                    resource: { include: { type: true } },
                },
                orderBy: [
                    { resource: { type: { name: 'asc' } } },
                    { resource: { name: 'asc' } },
                ],
            });
        });
        it('should throw NotFoundException when task does not exist', async () => {
            prisma.task.findUnique.mockResolvedValue(null);
            await expect(service.findTaskAssignments('invalid-task')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('updateAssignment', () => {
        const updateDto = { hours: 50 };
        it('should update assignment successfully', async () => {
            prisma.resourceAssignment.findUnique.mockResolvedValue(mockAssignment);
            prisma.resourceAssignment.update.mockResolvedValue({ ...mockAssignment, hours: 50 });
            const result = await service.updateAssignment('assignment-1', updateDto);
            expect(result.hours).toBe(50);
            expect(prisma.resourceAssignment.update).toHaveBeenCalledWith({
                where: { id: 'assignment-1' },
                data: updateDto,
                include: {
                    resource: { include: { type: true } },
                    task: { select: { id: true, title: true, activityId: true, wbsCode: true } },
                },
            });
        });
        it('should throw NotFoundException when assignment does not exist', async () => {
            prisma.resourceAssignment.findUnique.mockResolvedValue(null);
            await expect(service.updateAssignment('invalid-assignment', updateDto)).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('deleteAssignment', () => {
        it('should delete assignment successfully', async () => {
            prisma.resourceAssignment.findUnique.mockResolvedValue(mockAssignment);
            prisma.resourceAssignment.delete.mockResolvedValue(mockAssignment);
            const result = await service.deleteAssignment('assignment-1');
            expect(result).toEqual(mockAssignment);
            expect(prisma.resourceAssignment.delete).toHaveBeenCalledWith({
                where: { id: 'assignment-1' },
            });
        });
        it('should throw NotFoundException when assignment does not exist', async () => {
            prisma.resourceAssignment.findUnique.mockResolvedValue(null);
            await expect(service.deleteAssignment('invalid-assignment')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('getAvailableResources', () => {
        it('should return available resources filtered by type', async () => {
            prisma.task.findUnique.mockResolvedValue(mockTask);
            prisma.resourceAssignment.findMany.mockResolvedValue([{ resourceId: 'resource-1' }]);
            prisma.resource.findMany.mockResolvedValue([
                { ...mockResource, id: 'resource-2', name: 'Junior Developer' },
            ]);
            const result = await service.getAvailableResources('task-1', 'type-1');
            expect(result).toHaveLength(1);
            expect(prisma.resource.findMany).toHaveBeenCalledWith({
                where: { id: { notIn: ['resource-1'] }, typeId: 'type-1' },
                include: { type: true },
                orderBy: [{ type: { name: 'asc' } }, { name: 'asc' }],
            });
        });
        it('should throw NotFoundException when task does not exist', async () => {
            prisma.task.findUnique.mockResolvedValue(null);
            await expect(service.getAvailableResources('invalid-task')).rejects.toThrow(common_1.NotFoundException);
        });
    });
});
//# sourceMappingURL=resource-assignments.service.spec.js.map