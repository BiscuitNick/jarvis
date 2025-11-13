# Lightsail Managed PostgreSQL Database (optional)
resource "aws_lightsail_database" "jarvis" {
  count = var.enable_managed_database ? 1 : 0

  relational_database_name = "${var.project_name}-${var.environment}-db"
  availability_zone        = "${var.aws_region}a"
  master_database_name     = "jarvis"
  master_username          = var.db_master_username
  master_password          = var.db_master_password

  blueprint_id = "postgres_15"
  bundle_id    = var.db_bundle_id

  backup_retention_enabled = true
  preferred_backup_window  = "03:00-04:00"  # UTC
  preferred_maintenance_window = "sun:04:00-sun:05:00"  # UTC

  publicly_accessible = false

  # Apply immediately for dev environment
  apply_immediately = var.environment == "dev" ? true : false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Allow Lightsail instance to connect to database
# NOTE: This resource type doesn't exist in AWS provider
# Database access is managed through network security groups instead
# resource "aws_lightsail_database_security_group_rule" "allow_instance" {
#   count = var.enable_managed_database ? 1 : 0
#
#   database_name = aws_lightsail_database.jarvis[0].relational_database_name
#
#   # Allow traffic from the Lightsail instance
#   source_instance_name = aws_lightsail_instance.jarvis.name
# }
