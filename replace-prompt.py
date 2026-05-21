#!/usr/bin/env python3
"""Replace lines 155-585 in prompt-service.ts with enhanced prompt content."""
import sys

# Read the enhanced prompt content
with open('/tmp/enhanced-prompt.txt', 'r') as f:
    new_content = f.read().strip()

# Read the original file
with open('/data/.openclaw/workspace/insurai/server/services/prompt-service.ts', 'r') as f:
    lines = f.readlines()

# Lines are 0-indexed; line 155 = index 154, line 584 = index 583
old_line_155 = lines[154].rstrip('\n')
old_line_584 = lines[583].rstrip('\n')

print(f"Line 155: {old_line_155[:80]}...")
print(f"Line 584: {old_line_584[:80]}...")

# Verify the boundaries
assert 'systemPrompt:' in old_line_155, f"Expected line 155 to contain systemPrompt:, got: {old_line_155}"
expected_line_584 = "Be thorough but accurate. It's better to return null than to guess incorrectly.`,"
assert old_line_584 == expected_line_584, f"Line 584 mismatch:\n  Expected: {expected_line_584[:60]}...\n  Got:      {old_line_584[:60]}..."

# Replace lines 155-584 (indices 154-583, inclusive) with new content
# The original had 'systemPrompt: `' on line 155 and the closing '`,' on line 584
new_lines = lines[:154] + ['    systemPrompt: `' + new_content + '`,\n'] + lines[584:]

with open('/data/.openclaw/workspace/insurai/server/services/prompt-service.ts', 'w') as f:
    f.writelines(new_lines)

print("Replacement complete!")
sys.exit(0)
