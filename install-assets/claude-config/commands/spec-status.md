# Specification Status

I'll show you the current status of your specification and suggest next steps.

<mcp_call server="specster-server" tool="getSpecStatus">
{
  "specName": "$ARGUMENTS[0]"
}
</mcp_call>

## Status Overview

This will show you:

### Current State
- **Active Phase** - Which phase you're currently in
- **Phase Progress** - What's been completed in each phase
- **File Status** - Which specification files exist and their last update times
- **Workflow History** - Recent activities and transitions

### Progress Tracking
- **Requirements Phase** - Status of requirements gathering
- **Design Phase** - Status of design documentation
- **Tasks Phase** - Status of implementation planning
- **Overall Progress** - Percentage complete across all phases

### Next Actions
- **Recommended Next Step** - What you should do next
- **Pending Approvals** - Any approvals needed to proceed
- **Blockers** - Issues preventing progress
- **Available Commands** - Commands you can use at this stage

### Quality Metrics
- **Validation Status** - Whether current phase meets quality standards
- **Completeness Score** - How complete each phase is
- **Approval Status** - Which phases have been approved
- **File Synchronization** - Whether files are up to date

If no specification name is provided, I'll show a summary of all active specifications in your project.