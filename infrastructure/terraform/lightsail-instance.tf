# SSH Key Pair for Lightsail instance
resource "aws_lightsail_key_pair" "jarvis" {
  name = "${var.project_name}-${var.environment}-keypair"
}

# Lightsail Instance for running Docker services
resource "aws_lightsail_instance" "jarvis" {
  name              = "${var.project_name}-${var.environment}-instance"
  availability_zone = "${var.aws_region}a"
  blueprint_id      = var.instance_blueprint_id
  bundle_id         = var.instance_bundle_id
  key_pair_name     = aws_lightsail_key_pair.jarvis.name

  user_data = templatefile("${path.module}/user-data.sh", {
    project_name = var.project_name
    environment  = var.environment
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Static IP for consistent access
resource "aws_lightsail_static_ip" "jarvis" {
  name = "${var.project_name}-${var.environment}-static-ip"
}

# Attach static IP to instance
resource "aws_lightsail_static_ip_attachment" "jarvis" {
  static_ip_name = aws_lightsail_static_ip.jarvis.name
  instance_name  = aws_lightsail_instance.jarvis.name
}

# Open necessary ports
resource "aws_lightsail_instance_public_ports" "jarvis" {
  instance_name = aws_lightsail_instance.jarvis.name

  # SSH
  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = ["0.0.0.0/0"]
  }

  # HTTP
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }

  # HTTPS
  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }

  # Custom application ports (if needed)
  # WebRTC/TURN
  port_info {
    protocol  = "tcp"
    from_port = 3478
    to_port   = 3478
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    protocol  = "udp"
    from_port = 3478
    to_port   = 3478
    cidrs     = ["0.0.0.0/0"]
  }
}
