# Requirements Phase

I'll guide you through the requirements gathering phase using EARS notation (Easy Approach to Requirements Syntax).

<mcp_call server="specster-server" tool="enterRequirementsPhase">
{
  "specName": "$ARGUMENTS[0]"
}
</mcp_call>

## Requirements Gathering Process

Let's work together to create structured requirements using EARS format:

**EARS Format Examples:**
- `WHEN [trigger] THEN [system] SHALL [response]`
- `IF [condition] THEN [system] SHALL [response]`
- `WHEN [event] AND [condition] THEN [system] SHALL [response]`

### User Stories Structure

Each user story should follow this format:
```
As a [role], I want [feature], so that [benefit].

Acceptance Criteria:
- WHEN [trigger] THEN the system SHALL [response]
- IF [condition] THEN the system SHALL [response]
```

### Key Sections to Complete

1. **Overview** - Brief description of what you're building
2. **User Stories** - Who will use this and why
3. **Acceptance Criteria** - Specific, testable conditions
4. **Non-Functional Requirements** - Performance, security, usability
5. **Technical Requirements** - Integration, data, compatibility needs
6. **Dependencies** - What you need from other systems
7. **Success Criteria** - How you'll know it's done

Once you've completed the requirements, I'll need your explicit approval before we can proceed to the design phase.