# Secrets Rotation Strategy

This document outlines the secrets rotation strategy for InsurAI, including procedures for rotating API keys, handling compromised credentials, and maintaining security best practices.

## Overview

InsurAI uses several sensitive credentials that require periodic rotation:

| Secret | Location | Rotation Frequency | Risk Level |
|--------|----------|-------------------|------------|
| OpenAI API Key | `OPENAI_API_KEY` | 90 days or on compromise | High |
| Anthropic API Key | `ANTHROPIC_API_KEY` | 90 days or on compromise | High |
| Google Cloud API Key | `GOOGLE_CLOUD_API_KEY` | 90 days or on compromise | High |
| Supabase Anon Key | `VITE_SUPABASE_ANON_KEY` | On compromise only | Medium |
| Supabase Service Key | `SUPABASE_SERVICE_KEY` | 90 days or on compromise | Critical |
| Sentry DSN | `VITE_SENTRY_DSN` | On compromise only | Low |

---

## Rotation Procedures

### 1. OpenAI API Key Rotation

**Preparation:**
1. Log into [OpenAI Platform](https://platform.openai.com/api-keys)
2. Generate a new API key before revoking the old one
3. Test the new key with a minimal API call

**Rotation Steps:**
```bash
# 1. Generate new key in OpenAI dashboard
# 2. Update the environment variable
export OPENAI_API_KEY="sk-proj-NEW_KEY_HERE"

# 3. Update .env file
sed -i 's/OPENAI_API_KEY=.*/OPENAI_API_KEY=sk-proj-NEW_KEY_HERE/' .env

# 4. Restart the server
npm run dev:server

# 5. Verify with health check
curl http://localhost:4001/api/health

# 6. Run diagnostics to verify key works
curl http://localhost:4001/api/ai/diagnose

# 7. Once confirmed, revoke old key in OpenAI dashboard
```

**Zero-Downtime Rotation (Production):**
1. Deploy new key to a subset of instances (canary deployment)
2. Monitor error rates for 5-10 minutes
3. Roll out to all instances if no errors
4. Revoke old key after 24-hour observation period

---

### 2. Anthropic API Key Rotation

**Preparation:**
1. Log into [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Generate a new API key
3. Test the new key

**Rotation Steps:**
```bash
# 1. Generate new key in Anthropic console
# 2. Update environment
export ANTHROPIC_API_KEY="sk-ant-NEW_KEY_HERE"

# 3. Update .env file
sed -i 's/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=sk-ant-NEW_KEY_HERE/' .env

# 4. Restart and verify
npm run dev:server
curl http://localhost:4001/api/ai/diagnose

# 5. Revoke old key in Anthropic console
```

---

### 3. Google Cloud API Key Rotation

**Preparation:**
1. Log into [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new API key with the same restrictions
3. Test the new key

**Rotation Steps:**
```bash
# 1. Create new key in GCP console with restrictions:
#    - Application restriction: HTTP referrers (web sites)
#    - API restriction: Cloud Vision API only

# 2. Update environment
export GOOGLE_CLOUD_API_KEY="AIzaNEW_KEY_HERE"

# 3. Update .env file
sed -i 's/GOOGLE_CLOUD_API_KEY=.*/GOOGLE_CLOUD_API_KEY=AIzaNEW_KEY_HERE/' .env

# 4. Restart and verify
npm run dev:server
curl http://localhost:4001/api/ai/diagnose

# 5. Delete old key in GCP console after observation period
```

---

### 4. Supabase Keys Rotation

**Service Role Key (Critical):**
1. This key has full database access - handle with extreme care
2. In Supabase dashboard: Settings > API > Service Role Key
3. Regenerating requires updating all backend services simultaneously

**Anon Key:**
1. This key is safe to expose in frontend (RLS protects data)
2. Only rotate if compromised or switching projects

**Rotation Steps:**
```bash
# 1. Generate new keys in Supabase dashboard
# 2. Update both frontend and backend .env files
# 3. Deploy all services simultaneously
# 4. Clear any cached sessions in browsers
```

---

## Automated Rotation (Recommended for Production)

### Using HashiCorp Vault

```hcl
# Vault configuration for API key rotation
path "secret/data/insurai/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Configure dynamic secrets where possible
```

### Using AWS Secrets Manager

```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name insurai/openai-api-key \
  --secret-string '{"apiKey":"sk-proj-..."}'

# Configure automatic rotation
aws secretsmanager rotate-secret \
  --secret-id insurai/openai-api-key \
  --rotation-lambda-arn arn:aws:lambda:region:account:function:rotation
```

### Environment-Specific Configuration

```bash
# Production: Load from secrets manager
export OPENAI_API_KEY=$(aws secretsmanager get-secret-value \
  --secret-id insurai/openai-api-key \
  --query SecretString --output text | jq -r .apiKey)

# Staging: Load from environment
export OPENAI_API_KEY=$STAGING_OPENAI_KEY

# Development: Load from .env file
source .env
```

---

## Compromise Response Procedure

### If a Key is Compromised:

**Immediate Actions (within 15 minutes):**
1. Revoke the compromised key immediately
2. Generate a new key
3. Update all environments
4. Notify the security team

**Investigation (within 24 hours):**
1. Check API usage logs for unauthorized access
2. Review git history for accidental commits
3. Audit deployment pipelines
4. Check for exposed .env files

**Remediation:**
1. Rotate all keys if breach scope is unclear
2. Update access controls
3. Implement additional monitoring
4. Document incident and lessons learned

### Incident Response Checklist

```markdown
[ ] Compromised key identified
[ ] Key revoked in provider dashboard
[ ] New key generated
[ ] .env file updated (all environments)
[ ] Services restarted
[ ] Health check passed
[ ] Diagnostics passed
[ ] Usage logs reviewed
[ ] Security team notified
[ ] Incident documented
```

---

## Best Practices

### Key Storage

1. **Never commit keys to version control**
   - Add `.env` to `.gitignore`
   - Use `git-secrets` or `gitleaks` to prevent accidental commits

2. **Use environment-specific keys**
   - Separate keys for development, staging, production
   - Limit production key access to production systems only

3. **Apply least privilege**
   - Google Cloud: Restrict to specific APIs
   - OpenAI: Use project-specific keys where possible
   - Supabase: Prefer anon key over service key when possible

### Monitoring

1. **Set up usage alerts**
   - OpenAI: Configure usage limits and alerts
   - Anthropic: Monitor through console
   - Google Cloud: Set up billing alerts

2. **Monitor for anomalies**
   - Unexpected spike in API calls
   - Requests from unexpected locations
   - Failed authentication attempts

3. **Log all key usage**
   - Track which service made each request
   - Maintain audit trail for compliance

### Rotation Schedule

| Environment | Rotation Frequency | Responsible Party |
|-------------|-------------------|-------------------|
| Development | On-demand | Developer |
| Staging | Monthly | DevOps |
| Production | 90 days or on compromise | Security Team |

---

## Environment Variables Reference

```bash
# Server-side (never exposed to browser)
OPENAI_API_KEY=sk-proj-...         # OpenAI API key
ANTHROPIC_API_KEY=sk-ant-...       # Anthropic API key
GOOGLE_CLOUD_API_KEY=AIza...       # Google Cloud Vision API key
SUPABASE_SERVICE_KEY=eyJ...        # Supabase service role key (admin)

# Client-side (safe to expose, protected by RLS)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...      # Supabase anon key (RLS protected)
VITE_SENTRY_DSN=https://...        # Sentry DSN (project-specific)
VITE_API_PROXY_URL=http://...      # Backend API URL

# Server configuration
API_PORT=4001
NODE_ENV=production
REQUEST_TIMEOUT=30000              # Default request timeout (ms)
AI_REQUEST_TIMEOUT=120000          # AI request timeout (ms)
SHUTDOWN_TIMEOUT=30000             # Graceful shutdown timeout (ms)
```

---

## Compliance Notes

### GDPR Considerations
- API keys may be used to process EU citizen data
- Ensure key rotation doesn't disrupt data processing
- Document key access for audit purposes

### SOC 2 Requirements
- Maintain rotation schedule documentation
- Log all key rotations with timestamps
- Implement automated rotation where possible
- Regular access reviews (quarterly)

---

## Related Documentation

- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Security Best Practices](./SECURITY.md)
- [Environment Setup](../README.md#environment-variables)
