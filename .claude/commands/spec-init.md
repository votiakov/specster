# Initialize New Specification

I'll help you initialize a new specification for spec-driven development.

<mcp_call server="specster-server" tool="initializeSpec">
{
  "name": "$ARGUMENTS[0]",
  "description": "$ARGUMENTS[1]"
}
</mcp_call>

This will create a new specification directory with:
- Initial state files
- Template files for requirements, design, and tasks
- Configuration for the workflow

Next, you can run `/spec-requirements $ARGUMENTS[0]` to begin the requirements gathering phase.