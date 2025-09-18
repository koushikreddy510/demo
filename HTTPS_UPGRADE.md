# 🔒 HTTPS Deployment Guide - Production Ready

## 🎯 Overview

Converting our HTTP setup to HTTPS is straightforward and involves:
1. **SSL Certificate** (free with AWS Certificate Manager)
2. **HTTPS Listener** on ALB
3. **WSS WebSocket** connections
4. **Frontend URL updates**

## 🚀 Backend HTTPS Setup (5 minutes)

### 1. Request SSL Certificate
```bash
# Request certificate for your domain
aws acm request-certificate \
  --domain-name api.yourdomain.com \
  --validation-method DNS \
  --region us-east-1

# Or use wildcard for subdomains
aws acm request-certificate \
  --domain-name "*.yourdomain.com" \
  --validation-method DNS \
  --region us-east-1

# Get certificate ARN from output
```

### 2. Add HTTPS Listener to ALB
```bash
# Add HTTPS listener (port 443)
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:account:loadbalancer/app/your-alb/xxx \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:account:certificate/xxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:account:targetgroup/your-targets/xxx \
  --region us-east-1

# Optional: Redirect HTTP to HTTPS
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:us-east-1:account:listener/app/your-alb/xxx \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --region us-east-1
```

### 3. Update DNS (if using custom domain)
```bash
# Create Route 53 record pointing to ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "your-alb-dns-name.elb.amazonaws.com",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "Z35SXDOTRQ7X7K"
        }
      }
    }]
  }'
```

## 🎨 Frontend HTTPS Setup

### Option A: CloudFront + S3 (Recommended)

#### 1. Deploy to S3
```bash
# Create S3 bucket
aws s3 mb s3://your-app-frontend-bucket --region us-east-1

# Build with HTTPS backend URL
cd frontend
VITE_API_URL=https://api.yourdomain.com npm run build

# Upload to S3
aws s3 sync dist/ s3://your-app-frontend-bucket --delete
```

#### 2. Create CloudFront Distribution
```bash
# Create CloudFront distribution
cat > cloudfront-config.json << EOF
{
  "CallerReference": "$(date +%s)",
  "Comment": "Frontend HTTPS Distribution",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3Origin",
      "DomainName": "your-app-frontend-bucket.s3.amazonaws.com",
      "S3OriginConfig": {
        "OriginAccessIdentity": ""
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3Origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "MinTTL": 0,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
    }
  },
  "Enabled": true,
  "PriceClass": "PriceClass_100"
}
EOF

aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
```

### Option B: Amplify with Custom Domain
```bash
# Deploy to Amplify (forces HTTPS)
aws amplify create-app --name your-app --repository https://github.com/user/repo

# Add custom domain
aws amplify create-domain-association \
  --app-id your-app-id \
  --domain-name app.yourdomain.com \
  --sub-domain-settings prefix=www,branchName=main
```

## 🔄 Code Changes Required

### 1. Frontend WebSocket URL Update
```javascript
// Before (HTTP)
const API_BASE = 'http://your-alb-url.elb.amazonaws.com'
const WS_URL = 'ws://your-alb-url.elb.amazonaws.com/ws'

// After (HTTPS)
const API_BASE = 'https://api.yourdomain.com'
const WS_URL = 'wss://api.yourdomain.com/ws'  // ← WSS instead of WS
```

### 2. Environment Variables
```bash
# Update frontend build
VITE_API_URL=https://api.yourdomain.com

# Backend stays the same (ALB handles SSL termination)
CORS_ORIGIN=https://app.yourdomain.com
```

### 3. CORS Update (Backend)
```javascript
// Update CORS origin in backend/.env
CORS_ORIGIN=https://app.yourdomain.com

// Or allow both during transition
CORS_ORIGIN=https://app.yourdomain.com,http://localhost:3000
```

## 🧪 Testing HTTPS Setup

