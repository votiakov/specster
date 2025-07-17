# Specster User Guidance

## Overview

This guide walks you through using the enhanced Specster system that implements the spec-driven development workflow with explicit approval requirements and ground-truth progression.

## Key Principles

### 1. Ground-Truth Progression
- **Establish ground-truths progressively**: Each phase must be explicitly approved before proceeding
- **No assumptions**: Everything requires your explicit approval
- **Sequential flow**: Cannot skip phases or proceed without approval

### 2. Explicit Approval Workflow
- **Approval Gates**: Each phase transition requires explicit user approval
- **Clear Questions**: System asks specific questions like "Do the requirements look good?"
- **Feedback Loops**: Revise and re-approve until you're satisfied

### 3. Three-Phase Workflow
1. **Requirements Gathering**: Define what needs to be built
2. **Design Creation**: Plan how to build it
3. **Implementation Planning**: Break down into actionable tasks

## Getting Started

### Step 1: Initialize a New Specification

```bash
# Initialize a new specification
specster initializeSpec --name "shopping-cart" --description "Shopping cart functionality for e-commerce"
```

**Expected Response:**
```json
{
  "success": true,
  "specName": "shopping-cart",
  "message": "Specification 'shopping-cart' initialized successfully",
  "data": {
    "currentPhase": "init",
    "createdAt": "2025-01-17T10:00:00Z",
    "specDir": "shopping-cart"
  }
}
```

### Step 2: Enter Requirements Phase

```bash
# Enter requirements gathering phase
specster enterRequirementsPhase --specName "shopping-cart"
```

**What happens:**
- System creates a requirements.md file using the enhanced template
- Template includes detailed EARS format examples
- File is populated with placeholder content for you to fill in

**Expected Response:**
```json
{
  "success": true,
  "specName": "shopping-cart",
  "phase": "requirements",
  "message": "Successfully entered requirements phase",
  "data": {
    "requirementsFile": "shopping-cart/requirements.md",
    "template": "# Requirements Document\n\n## Introduction..."
  }
}
```

### Step 3: Complete Requirements Document

```bash
# Save your completed requirements
specster saveSpecificationFile --specName "shopping-cart" --fileName "requirements.md" --content "..."
```

**System Response with Approval Guidance:**
```json
{
  "success": true,
  "filePath": "shopping-cart/requirements.md",
  "message": "File 'requirements.md' saved successfully",
  "approvalRequired": true,
  "approvalMessage": "Please review the requirements document and provide explicit approval. Do the requirements look good? If so, we can move on to the design.",
  "guidance": "Please review the requirements document and provide explicit approval to proceed to the next phase.",
  "nextSteps": "Use 'checkApprovalRequirement' and 'requestApproval' to establish ground-truth before proceeding."
}
```

### Step 4: Approve Requirements (Ground-Truth Establishment)

```bash
# Check what approval is needed
specster checkApprovalRequirement --specName "shopping-cart" --phase "requirements" --content "..."
```

**Response:**
```json
{
  "success": true,
  "required": true,
  "message": "Please review the requirements document and provide explicit approval. Do the requirements look good? If so, we can move on to the design.",
  "guidance": "Please review the requirements document and provide explicit approval using 'provideApproval'."
}
```

### Step 5: Generate Design (Triggers Approval Request)

```bash
# Attempt to generate design
specster generateDesign --specName "shopping-cart"
```

**Response (Approval Required):**
```json
{
  "success": false,
  "requiresApproval": true,
  "approvalRequest": {
    "id": "shopping-cart-design-1705492800000",
    "specName": "shopping-cart",
    "fromPhase": "requirements",
    "toPhase": "design",
    "status": "pending"
  },
  "message": "Phase transition requires approval. Please review the requirements document and provide explicit approval.",
  "guidance": "Before proceeding to the design phase, please confirm: Do the requirements look good? If so, we can move on to the design.",
  "nextSteps": "Use 'provideApproval' with approvalId 'shopping-cart-design-1705492800000' to approve or reject this transition."
}
```

### Step 6: Provide Explicit Approval

```bash
# Provide approval for the requirements
specster provideApproval --specName "shopping-cart" --approvalId "shopping-cart-design-1705492800000" --approvedBy "Developer" --approved true --comments "Requirements look comprehensive and well-defined"
```

**Response:**
```json
{
  "success": true,
  "approvalRecord": {
    "id": "shopping-cart-design-approval-1705492800000",
    "specName": "shopping-cart",
    "phase": "design",
    "action": "approved",
    "approvedBy": "Developer",
    "approvedAt": "2025-01-17T10:00:00Z",
    "comments": "Requirements look comprehensive and well-defined"
  },
  "message": "Approval approved for shopping-cart",
  "nextSteps": "The design phase has been approved. You can now proceed to the next phase."
}
```

### Step 7: Generate Design (Now Successful)

```bash
# Generate design after approval
specster generateDesign --specName "shopping-cart"
```

