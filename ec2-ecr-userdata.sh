#!/bin/bash
# EC2 User Data script to deploy React frontend from ECR

# Log everything
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting ECR-based frontend deployment at $(date)"

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Wait for Docker to be ready
sleep 10

# Create IAM role for ECR access (this would normally be attached to the instance)
# For now, we'll use the existing credentials

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 741879316627.dkr.ecr.us-east-1.amazonaws.com

# Pull and run frontend container from ECR
docker pull 741879316627.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest

# Stop any existing containers
docker stop demo-frontend 2>/dev/null || true
docker rm demo-frontend 2>/dev/null || true

# Run the new container
docker run -d -p 80:80 --name demo-frontend --restart unless-stopped \
  741879316627.dkr.ecr.us-east-1.amazonaws.com/demo/frontend:latest

# Log completion
echo "ECR-based frontend deployment completed at $(date)"
echo "Container status:"
docker ps | grep demo-frontend
echo "Access at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
