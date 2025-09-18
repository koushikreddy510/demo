# Full-Stack WebSocket Pub/Sub Application - AWS Deployment Guide

A complete guide for deploying a React frontend + Node.js backend WebSocket application to AWS, covering both containerized and traditional deployment approaches.

## 🏗️ Architecture Overview

```
┌─────────────────┐    HTTP/WS     ┌─────────────────┐
│   Frontend      │ ──────────────▶ │   Backend       │
│   (React/nginx) │                │   (Node.js)     │
│   EC2/ECR       │                │   ECS + ALB     │
└─────────────────┘                └─────────────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │   Databases     │
                                   │ MongoDB + Redis │
                                   └─────────────────┘
```

## 📋 Prerequisites

- AWS CLI configured with appropriate permissions
- Docker installed locally
- Node.js 18+ and npm
- Git repository

## 🚀 Quick Start Commands

### Initial Setup

```bash
# Clone and setup
git clone <your-repo>
cd <project-directory>

# AWS Profile setup (if needed)
export AWS_PROFILE=your-profile-name
aws sts get-caller-identity  # Verify credentials
```

## 🔧 Backend Deployment (Node.js + ECS)

### 1. Backend Application Structure

```
backend/
├── src/
│   └── server.js          # Main application
├── package.json           # Dependencies
├── Dockerfile            # Container definition
├── .env                  # Environment variables
└── .dockerignore         # Docker ignore rules
```

### 2. Backend Environment Setup

```bash
# Create backend/.env file
cat > backend/.env << EOF
CORS_ORIGIN=*
PORT=3000
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority
MONGODB_DB=your_db_name
MONGODB_COLLECTION=messages
REDIS_URL=rediss://default:password@host:port
MAX_HISTORY=50
EOF
```

### 3. Backend Docker Build & Push

```bash
# Build Docker image
cd backend
docker build --platform linux/amd64 -t your-backend .

# Create ECR repository
aws ecr create-repository --repository-name demo/backend --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag your-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/backend:latest
```

### 4. ECS Infrastructure Setup

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name your-cluster --region us-east-1

