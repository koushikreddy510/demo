# 🌐 ALB Custom Domain Setup - The Perfect Solution

## 🎯 Why This Solves Everything

Instead of using the ugly ALB URL:

```
❌ http://plivo-alb-1680385896.us-east-1.elb.amazonaws.com
```

You get a clean, professional HTTPS domain:

```
✅ https://api.yourdomain.com
✅ wss://api.yourdomain.com/ws
```

## 🚀 Complete Setup Process

### Step 1: Get a Domain (Optional - Can Use Existing)

```bash
# If you don't have a domain, register one
# Cost: ~$12/year for .com
# Or use a subdomain of existing domain
```

### Step 2: Create Hosted Zone in Route 53

```bash
# Create hosted zone for your domain
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s) \
  --hosted-zone-config Comment="API domain for load balancer"

# Note the hosted zone ID from output
HOSTED_ZONE_ID="Z1234567890ABC"
```

### Step 3: Request SSL Certificate

```bash
# Request certificate for API subdomain
aws acm request-certificate \
  --domain-name api.yourdomain.com \
  --validation-method DNS \
  --region us-east-1

# Get certificate ARN from output
CERT_ARN="arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"
```

### Step 4: Validate Certificate

```bash
# Get validation records
aws acm describe-certificate --certificate-arn $CERT_ARN --region us-east-1

# Add DNS validation record to Route 53
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_validation.api.yourdomain.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "validation-value-from-acm.acm-validations.aws."}]
      }
    }]
  }'

# Wait for validation (usually 5-10 minutes)
aws acm wait certificate-validated --certificate-arn $CERT_ARN --region us-east-1
```

### Step 5: Add HTTPS Listener to Your Existing ALB

```bash
# Get your existing ALB ARN
ALB_ARN=$(aws elbv2 describe-load-balancers --names plivo-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text --region us-east-1)

# Get your existing target group ARN
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups --names plivo-targets --query 'TargetGroups[0].TargetGroupArn' --output text --region us-east-1)

# Add HTTPS listener (port 443)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN \
  --region us-east-1
```

### Step 6: Point Domain to ALB

```bash
# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers --names plivo-alb --query 'LoadBalancers[0].DNSName' --output text --region us-east-1)

# Create A record pointing to ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "Z35SXDOTRQ7X7K"
        }
      }
    }]
  }'
```

### Step 7: Update Frontend Code

```javascript
// Update your React app
const API_BASE = "https://api.yourdomain.com";
const WS_URL = "wss://api.yourdomain.com/ws";
```

### Step 8: Optional - Redirect HTTP to HTTPS

```bash
# Modify existing HTTP listener to redirect to HTTPS
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query 'Listeners[?Port==`80`].ListenerArn' --output text --region us-east-1)

aws elbv2 modify-listener \
  --listener-arn $HTTP_LISTENER_ARN \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --region us-east-1
```

## 🧪 Testing Your Setup

### Test HTTPS API

```bash
# Test health endpoint
curl https://api.yourdomain.com/healthz
# Should return: ok

# Test metrics
curl https://api.yourdomain.com/metrics
# Should return: JSON stats
```

### Test WSS WebSocket

```javascript
// In browser console
const ws = new WebSocket("wss://api.yourdomain.com/ws");
ws.onopen = () => {
  console.log("✅ WSS Connected!");
  ws.send(JSON.stringify({ type: "subscribe", channels: ["test"] }));
};
ws.onmessage = (event) => console.log("Message:", event.data);
```

## 🎯 Benefits of This Approach

### ✅ **Professional URLs**

- `https://api.yourdomain.com` instead of ugly ALB URL
- `wss://api.yourdomain.com/ws` for WebSocket
- Branded, memorable, trustworthy

### ✅ **Security**

- SSL/TLS encryption
- Browser security indicators (lock icon)
- No mixed content warnings

### ✅ **Flexibility**

- Can change backend infrastructure without changing URLs
- Easy to add CDN, caching, etc.
- Professional appearance for demos

### ✅ **Cost Effective**

