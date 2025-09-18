#!/bin/bash
# EC2 User Data script to serve React frontend over HTTP

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

# Login to ECR and run frontend container
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 741879316627.dkr.ecr.us-east-1.amazonaws.com

# Run frontend container on port 80
docker run -d -p 80:80 --name demo-frontend \
  -e VITE_API_URL=http://plivo-alb-1680385896.us-east-1.elb.amazonaws.com \
  741879316627.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest

# Optional: Setup auto-restart
echo "docker start demo-frontend" >> /etc/rc.local
chmod +x /etc/rc.local

# Log the status
echo "Frontend deployed at http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)" > /var/log/frontend-deployment.log
