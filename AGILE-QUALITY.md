# Agile Execution & Quality Tracking

Acceleron Plus now features an integrated Agile Planning and Quality Management suite, bringing full Sprint execution and Test coverage to enterprise delivery.

## Sprint Planning
Sprints are managed within the Project Details view. 

- **Backlog Management**: The backlog collects all WBS tasks that are not yet assigned to a sprint. 
- **Drag & Drop Planning**: You can drag work packages directly from the Backlog into an active or planned Sprint.
- **Velocity & Burn**: Tasks allocated to sprints will drive burn charts and velocity metrics for the team.

![Sprint Planning Demo](/docs/sprint-planning-demo.gif)
*(Placeholder: A demonstration GIF showing dragging WBS items from the Backlog to an active Sprint)*

## Requirements Management
Compliance and detailed specification tracking is critical for enterprise delivery.

- **Folder Structures**: Requirements can be grouped into Suites (folders) for logical organization.
- **Approval Lifecycle**: Requirements support a full state transition: `Draft` → `In Review` → `Approved` / `Rejected`.
- **Ownership**: Assign requirements directly to team members for accountability.

## Test Case Management
Testing is tightly integrated with Requirements and WBS Tasks.

- **Execution Tracking**: Track the status of every test case (`Not Run`, `Passed`, `Failed`, `Blocked`, `Skipped`).
- **Linking**: Test cases must be linked to a Requirement (for functional coverage) or a WBS Task (for execution coverage).

## Traceability Matrix
The Traceability Matrix tab cross-references all three layers (Requirements → WBS Tasks → Test Cases).
- Use the **"Uncovered"** filter to instantly surface Requirements that have no linked test cases, ensuring 100% test coverage before delivery.

![Traceability Matrix Demo](/docs/traceability-demo.gif)
*(Placeholder: A demonstration GIF showing filtering the traceability matrix to find uncovered requirements)*

## ITSM Kanban Board
Service Desk tickets can now be managed visually.

- Toggle between the traditional Table view and the new **Kanban Board** in the Service Desk (`/itsm`).
- Drag tickets between `To Do`, `In Progress`, `Review`, and `Done` columns to instantly update their status.
- Colored priority badges and SLA markers are visible directly on the cards.

![Kanban Board Demo](/docs/kanban-demo.gif)
*(Placeholder: A demonstration GIF showing dragging a ticket across Kanban columns)*
