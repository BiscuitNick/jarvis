output "instance_id" {
  description = "ID of the Lightsail instance"
  value       = aws_lightsail_instance.jarvis.id
}

output "instance_name" {
  description = "Name of the Lightsail instance"
  value       = aws_lightsail_instance.jarvis.name
}

output "instance_public_ip" {
  description = "Public IP address of the Lightsail instance"
  value       = aws_lightsail_static_ip.jarvis.ip_address
}

output "instance_private_ip" {
  description = "Private IP address of the Lightsail instance"
  value       = aws_lightsail_instance.jarvis.private_ip_address
}

output "ssh_connection_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ${aws_lightsail_key_pair.jarvis.name}.pem ubuntu@${aws_lightsail_static_ip.jarvis.ip_address}"
}

output "ssh_private_key" {
  description = "Private SSH key for instance access (sensitive)"
  value       = aws_lightsail_key_pair.jarvis.private_key
  sensitive   = true
}

output "database_endpoint" {
  description = "Endpoint of the Lightsail PostgreSQL database"
  value       = var.enable_managed_database ? aws_lightsail_database.jarvis[0].master_endpoint_address : "Not created - using containerized DB"
}

output "database_port" {
  description = "Port of the Lightsail PostgreSQL database"
  value       = var.enable_managed_database ? aws_lightsail_database.jarvis[0].master_endpoint_port : "5432"
}

output "database_connection_string" {
  description = "Database connection string (without password)"
  value       = var.enable_managed_database ? "postgresql://${var.db_master_username}:PASSWORD@${aws_lightsail_database.jarvis[0].master_endpoint_address}:${aws_lightsail_database.jarvis[0].master_endpoint_port}/jarvis" : "postgresql://postgres:PASSWORD@localhost:5432/jarvis"
  sensitive   = true
}

output "static_ip_name" {
  description = "Name of the static IP"
  value       = aws_lightsail_static_ip.jarvis.name
}

output "key_pair_name" {
  description = "Name of the SSH key pair"
  value       = aws_lightsail_key_pair.jarvis.name
}