# Create task definition
cat > task-definition.json << EOF
{
  "family": "your-backend-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "your-backend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/backend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "MONGODB_URI", "value": "your-mongodb-uri"},
        {"name": "REDIS_URL", "value": "your-redis-url"},
        {"name": "CORS_ORIGIN", "value": "*"},
        {"name": "PORT", "value": "3000"},
        {"name": "MAX_HISTORY", "value": "50"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/your-backend-task",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1
```

### 5. Application Load Balancer Setup

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name your-alb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx \
  --region us-east-1

# Create target group
aws elbv2 create-target-group \
  --name your-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxx \
  --target-type ip \
  --health-check-path /healthz \
  --region us-east-1

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:... \
  --region us-east-1
```

### 6. ECS Service Creation

```bash
# Create ECS service with load balancer
aws ecs create-service \
  --cluster your-cluster \
  --service-name your-backend-service \
  --task-definition your-backend-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=your-backend,containerPort=3000 \
  --region us-east-1
```

## 🎨 Frontend Deployment Options

### Option A: ECR-Based Deployment (Recommended)

#### 1. Frontend Docker Setup

```bash
# Create production Dockerfile
cat > frontend/Dockerfile.production << EOF
# Multi-stage build for React frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://your-alb-url.elb.amazonaws.com
ENV VITE_API_URL=\$VITE_API_URL
RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen 80; server_name _; root /usr/share/nginx/html; index index.html; location / { try_files \$uri \$uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF
```

#### 2. Build and Push Frontend

```bash
cd frontend
docker build --platform linux/amd64 -f Dockerfile.production -t your-frontend .

# Create ECR repository
aws ecr create-repository --repository-name demo/frontend --region us-east-1

# Tag and push
docker tag your-frontend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest
```

#### 3. EC2 Deployment with ECR

```bash
# Create IAM role for ECR access
cat > ec2-ecr-role-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role --role-name EC2-ECR-Access-Role --assume-role-policy-document file://ec2-ecr-role-policy.json

# Create ECR access policy
cat > ecr-access-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy --role-name EC2-ECR-Access-Role --policy-name ECR-Access-Policy --policy-document file://ecr-access-policy.json

# Create instance profile
aws iam create-instance-profile --instance-profile-name EC2-ECR-Instance-Profile
aws iam add-role-to-instance-profile --instance-profile-name EC2-ECR-Instance-Profile --role-name EC2-ECR-Access-Role

# Create security group
aws ec2 create-security-group --group-name frontend-http-sg --description "Frontend HTTP access" --region us-east-1
aws ec2 authorize-security-group-ingress --group-id sg-xxx --protocol tcp --port 80 --cidr 0.0.0.0/0 --region us-east-1
aws ec2 authorize-security-group-ingress --group-id sg-xxx --protocol tcp --port 22 --cidr 0.0.0.0/0 --region us-east-1

# Create user data script
cat > ec2-userdata.sh << EOF
#!/bin/bash
yum update -y
yum install -y docker
systemctl start docker
systemctl enable docker
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker run -d -p 80:80 --name frontend --restart unless-stopped <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest
EOF

# Launch EC2 instance
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t3.micro \
  --key-name your-key \
  --security-group-ids sg-xxx \
  --iam-instance-profile Name=EC2-ECR-Instance-Profile \
  --user-data file://ec2-userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=your-frontend}]' \
  --region us-east-1
```

### Option B: Local Build Deployment

#### 1. Build Locally and Deploy

```bash
cd frontend
npm run build

# Create deployment package
tar -czf frontend-build.tar.gz -C dist .

# Launch basic EC2 instance
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t3.micro \
  --key-name your-key \
  --security-group-ids sg-xxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=your-frontend-simple}]' \
  --region us-east-1

# Copy and deploy
scp -i your-key.pem frontend-build.tar.gz ec2-user@<public-ip>:~
ssh -i your-key.pem ec2-user@<public-ip> "
  sudo amazon-linux-extras install -y nginx1
  sudo tar -xzf frontend-build.tar.gz -C /usr/share/nginx/html/
  sudo systemctl start nginx
  sudo systemctl enable nginx
"
```

## 🔧 Environment Configuration

### Frontend Environment Variables

```bash
# For build-time configuration
VITE_API_URL=http://your-backend-alb-url.elb.amazonaws.com
```

### Backend Environment Variables

```bash
CORS_ORIGIN=*
PORT=3000
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://...
MAX_HISTORY=50
```

## 🧪 Testing Your Deployment

### Backend Health Check

```bash
curl http://your-alb-url.elb.amazonaws.com/healthz
# Should return: ok

curl http://your-alb-url.elb.amazonaws.com/metrics
# Should return: JSON with connection stats
```

### Frontend Access

```bash
curl http://your-frontend-ip/
# Should return: HTML with React app

# Test WebSocket connection in browser console:
const ws = new WebSocket('ws://your-alb-url.elb.amazonaws.com/ws');
ws.onopen = () => console.log('Connected');
ws.send(JSON.stringify({type: 'subscribe', channels: ['test']}));
```

### Full Integration Test

1. Open frontend URL in browser
2. Click "Connect" - should show "Connected" status
3. Type message and click "Publish"
4. Open another tab - should see real-time messages
5. Check browser Network tab for WebSocket connection

## 🚨 Troubleshooting

### Common Issues

#### Mixed Content Error (HTTPS/HTTP)

```
Error: Mixed Content - HTTPS page loading HTTP resources
Solution: Ensure both frontend and backend use same protocol (HTTP or HTTPS)
```

#### WebSocket Connection Failed

```bash
# Check backend logs
aws ecs describe-services --cluster your-cluster --services your-backend-service
aws logs get-log-events --log-group-name /ecs/your-backend-task --log-stream-name ...

# Check ALB health
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:...
```

#### Docker Build Issues

```bash
# Platform mismatch (M1 Mac → x86 AWS)
docker build --platform linux/amd64 -t your-app .

# Dependency issues
docker build --no-cache -t your-app .
```

#### ECR Access Denied

```bash
# Re-login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Check IAM permissions
aws sts get-caller-identity
```

## 📝 Deployment Checklist

### Pre-deployment

- [ ] AWS CLI configured and authenticated
- [ ] Environment variables configured
- [ ] Database connections tested (MongoDB, Redis)
- [ ] Docker images built and tested locally

### Backend Deployment

- [ ] ECR repository created
- [ ] Docker image pushed to ECR
- [ ] ECS cluster created
- [ ] Task definition registered
- [ ] ALB and target group configured
- [ ] Security groups configured (port 80, 3000)
- [ ] ECS service created and running
- [ ] Health check endpoint responding

### Frontend Deployment

- [ ] Frontend built with correct API URL
- [ ] ECR repository created (if using ECR approach)
- [ ] IAM roles configured for EC2 ECR access
- [ ] Security group configured (port 80, 22)
- [ ] EC2 instance launched and running
- [ ] nginx serving React app
- [ ] WebSocket connection working

### Post-deployment Testing

- [ ] Backend health check: `GET /healthz`
- [ ] Frontend loads correctly
- [ ] WebSocket connection established
- [ ] Real-time messaging works across tabs
- [ ] Message history loads correctly

## 🔄 Updates and Maintenance

### Backend Updates

```bash
# Build new version
docker build --platform linux/amd64 -t your-backend:v2 .
docker tag your-backend:v2 <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/backend:v2
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/backend:v2

# Update ECS service
aws ecs update-service --cluster your-cluster --service your-backend-service --force-new-deployment
```

### Frontend Updates

```bash
# ECR approach
docker build --platform linux/amd64 -f Dockerfile.production -t your-frontend:v2 .
docker tag your-frontend:v2 <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:v2
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:v2

# Update EC2 container
ssh -i your-key.pem ec2-user@<public-ip> "
  docker pull <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:v2
  docker stop frontend
  docker rm frontend
  docker run -d -p 80:80 --name frontend --restart unless-stopped <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:v2
"
```

## 💰 Cost Optimization

### Development Environment

- Use t3.micro instances (free tier eligible)
- Single AZ deployment
- Minimal ECS tasks (1 instance)

### Production Environment

- Multi-AZ deployment for high availability
- Auto Scaling Groups for frontend
- ECS Service Auto Scaling for backend
- CloudFront for frontend caching
- RDS/DocumentDB for managed databases

## 🏆 Best Practices

1. **Security**: Use IAM roles, security groups, and environment variables
2. **Monitoring**: Set up CloudWatch logs and alarms
3. **Backup**: Regular database backups
4. **CI/CD**: Automate deployments with GitHub Actions or CodePipeline
5. **Scaling**: Use Auto Scaling Groups and ECS Service Auto Scaling
6. **Caching**: Implement Redis caching and CloudFront CDN

---

## 📚 Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS ECR Documentation](https://docs.aws.amazon.com/ecr/)
- [Docker Multi-stage Builds](https://docs.docker.com/develop/dev-best-practices/dockerfile_best-practices/)
- [React Deployment Guide](https://create-react-app.dev/docs/deployment/)

**Happy Deploying! 🚀**
