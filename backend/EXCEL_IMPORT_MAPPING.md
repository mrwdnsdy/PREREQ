# Excel Schedule Template Import Mapping

This document describes how the Excel schedule template fields are mapped to our database schema when importing projects.

## Template Structure Analysis

Based on the provided Excel template, the following columns are recognized and mapped:

### Project-Level Fields
| Excel Column | Database Field | Description |
|--------------|----------------|-------------|
| Sheet Name/Title | `project.name` | Project name extracted from workbook properties or sheet name |
| Calculated from tasks | `project.startDate` | Earliest start date from all tasks |
| Calculated from tasks | `project.endDate` | Latest finish date from all tasks |
| Sum of Budget columns | `project.budget` | Total project budget |

### Task-Level Fields
| Excel Column | Database Field | Type | Description |
|--------------|----------------|------|-------------|
| Level | `task.level` | Integer | Task hierarchy level (0-10) |
| ID | `task.activityId` | String | Generated unique activity ID (A1010, A1020, etc.) |
| Description | `task.title` | String | Primary task name/description |
| Type | Calculated | Boolean | Used to determine `isMilestone` if contains "milestone" |
| Planned Duration | Calculated | Duration | Used for milestone detection (0 = milestone) |
| Start Date | `task.startDate` | DateTime | Task start date (handles Excel date serials) |
| Finish Date | `task.endDate` | DateTime | Task finish date |
| Predecessor | Dependencies | String | Parsed for creating `TaskDependency` records |
| Successor | Dependencies | String | Parsed for creating `TaskDependency` records |
| Baseline Start Date | Not stored | DateTime | Available for future baseline tracking |
| Baseline Finish Date | Not stored | DateTime | Available for future baseline tracking |
| Accountable Designation | `task.resourceRole` | String | Primary responsible role |
| Responsible Personnel | `task.description` | String | Stored in task description |
| Project Manager | Resource Assignment | String | Creates PM resource assignment |
| Flag | `task.description` | String | Additional notes/flags |
| Junior Design | Resource Assignment | Number | Hours assigned to Junior Designer (rate: $75/hr) |
| Intermediate Design | Resource Assignment | Number | Hours assigned to Intermediate Designer (rate: $95/hr) |
| Senior Design | Resource Assignment | Number | Hours assigned to Senior Designer (rate: $125/hr) |
| Budget | `task.costLabor` | Decimal | Direct budget amount or calculated from resource hours |

### Generated Fields
| Database Field | Source | Description |
|----------------|--------|-------------|
| `task.wbsCode` | Generated | Hierarchical WBS code (1, 1.1, 1.1.1, etc.) |
| `task.parentId` | Calculated | Based on level hierarchy |
| `task.resourceQty` | Calculated | Sum of all resource hours |
| `task.totalCost` | Calculated | Sum of labor, material, and other costs |

## Resource Management

### Automatic Resource Types
The import process automatically creates these resource types:
- **Design**: For technical design roles
- **Management**: For project management roles

### Automatic Resources
Based on template data, these resources are created:
- **Junior Designer**: $75/hr (Design type)
- **Intermediate Designer**: $95/hr (Design type)  
- **Senior Designer**: $125/hr (Design type)
- **[Project Manager Name]**: $150/hr (Management type)

### Resource Assignments
Hours from the Junior Design, Intermediate Design, and Senior Design columns create resource assignments linking tasks to resources with specific hour allocations.

## Dependency Parsing

The Predecessor/Successor fields support multiple formats:
- **Simple ID**: `"5"` creates FS dependency
- **With Type**: `"5FS"` creates Finish-to-Start
- **With Lag**: `"5FS+2"` creates FS with 2-day lag
- **Multiple**: `"3,5,7"` creates multiple dependencies
- **Types Supported**: FS, SS, FF, SF

## WBS Code Generation

WBS codes are automatically generated based on hierarchy:
- Level 0: `1`
- Level 1: `1.1`, `1.2`, `1.3`
- Level 2: `1.1.1`, `1.1.2`, `1.2.1`
- And so on...

## Date Handling

The import supports:
- **Excel date serials**: Automatic conversion from Excel numeric dates
- **String dates**: Standard date string parsing
- **Missing dates**: Uses current date as fallback

## Milestone Detection

Tasks are marked as milestones if:
- Type field contains "milestone" (case-insensitive)
- Planned Duration is "0" or "0d"

## Usage

### API Endpoint
```
POST /projects/{projectId}/import-p6/excel
Content-Type: multipart/form-data
```

### Supported File Types
- `.xlsx` (Excel 2007+)
- `.xls` (Excel 97-2003)

### Response
```json
{
  "message": "Excel schedule template imported successfully",
  "project": "Project Name",
  "tasksImported": 25,
  "resourcesImported": 4,
  "assignmentsImported": 45
}
```

## Error Handling

The import process includes validation for:
- ✅ File format verification
- ✅ Header row detection
- ✅ Missing required fields
- ✅ Date format validation
- ✅ Numeric field validation
- ✅ Duplicate resource prevention
- ✅ Circular dependency detection

## Future Enhancements

Potential additions for enhanced template support:
- Progress/completion percentage tracking
- Constraint handling (Start No Earlier Than, etc.)
- Custom field mapping configuration
- Baseline comparison features
- Advanced resource assignment patterns
- Cost center/department tracking 