variable "aws_region" {
  description = "AWS region for Lightsail resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "jarvis"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "instance_bundle_id" {
  description = "Lightsail instance bundle ID (determines CPU, RAM, storage)"
  type        = string
  default     = "medium_3_0" # 2 vCPU, 4 GB RAM, 80 GB SSD - $20/month
  # Options:
  # nano_3_0: 0.5 vCPU, 512 MB RAM, 20 GB SSD - $3.50/month
  # micro_3_0: 1 vCPU, 1 GB RAM, 40 GB SSD - $5/month
  # small_3_0: 1 vCPU, 2 GB RAM, 60 GB SSD - $10/month
  # medium_3_0: 2 vCPU, 4 GB RAM, 80 GB SSD - $20/month
  # large_3_0: 2 vCPU, 8 GB RAM, 160 GB SSD - $40/month
}

variable "instance_blueprint_id" {
  description = "Lightsail OS/app blueprint"
  type        = string
  default     = "ubuntu_22_04"
}

variable "ssh_key_pair_name" {
  description = "Name for the SSH key pair"
  type        = string
  default     = "jarvis-lightsail-key"
}

variable "db_bundle_id" {
  description = "Lightsail database bundle ID"
  type        = string
  default     = "micro_2_0" # 1 vCPU, 1 GB RAM, 40 GB SSD - $15/month
  # Options:
  # micro_2_0: 1 vCPU, 1 GB RAM, 40 GB SSD - $15/month
  # small_2_0: 1 vCPU, 2 GB RAM, 80 GB SSD - $30/month
  # medium_2_0: 2 vCPU, 4 GB RAM, 120 GB SSD - $60/month
}

variable "db_master_username" {
  description = "Master username for database"
  type        = string
  default     = "jarvisadmin"
}

variable "db_master_password" {
  description = "Master password for database (use env var or secrets manager)"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for the application (optional)"
  type        = string
  default     = ""
}

variable "enable_managed_database" {
  description = "Enable Lightsail managed PostgreSQL database"
  type        = bool
  default     = true
}
