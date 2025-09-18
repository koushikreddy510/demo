# 🚀 Quick Deploy Cheat Sheet - Machine Coding Round

## ⚡ 5-Minute Backend Deployment

```bash
# 1. Setup
export AWS_PROFILE=your-profile
aws sts get-caller-identity

# 2. Build & Push Backend
cd backend
docker build --platform linux/amd64 -t backend .
aws ecr create-repository --repository-name demo/backend --region us-east-1
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com
docker tag backend:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/demo/backend:latest
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/demo/backend:latest

# 3. ECS Quick Deploy
aws ecs create-cluster --cluster-name demo-cluster --region us-east-1
# Use task-definition.json from repo
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1
# Create ALB + Service (see full README for commands)
```

## ⚡ 3-Minute Frontend Deployment

```bash
# Option 1: ECR (Production)
cd frontend
docker build --platform linux/amd64 -f Dockerfile.production -t frontend .
aws ecr create-repository --repository-name demo/frontend --region us-east-1
docker tag frontend:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest
# Launch EC2 with ECR user data script

# Option 2: Simple (Quick Demo)
npm run build
tar -czf build.tar.gz -C dist .
# Launch EC2, scp build, setup nginx
```

## 🔧 Essential Files Checklist

### Backend Files

- [ ] `backend/src/server.js` - Main app
- [ ] `backend/package.json` - Dependencies
- [ ] `backend/Dockerfile` - Container config
- [ ] `backend/.env` - Environment variables
- [ ] `task-definition.json` - ECS config

### Frontend Files

- [ ] `frontend/src/App.jsx` - React app
- [ ] `frontend/package.json` - Dependencies
- [ ] `frontend/Dockerfile.production` - Multi-stage build
- [ ] `frontend/vite.config.js` - Build config

### Deployment Files

- [ ] `README.md` - Full documentation
- [ ] `ec2-userdata.sh` - EC2 bootstrap script
- [ ] IAM policies for ECR access

## 🧪 Quick Test Commands

```bash
# Backend health
curl http://your-alb-url/healthz

# Frontend check
curl http://your-ec2-ip/

# WebSocket test (browser console)
const ws = new WebSocket('ws://your-alb-url/ws');
ws.onopen = () => ws.send(JSON.stringify({type: 'subscribe', channels: ['test']}));
```

## 🚨 Common Gotchas

1. **Platform mismatch**: Always use `--platform linux/amd64`
2. **Mixed content**: Keep frontend and backend on same protocol (HTTP)
3. **Environment variables**: Update `VITE_API_URL` before frontend build
4. **Security groups**: Open ports 80, 22, 3000 as needed
5. **IAM roles**: EC2 needs ECR access for container deployment

## 📋 Machine Coding Round Strategy

1. **Start with backend** (more complex, get it running first)
2. **Use simple frontend deployment** initially (local build + nginx)
3. **Upgrade to ECR** if time permits
4. **Test WebSocket connection** early and often
5. **Have README ready** to show deployment knowledge

## 🎯 Time Allocation (60 min round)

- **Backend setup**: 20 min
- **Frontend setup**: 15 min
- **Integration & testing**: 15 min
- **Documentation & cleanup**: 10 min

## 💡 Pro Tips

- Keep terminal commands in a script file
- Use environment variables for account IDs
- Test locally with Docker before deploying
- Have backup simple deployment ready
- Show both approaches (local build vs ECR) for bonus points

**Good luck! 🍀**