- SSL certificate: **FREE** (AWS Certificate Manager)
- Route 53 hosted zone: **$0.50/month**
- Domain: **~$12/year** (optional if you have one)
- ALB costs: **Same as before**

## 🔄 One-Command Setup Script

```bash
#!/bin/bash
# Complete ALB custom domain setup

DOMAIN="yourdomain.com"
SUBDOMAIN="api.$DOMAIN"
ALB_NAME="plivo-alb"
TARGET_GROUP_NAME="plivo-targets"

echo "🚀 Setting up custom domain for ALB..."

# 1. Create hosted zone
echo "Creating hosted zone..."
HOSTED_ZONE_ID=$(aws route53 create-hosted-zone \
  --name $DOMAIN \
  --caller-reference $(date +%s) \
  --query 'HostedZone.Id' --output text | cut -d'/' -f3)

# 2. Request certificate
echo "Requesting SSL certificate..."
CERT_ARN=$(aws acm request-certificate \
  --domain-name $SUBDOMAIN \
  --validation-method DNS \
  --query 'CertificateArn' --output text \
  --region us-east-1)

echo "Certificate ARN: $CERT_ARN"
echo "⚠️  Please validate certificate in ACM console"
echo "⚠️  Add DNS validation record to your domain"
read -p "Press enter when certificate shows 'Issued' status..."

# 3. Get ALB details
ALB_ARN=$(aws elbv2 describe-load-balancers --names $ALB_NAME \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text --region us-east-1)
ALB_DNS=$(aws elbv2 describe-load-balancers --names $ALB_NAME \
  --query 'LoadBalancers[0].DNSName' --output text --region us-east-1)
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups --names $TARGET_GROUP_NAME \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region us-east-1)

# 4. Add HTTPS listener
echo "Adding HTTPS listener..."
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN \
  --region us-east-1

# 5. Create DNS record
echo "Creating DNS record..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "'$SUBDOMAIN'",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "Z35SXDOTRQ7X7K"
        }
      }
    }]
  }'

echo "✅ Setup complete!"
echo "🌐 Your API is now available at: https://$SUBDOMAIN"
echo "🔌 WebSocket endpoint: wss://$SUBDOMAIN/ws"
echo ""
echo "Update your frontend with:"
echo "const API_BASE = 'https://$SUBDOMAIN';"
echo "const WS_URL = 'wss://$SUBDOMAIN/ws';"
```

## 🎯 For Machine Coding Round

### Quick Demo Strategy

```bash
# 1. Start with HTTP (faster setup)
# 2. Show working application
# 3. Mention: "For production, I'd add custom domain + HTTPS"
# 4. Show this script as "production upgrade path"
```

### Impressive Points to Mention

- "SSL termination at load balancer level"
- "Backend stays HTTP internally for performance"
- "Professional domain structure"
- "Free SSL certificates with auto-renewal"
- "Easy to add CDN/caching later"

## 🚨 Troubleshooting

### Certificate Validation Issues

```bash
# Check certificate status
aws acm describe-certificate --certificate-arn $CERT_ARN --region us-east-1

# Common issues:
# 1. DNS validation record not added
# 2. Wrong hosted zone
# 3. Propagation delay (wait 10-15 minutes)
```

### DNS Resolution Issues

```bash
# Test DNS resolution
nslookup api.yourdomain.com
dig api.yourdomain.com

# Check Route 53 records
aws route53 list-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID
```

### ALB Health Check Issues

```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN --region us-east-1

# Common issues:
# 1. Security group not allowing ALB traffic
# 2. Health check path incorrect
# 3. Backend not responding on correct port
```

## 💡 Pro Tips

1. **Use subdomains**: `api.yourdomain.com`, `app.yourdomain.com`
2. **Wildcard certificates**: `*.yourdomain.com` covers all subdomains
3. **Health check paths**: Ensure `/healthz` works over HTTPS
4. **CORS origins**: Update to use HTTPS URLs
5. **Monitoring**: Set up CloudWatch alarms for certificate expiration

**This approach gives you production-grade URLs while keeping the same infrastructure! 🚀**
