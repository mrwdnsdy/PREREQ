# WBS Hierarchy Validation Rules

This document outlines the Work Breakdown Structure (WBS) hierarchy validation rules implemented in the PREREQ project management system.

## Overview

The WBS hierarchy validation ensures proper project structure by enforcing level-by-level creation of work breakdown structure elements and tasks.

## Rules

### 1. Sequential Level Creation
- **Level 1 First**: You must create at least one Level 1 WBS item before creating any Level 2 items
- **Level 2 Before Level 3**: You must create at least one Level 2 WBS item before creating any Level 3 items
- **And so on...**: This pattern continues for all levels (up to Level 10)

### 2. Parent-Child Relationships
- **Direct Parent Required**: Each child task/WBS item must have a direct parent at the previous level
- **Example**: A Level 3 task can only be created under a Level 2 parent, not directly under a Level 1 parent

### 3. WBS Code Validation
- **Proper Format**: WBS codes must follow the hierarchical format (e.g., 1, 1.1, 1.1.1, 1.2, 2, 2.1)
- **Parent Path Exists**: For a WBS path like "1.2.3", both "1" and "1.2" must exist

## Implementation

### Backend Validation
Located in `backend/src/modules/tasks/tasks.service.ts`:

```typescript
private async validateWbsHierarchy(parentId: string | null, projectId: string, desiredLevel?: number): Promise<void>
```

**Validation Points**:
- Task creation (`create` method)
- Task updates when changing parent (`update` method)
- Checks for required parent levels
- Validates parent-child level relationships

### Frontend Validation
Located in `frontend/src/services/scheduleApi.ts`:

**WBS Node Creation**:
```typescript
async createWbsNode(projectId: string, node: Partial<WbsNode>): Promise<WbsNode>
```

**Task Creation**:
```typescript
async createTask(projectId: string, task: Partial<Task>): Promise<Task>
```

## User Experience

### Error Messages
Users receive clear error messages when validation fails:

- **Missing Parent Level**: "Cannot create level 3 task. You must first create a level 2 task."
- **Invalid Parent**: "Parent WBS path '1.1' does not exist. Cannot create '1.1.2'."
- **Level Mismatch**: "Invalid WBS level. Child of level 2 must be level 3, but level 4 was specified."

### Visual Feedback
- **Context Menus**: Show target level for new items (e.g., "Add Child (Level 3)")
- **Level Badges**: Visual indicators show the level of each WBS item
- **Error Toasts**: Immediate feedback when validation fails

## Examples

### ✅ Valid Hierarchy Creation Sequence
1. Create "1 - Project Planning" (Level 1)
2. Create "1.1 - Requirements" (Level 2, under "1")
3. Create "1.1.1 - Stakeholder Interviews" (Level 3, under "1.1")
4. Create "2 - Development" (Level 1)
5. Create "2.1 - Frontend" (Level 2, under "2")

### ❌ Invalid Attempts (Will Be Blocked)
1. ❌ Creating "1.1.1" without first creating "1.1"
2. ❌ Creating Level 3 items when no Level 2 items exist
3. ❌ Assigning Level 4 to a child of Level 2 parent
4. ❌ Creating root-level items with level other than 1

## Benefits

1. **Consistent Structure**: Ensures all projects follow proper WBS methodology
2. **Data Integrity**: Prevents orphaned or incorrectly leveled tasks
3. **Reporting Accuracy**: Maintains proper hierarchical relationships for reporting
4. **User Guidance**: Guides users to create well-structured project breakdowns
5. **Industry Standards**: Follows PMI and other project management best practices

## Technical Notes

- **Maximum Depth**: 10 levels supported (configurable in backend)
- **Performance**: Validation queries are optimized with database indexes
- **Concurrency**: Thread-safe validation prevents race conditions
- **Error Recovery**: Failed creations don't leave partial data 