**Response:**
```json
{
  "success": true,
  "specName": "shopping-cart",
  "design": "# Shopping Cart Design Document\n\n## Overview...",
  "message": "Design generated successfully for 'shopping-cart'",
  "data": {
    "designFile": "shopping-cart/design.md",
    "phase": "design"
  }
}
```

## Common Workflow Patterns

### Pattern 1: Iterative Approval
When you need changes before approval:

```bash
# Make changes and save
specster saveSpecificationFile --specName "shopping-cart" --fileName "requirements.md" --content "updated content"

# System prompts for approval again
# Review changes and either approve or request more changes
```

### Pattern 2: Checking Status
Always check status to understand current state:

```bash
# Get comprehensive status
specster getSpecStatus --specName "shopping-cart"
```

**Response includes approval guidance:**
```json
{
  "success": true,
  "specName": "shopping-cart",
  "currentPhase": "requirements",
  "nextAction": "Generate design (requires approval)",
  "approvalGuidance": "Before generating design, ensure requirements are approved. Use 'Do the requirements look good?' to confirm ground-truth.",
  "pendingApproval": null,
  "progress": {
    "requirements": {"status": "completed"},
    "design": {"status": "pending"},
    "tasks": {"status": "pending"}
  }
}
```

### Pattern 3: Handling Pending Approvals
When you have pending approvals:

```bash
# Check for pending approvals
specster getPendingApproval --specName "shopping-cart"
```

**Response:**
```json
{
  "success": true,
  "pendingApproval": {
    "id": "shopping-cart-design-1705492800000",
    "specName": "shopping-cart",
    "fromPhase": "requirements",
    "toPhase": "design",
    "status": "pending",
    "requestedAt": "2025-01-17T10:00:00Z"
  },
  "message": "Pending approval found for shopping-cart",
  "guidance": "Use 'provideApproval' with approvalId 'shopping-cart-design-1705492800000' to approve or reject this request."
}
```

## Best Practices

### 1. Review Before Approving
- Always review the content carefully
- Check that all requirements are captured
- Ensure the design meets the requirements
- Verify tasks are comprehensive and actionable

### 2. Use Descriptive Comments
```bash
# Good approval with context
specster provideApproval --specName "shopping-cart" --approvalId "..." --approvedBy "Developer" --approved true --comments "Requirements are comprehensive. Added edge cases for inventory management and user session handling."

# Rejection with clear feedback
specster provideApproval --specName "shopping-cart" --approvalId "..." --approvedBy "Developer" --approved false --comments "Missing requirements for mobile responsiveness and offline cart persistence. Please add these before proceeding."
```

### 3. Regular Status Checks
```bash
# Check status frequently to stay oriented
specster getSpecStatus --specName "shopping-cart"
```

### 4. Systematic Progression
- Don't skip phases
- Don't proceed without approval
- Address all feedback before re-requesting approval

## Error Handling

### Common Errors and Solutions

#### 1. "Phase transition requires approval"
**Error:** Trying to proceed without approval
**Solution:** Use the approval workflow as guided

#### 2. "No pending approval found"
**Error:** Trying to approve something that doesn't exist
**Solution:** Check status and request approval if needed

#### 3. "Approval request has expired"
**Error:** Approval request timed out
**Solution:** Request new approval

## Advanced Features

### 1. Template Customization
```bash
# Apply template with custom variables
specster applyTemplate --templateName "requirements-template.md" --variables {"specName": "shopping-cart", "description": "E-commerce cart", "author": "Developer"}
```

### 2. Validation
```bash
# Validate phase transitions
specster validatePhaseTransition --specName "shopping-cart" --fromPhase "requirements" --toPhase "design"
```

### 3. Progress Tracking
```bash
# Update phase progress
specster updatePhaseProgress --specName "shopping-cart" --phase "requirements" --completed true
```

## Troubleshooting

### Issue: System won't let me proceed
**Check:**
1. Are you in the right phase?
2. Is the previous phase approved?
3. Are there pending approvals?

**Solution:** Check status and follow approval guidance

### Issue: Lost track of where I am
**Solution:** Use `getSpecStatus` to get comprehensive overview

### Issue: Need to make changes after approval
**Solution:** Make changes and go through approval process again

## Tips for Success

1. **Read the guidance**: System provides specific guidance for each situation
2. **Follow the prompts**: System tells you exactly what to do next
3. **Be thorough**: Take time to review before approving
4. **Use comments**: Provide context with your approvals
5. **Check status regularly**: Stay oriented in the workflow

## Example Complete Workflow

See the `shopping-cart-requirements.md`, `shopping-cart-design.md`, and `shopping-cart-tasks.md` files in the examples directory for a complete implementation following this workflow.

This demonstrates:
- Detailed EARS format requirements
- Research-integrated design
- Granular, actionable tasks
- Explicit approval at each phase
- Ground-truth progression