### Backend Tests
```bash
# Test HTTPS endpoint
curl https://api.yourdomain.com/healthz

# Test WebSocket (using wscat)
npm install -g wscat
wscat -c wss://api.yourdomain.com/ws
```

### Frontend Tests
```bash
# Test HTTPS frontend
curl https://app.yourdomain.com

# Browser console WebSocket test
const ws = new WebSocket('wss://api.yourdomain.com/ws');
ws.onopen = () => console.log('WSS Connected!');
```

## 🔧 Complete HTTPS Deployment Script

```bash
#!/bin/bash
# Complete HTTPS deployment

# 1. Backend HTTPS
echo "Setting up backend HTTPS..."
CERT_ARN=$(aws acm request-certificate \
  --domain-name api.yourdomain.com \
  --validation-method DNS \
  --query 'CertificateArn' --output text)

echo "Certificate ARN: $CERT_ARN"
echo "⚠️  Validate certificate in ACM console before continuing"
read -p "Press enter when certificate is validated..."

# Add HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN

# 2. Frontend HTTPS
echo "Building frontend with HTTPS..."
cd frontend
VITE_API_URL=https://api.yourdomain.com npm run build

# Deploy to S3
aws s3 sync dist/ s3://your-frontend-bucket --delete

# 3. CloudFront (optional)
echo "Creating CloudFront distribution..."
# Use cloudfront-config.json from above

echo "✅ HTTPS deployment complete!"
echo "Frontend: https://app.yourdomain.com"
echo "Backend: https://api.yourdomain.com"
```

## 🚨 Common HTTPS Issues & Solutions

### Mixed Content Errors
```
Problem: HTTPS page loading HTTP resources
Solution: Ensure ALL resources use HTTPS URLs
```

### WebSocket Connection Failed
```
Problem: WSS connection fails
Solution: 
1. Check ALB has HTTPS listener on port 443
2. Verify certificate is valid
3. Use wss:// not ws:// in frontend
```

### Certificate Validation
```
Problem: Certificate stuck in "Pending Validation"
Solution:
1. Add DNS validation records to Route 53
2. Or use email validation method
3. Wait 5-10 minutes for propagation
```

## 💰 HTTPS Costs

### Free Components
- ✅ **SSL Certificate** (AWS Certificate Manager)
- ✅ **ALB HTTPS listener** (same cost as HTTP)
- ✅ **Route 53 DNS** (minimal cost)

### Paid Components
- 💰 **CloudFront** (~$0.085/GB)
- 💰 **Custom Domain** (~$12/year for .com)
- 💰 **Route 53 Hosted Zone** (~$0.50/month)

## 🎯 Production Deployment Strategy

### Phase 1: Dual Protocol Support
```javascript
// Support both HTTP and HTTPS during transition
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
const API_BASE = `${protocol}//api.yourdomain.com`;
const WS_URL = `${wsProtocol}//api.yourdomain.com/ws`;
```

### Phase 2: HTTPS-Only
```javascript
// Force HTTPS in production
const API_BASE = 'https://api.yourdomain.com';
const WS_URL = 'wss://api.yourdomain.com/ws';
```

## 🏆 Best Practices

1. **Always use HTTPS in production**
2. **Redirect HTTP to HTTPS** at ALB level
3. **Use CloudFront** for global performance
4. **Enable HSTS headers** for security
5. **Monitor certificate expiration** (auto-renewal with ACM)

## ⚡ Quick HTTPS Checklist

- [ ] SSL certificate requested and validated
- [ ] ALB HTTPS listener configured (port 443)
- [ ] Frontend uses `https://` and `wss://` URLs
- [ ] CORS updated for HTTPS origins
- [ ] DNS records point to ALB
- [ ] CloudFront distribution created (optional)
- [ ] All resources served over HTTPS
- [ ] WebSocket connection tested with WSS

**Converting to HTTPS is straightforward and essential for production! 🔒**
