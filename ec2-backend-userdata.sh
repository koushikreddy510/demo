#!/bin/bash
# EC2 User Data script to run backend over HTTP

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Login to ECR and run backend container
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 741879316627.dkr.ecr.us-east-1.amazonaws.com

# Run backend container on port 80 (mapped from internal 3000)
docker run -d -p 80:3000 --name plivo-backend \
  -e MONGODB_URI="mongodb+srv://koushik:koushik123@cluster0.qhxqx.mongodb.net/plivo_demo?retryWrites=true&w=majority" \
  -e REDIS_URL="rediss://default:BYlGghoQvlVU8IXKorsg2O3EVpCWEXne@redis-11730.c281.us-east-1-2.ec2.redns.redis-cloud.com:11730" \
  -e CORS_ORIGIN="*" \
  -e PORT="3000" \
  -e MAX_HISTORY="50" \
  741879316627.dkr.ecr.us-east-1.amazonaws.com/demo/pub-sub:latest

# Setup auto-restart
echo "docker start plivo-backend" >> /etc/rc.local
chmod +x /etc/rc.local

# Optional: Install nginx for WebSocket proxy if needed
yum install -y nginx
systemctl start nginx
systemctl enable nginx
